import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEquipmentSchema, insertSystemSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Get all equipment
  app.get("/api/equipment", async (req, res) => {
    try {
      const equipment = await storage.getAllEquipment();
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ error: "Failed to fetch equipment" });
    }
  });

  // Get single equipment
  app.get("/api/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.getEquipment(req.params.id);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ error: "Failed to fetch equipment" });
    }
  });

  // Create equipment
  app.post("/api/equipment", async (req, res) => {
    try {
      const validatedData = insertEquipmentSchema.parse(req.body);
      const equipment = await storage.createEquipment(validatedData);
      res.status(201).json(equipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating equipment:", error);
      res.status(500).json({ error: "Failed to create equipment" });
    }
  });

  // Update equipment
  app.patch("/api/equipment/:id", async (req, res) => {
    try {
      const equipment = await storage.updateEquipment(req.params.id, req.body);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      console.error("Error updating equipment:", error);
      res.status(500).json({ error: "Failed to update equipment" });
    }
  });

  // Delete equipment
  app.delete("/api/equipment/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEquipment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting equipment:", error);
      res.status(500).json({ error: "Failed to delete equipment" });
    }
  });

  // System checkout
  app.post("/api/equipment/checkout/system", async (req, res) => {
    try {
      const { systemColor, equipmentIds, workOrder, techName } = req.body;
      
      if (!systemColor || !equipmentIds || !workOrder || !techName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const checkedOutAt = new Date();
      const systemNotes = `Checked out under WO ${workOrder} as part of ${systemColor} System by ${techName}`;
      
      // Update all equipment in the system
      const updatedEquipment = await Promise.all(
        equipmentIds.map(async (id: string) => {
          const existing = await storage.getEquipment(id);
          if (!existing) {
            throw new Error(`Equipment not found: ${id}`);
          }

          const updatePayload: Partial<InsertEquipment> = {
            status: 'checked_out',
            workOrder,
            checkedOutBy: techName,
            checkedOutAt,
            notes: systemNotes,
          };

          if (existing.category === "Computer") {
            updatePayload.systemColor = systemColor;
            updatePayload.temporarySystemColor = undefined;
          } else {
            updatePayload.temporarySystemColor = systemColor;
          }

          const equipment = await storage.updateEquipment(id, updatePayload);
          
          // Add history entry
          await storage.addEquipmentHistory({
            equipmentId: id,
            action: 'check_out',
            details: `Checked out as part of ${systemColor} System by ${techName}`,
            workOrder,
          });
          
          return equipment;
        })
      );

      res.json(updatedEquipment);
    } catch (error) {
      console.error("Error checking out system:", error);
      res.status(500).json({ error: "Failed to check out system" });
    }
  });

  // System check-in by work order
  app.post("/api/equipment/checkin/workorder", async (req, res) => {
    try {
      const { workOrder, itemReports } = req.body;
      
      if (!workOrder || !itemReports) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get all equipment for this work order
      const equipment = await storage.getEquipmentByWorkOrder(workOrder);
      
      if (equipment.length === 0) {
        return res.status(404).json({ error: "No equipment found for this work order" });
      }

      // Update each item
      const updatedEquipment = await Promise.all(
        equipment.map(async (item) => {
          const report = itemReports[item.id] || { isBroken: false, notes: '' };
          const newStatus = report.isBroken ? 'broken' : 'available';
          const action = report.isBroken ? 'report_broken' : 'check_in';
          const baseNotes =
            report.notes || (report.isBroken ? 'Reported broken during system check-in' : 'Returned via system check-in');
          const notes = `WO ${workOrder}: ${baseNotes}`;

          const updated = await storage.updateEquipment(item.id, {
            status: newStatus,
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            notes,
          });

          if (item.temporarySystemColor) {
            await storage.updateEquipment(item.id, {
              temporarySystemColor: null,
              swappedFromId: null,
              status: 'available',
            });
            if (item.swappedFromId) {
              await storage.updateEquipment(item.swappedFromId, {
                replacementId: null,
              });
            }
          }

          // Add history entry
          await storage.addEquipmentHistory({
            equipmentId: item.id,
            action,
            details: notes,
            workOrder,
          });

          return updated;
        })
      );

      res.json(updatedEquipment);
    } catch (error) {
      console.error("Error checking in by work order:", error);
      res.status(500).json({ error: "Failed to check in equipment" });
    }
  });

  // Single item checkout
  app.post("/api/equipment/:id/checkout", async (req, res) => {
    try {
      const { workOrder, techName } = req.body;
      
      if (!workOrder || !techName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const equipment = await storage.updateEquipment(req.params.id, {
        status: 'checked_out',
        workOrder,
        checkedOutBy: techName,
        checkedOutAt: new Date(),
        notes: `Checked out under WO ${workOrder} by ${techName}`,
      });

      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      // Add history entry
      await storage.addEquipmentHistory({
        equipmentId: req.params.id,
        action: 'check_out',
        details: `Checked out by ${techName}`,
        workOrder,
      });

      res.json(equipment);
    } catch (error) {
      console.error("Error checking out equipment:", error);
      res.status(500).json({ error: "Failed to check out equipment" });
    }
  });

  // Single item check-in
  app.post("/api/equipment/:id/checkin", async (req, res) => {
    try {
      const { notes, isBroken } = req.body;
      const newStatus = isBroken ? 'broken' : 'available';
      const action = isBroken ? 'report_broken' : 'check_in';
      const existing = await storage.getEquipment(req.params.id);

      if (!existing) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      const workOrder = existing.workOrder;
      const notesPrefix = workOrder ? `WO ${workOrder}: ` : "";
      const combinedNotes =
        notes ? `${notesPrefix}${notes}` : `${notesPrefix}${isBroken ? "Reported broken" : "Returned"}`;

      const equipment = await storage.updateEquipment(req.params.id, {
        status: newStatus,
        workOrder: null,
        checkedOutBy: null,
        checkedOutAt: null,
        notes: combinedNotes || undefined,
      });

      if (equipment?.temporarySystemColor) {
        await storage.updateEquipment(req.params.id, {
          temporarySystemColor: null,
          swappedFromId: null,
          status: 'available',
        });
        if (equipment.swappedFromId) {
          await storage.updateEquipment(equipment.swappedFromId, {
            replacementId: null,
          });
        }
      }

      // Add history entry
      await storage.addEquipmentHistory({
        equipmentId: req.params.id,
        action,
        details: combinedNotes,
      });

      res.json(equipment);
    } catch (error) {
      console.error("Error checking in equipment:", error);
      res.status(500).json({ error: "Failed to check in equipment" });
    }
  });

  // Swap equipment component
  app.post("/api/equipment/swap", async (req, res) => {
    try {
      const { brokenId, replacementId, context, reason } = req.body as {
        brokenId?: string;
        replacementId?: string;
        context?: "broken" | "checked_out";
        reason?: string;
      };

      if (!brokenId || !replacementId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const brokenItem = await storage.getEquipment(brokenId);
      const replacementItem = await storage.getEquipment(replacementId);

      if (!brokenItem || !replacementItem) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      const reasonText = reason?.trim();
      const reasonDetails = reasonText ? `Swap reason: ${reasonText}` : "Swap reason: not provided";
      const brokenNotes = [brokenItem.notes, reasonDetails].filter(Boolean).join(" | ");

      await storage.updateEquipment(brokenId, {
        status: "broken",
        location: "Shop",
        workOrder: null,
        checkedOutBy: null,
        checkedOutAt: null,
        replacementId: replacementId,
        notes: brokenNotes || undefined,
      });

      const replacementPayload: Partial<InsertEquipment> = {
        temporarySystemColor: brokenItem.systemColor ?? undefined,
        originalSystemColor: replacementItem.originalSystemColor || replacementItem.systemColor || undefined,
        swappedFromId: brokenId,
      };

      if (context === "checked_out") {
        replacementPayload.status = "checked_out";
        replacementPayload.workOrder = brokenItem.workOrder || undefined;
        replacementPayload.checkedOutBy = brokenItem.checkedOutBy || undefined;
        replacementPayload.checkedOutAt = brokenItem.checkedOutAt ?? new Date();
      }

      await storage.updateEquipment(replacementId, replacementPayload);

      await storage.addEquipmentHistory({
        equipmentId: brokenId,
        action: "swap_out",
        details: `${replacementId} borrowed. ${reasonDetails}`,
        workOrder: brokenItem.workOrder || undefined,
      });

      await storage.addEquipmentHistory({
        equipmentId: replacementId,
        action: "swap_in",
        details: `${brokenId} replaced. ${reasonDetails}`,
        workOrder: brokenItem.workOrder || undefined,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("Error swapping equipment:", error);
      res.status(500).json({ error: "Failed to swap equipment" });
    }
  });

  // Get equipment history
  app.get("/api/equipment/:id/history", async (req, res) => {
    try {
      const history = await storage.getEquipmentHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Get recent equipment history
  app.get("/api/equipment/history/recent", async (req, res) => {
    try {
      const limit = Number.parseInt(req.query.limit as string, 10);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 25) : 5;
      const history = await storage.getRecentEquipmentHistory(safeLimit);
      res.json(history);
    } catch (error) {
      console.error("Error fetching recent history:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // ==================== SYSTEMS ROUTES ====================

  // Get all systems
  app.get("/api/systems", async (req, res) => {
    try {
      const systems = await storage.getAllSystems();
      res.json(systems);
    } catch (error) {
      console.error("Error fetching systems:", error);
      res.status(500).json({ error: "Failed to fetch systems" });
    }
  });

  // Create system
  app.post("/api/systems", async (req, res) => {
    try {
      const validatedData = insertSystemSchema.parse(req.body);
      const system = await storage.createSystem(validatedData);
      res.status(201).json(system);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating system:", error);
      res.status(500).json({ error: "Failed to create system" });
    }
  });

  // Update system
  app.patch("/api/systems/:id", async (req, res) => {
    try {
      const system = await storage.updateSystem(req.params.id, req.body);
      if (!system) {
        return res.status(404).json({ error: "System not found" });
      }
      res.json(system);
    } catch (error) {
      console.error("Error updating system:", error);
      res.status(500).json({ error: "Failed to update system" });
    }
  });

  // Delete system
  app.delete("/api/systems/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSystem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "System not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting system:", error);
      res.status(500).json({ error: "Failed to delete system" });
    }
  });

  return httpServer;
}
