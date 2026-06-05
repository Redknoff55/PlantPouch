import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertEquipmentSchema,
  insertSystemSchema,
  insertSystemConfigSchema,
  insertStagedSystemSchema,
  insertOutageLocationNoteSchema,
  type InsertEquipment,
} from "@shared/schema";
import { brandingSchema } from "@shared/branding";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const parseDueDateString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("-")) {
    const parsedIso = new Date(trimmed);
    if (!Number.isNaN(parsedIso.getTime())) {
      return parsedIso;
    }
  }
  const [monthRaw, dayRaw, yearRaw] = trimmed.split("/");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (!month || !day || !year) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const isCheckoutNote = (notes?: string | null) =>
  typeof notes === "string" && /^Checked out under WO\b/i.test(notes.trim());

const brandingPath = process.env.BRANDING_PATH || path.join(process.cwd(), "data", "branding.json");

const loadBrandingOverrides = async () => {
  try {
    const raw = await readFile(brandingPath, "utf-8");
    return brandingSchema.partial().parse(JSON.parse(raw));
  } catch {
    return {};
  }
};

const saveBrandingOverrides = async (overrides: unknown) => {
  const validated = brandingSchema.parse(overrides);
  await mkdir(path.dirname(brandingPath), { recursive: true });
  await writeFile(brandingPath, JSON.stringify(validated, null, 2), "utf-8");
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/branding", async (_req, res) => {
    try {
      const overrides = await loadBrandingOverrides();
      res.json(overrides);
    } catch (error) {
      console.error("Error loading branding:", error);
      res.status(500).json({ error: "Failed to load branding" });
    }
  });

  app.put("/api/branding", async (req, res) => {
    try {
      const overrides = req.body ?? {};
      await saveBrandingOverrides(overrides);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error saving branding:", error);
      res.status(500).json({ error: "Failed to save branding" });
    }
  });
  
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
      const payload = { ...req.body } as Partial<InsertEquipment>;
      const dueDateInput: unknown = req.body?.dueDate;
      if (typeof dueDateInput === "string") {
        const trimmed = dueDateInput.trim();
        if (!trimmed) {
          delete payload.dueDate;
        } else {
          const parsed = parseDueDateString(trimmed);
          if (!parsed) {
            return res.status(400).json({ error: "Due Date must be MM/DD/YYYY." });
          }
          payload.dueDate = parsed;
        }
      }
      const validatedData = insertEquipmentSchema.parse(payload);
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
      const currentId = req.params.id;
      const existing = await storage.getEquipment(currentId);
      if (!existing) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      const updatePayload = { ...req.body } as Partial<InsertEquipment>;
      const dueDateInput: unknown = req.body?.dueDate;
      if (typeof dueDateInput === "string") {
        const trimmed = dueDateInput.trim();
        if (!trimmed) {
          updatePayload.dueDate = null;
        } else {
          const parsed = parseDueDateString(trimmed);
          if (!parsed) {
            return res.status(400).json({ error: "Due Date must be MM/DD/YYYY." });
          }
          updatePayload.dueDate = parsed;
        }
      }
      const requestedIdRaw =
        typeof updatePayload.id === "string" ? updatePayload.id.trim() : "";

      if (typeof updatePayload.id !== "undefined") {
        if (!requestedIdRaw) {
          return res.status(400).json({ error: "Equipment ID is required." });
        }
        if (requestedIdRaw !== currentId) {
          const conflict = await storage.getEquipment(requestedIdRaw);
          if (conflict) {
            return res.status(400).json({ error: "Another item already uses that ID." });
          }
          const history = await storage.getEquipmentHistory(currentId);
          if (history.length > 0 || existing.replacementId || existing.swappedFromId) {
            return res.status(400).json({ error: "Cannot change ID once linked to history or replacements." });
          }
          const equipment = await storage.getAllEquipment();
          const isLinked = equipment.some(
            (item) => item.replacementId === currentId || item.swappedFromId === currentId
          );
          if (isLinked) {
            return res.status(400).json({ error: "Cannot change ID once linked to history or replacements." });
          }
          updatePayload.id = requestedIdRaw;
        } else {
          delete updatePayload.id;
        }
      }

      if (updatePayload.status === "available") {
        updatePayload.workOrder = null;
        updatePayload.checkedOutBy = null;
        updatePayload.checkedOutAt = null;
        if (typeof updatePayload.notes === "undefined" && isCheckoutNote(existing.notes)) {
          updatePayload.notes = null;
        }
      }

      if (updatePayload.location === "Shop" && updatePayload.status === "available") {
        updatePayload.temporarySystemColor = null;
        updatePayload.swappedFromId = null;
      }

      const equipment = await storage.updateEquipment(currentId, updatePayload);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      console.error("Error updating equipment:", error);
      res.status(500).json({ error: "Failed to update equipment" });
    }
  });

  app.post("/api/equipment/cleanup/stale-checkout-notes", async (_req, res) => {
    try {
      const allEquipment = await storage.getAllEquipment();
      const staleItems = allEquipment.filter((item) => {
        const hasOpenWorkOrder = typeof item.workOrder === "string" && item.workOrder.trim().length > 0;
        return item.status === "available" && !hasOpenWorkOrder && isCheckoutNote(item.notes);
      });

      await Promise.all(
        staleItems.map((item) =>
          storage.updateEquipment(item.id, {
            notes: null,
            ...(item.location === "Shop"
              ? {
                  temporarySystemColor: null,
                  swappedFromId: null,
                }
              : {}),
          })
        )
      );

      res.json({ updatedCount: staleItems.length });
    } catch (error) {
      console.error("Error cleaning stale checkout notes:", error);
      res.status(500).json({ error: "Failed to clean stale checkout notes" });
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
      const { systemColor, equipmentIds, workOrder, techName, valveNumber } = req.body;
      
      if (!systemColor || !equipmentIds || !workOrder || !techName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const checkedOutAt = new Date();
      const normalizedValveNumber =
        typeof valveNumber === "string" && valveNumber.trim() ? valveNumber.trim() : null;
      const valveSuffix = normalizedValveNumber ? `, Valve # ${normalizedValveNumber}` : "";
      const systemNotes = `Checked out under WO ${workOrder}${valveSuffix} as part of ${systemColor} System by ${techName}`;
      
      const bagColors = new Set<string>();
      let computerId: string | null = null;
      let computerLocation = "Shop";

      // Update all equipment in the system
      const updatedEquipment = await Promise.all(
        equipmentIds.map(async (id: string) => {
          const existing = await storage.getEquipment(id);
          if (!existing) {
            throw new Error(`Equipment not found: ${id}`);
          }

          if (existing.category === "Computer") {
            computerId = existing.id;
            computerLocation = existing.location || "Shop";
          } else if (existing.systemColor) {
            bagColors.add(existing.systemColor);
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
            details: `Checked out as part of ${systemColor} System${valveSuffix} by ${techName}`,
            workOrder,
          });
          
          return equipment;
        })
      );

      if (computerId) {
        await storage.deleteStagedSystem(systemColor);
        const bagLabel =
          bagColors.size > 0 ? `${Array.from(bagColors).join(", ")} bag` : "bag";
        const details = `${techName} checked out ${systemColor} system, ${bagLabel}, from ${computerLocation}${normalizedValveNumber ? ` (Valve # ${normalizedValveNumber})` : ""}.`;
        await storage.addEquipmentHistory({
          equipmentId: computerId,
          action: 'system_check_out',
          details,
          workOrder,
        });
      }

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

      const bagColors = new Set<string>();
      const brokenItems: Array<{ id: string; name: string }> = [];
      let computerId: string | null = null;
      let computerColor = "Unassigned";
      let computerLocation = "Shop";
      let checkoutTech = "Unknown tech";

      // Update each item
      const updatedEquipment = await Promise.all(
        equipment.map(async (item) => {
          const report = itemReports[item.id] || { isBroken: false, notes: '' };
          const newStatus = report.isBroken ? 'broken' : 'available';
          const action = report.isBroken ? 'report_broken' : 'check_in';
          const baseNotes =
            report.notes || (report.isBroken ? 'Reported broken during system check-in' : 'Returned via system check-in');
          const notes = `WO ${workOrder}: ${baseNotes}`;

          if (item.category === "Computer") {
            computerId = item.id;
            computerColor = item.systemColor || "Unassigned";
            computerLocation = item.location || "Shop";
            checkoutTech = item.checkedOutBy || "Unknown tech";
          } else if (item.systemColor) {
            bagColors.add(item.systemColor);
          }

          if (report.isBroken) {
            brokenItems.push({ id: item.id, name: item.name });
          }

          const updated = await storage.updateEquipment(item.id, {
            status: newStatus,
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            location: report.isBroken ? "Waiting on Repairs" : item.location,
            notes,
          });

          const isBorrowedAssignment =
            !!item.temporarySystemColor && item.temporarySystemColor !== item.systemColor;

          if (!isBorrowedAssignment && item.temporarySystemColor) {
            await storage.updateEquipment(item.id, {
              temporarySystemColor: null,
              swappedFromId: null,
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

      if (computerId) {
        const bagLabel =
          bagColors.size > 0 ? `${Array.from(bagColors).join(", ")} bag` : "bag";
        const brokenLabel =
          brokenItems.length > 0
            ? ` Broken: ${brokenItems
                .map((entry) => `${entry.id} ${entry.name}`)
                .join(", ")}.`
            : " Returned in good condition.";
        const details = `${checkoutTech} checked in ${computerColor} system and ${bagLabel} to ${computerLocation}.${brokenLabel}`;
        await storage.addEquipmentHistory({
          equipmentId: computerId,
          action: 'system_check_in',
          details,
          workOrder,
        });
      }

      res.json(updatedEquipment);
    } catch (error) {
      console.error("Error checking in by work order:", error);
      res.status(500).json({ error: "Failed to check in equipment" });
    }
  });

  // Single item checkout
  app.post("/api/equipment/:id/checkout", async (req, res) => {
    try {
      const { workOrder, techName, valveNumber } = req.body;
      
      if (!workOrder || !techName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const normalizedValveNumber =
        typeof valveNumber === "string" && valveNumber.trim() ? valveNumber.trim() : null;
      const valveSuffix = normalizedValveNumber ? `, Valve # ${normalizedValveNumber}` : "";

      const equipment = await storage.updateEquipment(req.params.id, {
        status: 'checked_out',
        workOrder,
        checkedOutBy: techName,
        checkedOutAt: new Date(),
        notes: `Checked out under WO ${workOrder}${valveSuffix} by ${techName}`,
      });

      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }

      // Add history entry
      await storage.addEquipmentHistory({
        equipmentId: req.params.id,
        action: 'check_out',
        details: `Checked out${normalizedValveNumber ? ` for Valve # ${normalizedValveNumber}` : ""} by ${techName}`,
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
        location: isBroken ? "Waiting on Repairs" : existing.location,
        notes: combinedNotes || undefined,
      });

          const isBorrowedAssignment =
            !!equipment?.temporarySystemColor &&
            equipment.temporarySystemColor !== equipment.systemColor;

          if (!isBorrowedAssignment && equipment?.temporarySystemColor) {
            await storage.updateEquipment(req.params.id, {
              temporarySystemColor: null,
              swappedFromId: null,
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

  app.get("/api/system-configs", async (_req, res) => {
    try {
      const configs = await storage.getAllSystemConfigs();
      res.json(configs);
    } catch (error) {
      console.error("Error fetching system configs:", error);
      res.status(500).json({ error: "Failed to fetch system configs" });
    }
  });

  app.get("/api/system-configs/:color", async (req, res) => {
    try {
      const config = await storage.getSystemConfig(req.params.color);
      if (!config) {
        return res.status(404).json({ error: "System config not found" });
      }
      res.json(config);
    } catch (error) {
      console.error("Error fetching system config:", error);
      res.status(500).json({ error: "Failed to fetch system config" });
    }
  });

  app.put("/api/system-configs/:color", async (req, res) => {
    try {
      const validated = insertSystemConfigSchema.parse({
        ...req.body,
        systemColor: req.params.color,
      });
      const config = await storage.upsertSystemConfig(validated);
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error saving system config:", error);
      res.status(500).json({ error: "Failed to save system config" });
    }
  });

  app.get("/api/staged-systems", async (_req, res) => {
    try {
      const stagedSystems = await storage.getAllStagedSystems();
      res.json(stagedSystems);
    } catch (error) {
      console.error("Error fetching staged systems:", error);
      res.status(500).json({ error: "Failed to fetch staged systems" });
    }
  });

  app.put("/api/staged-systems/:color", async (req, res) => {
    try {
      const validated = insertStagedSystemSchema.parse({
        ...req.body,
        systemColor: req.params.color,
        targetDate: req.body?.targetDate ? new Date(req.body.targetDate) : null,
      });

      const stagedSystem = await storage.upsertStagedSystem(validated);
      const allEquipment = await storage.getAllEquipment();
      const systemItems = allEquipment.filter(
        (item) => (item.temporarySystemColor || item.systemColor) === req.params.color
      );
      const stageDetails = `${validated.stagedBy} staged ${req.params.color} system at ${validated.stagingLocation}${validated.valveNumber ? ` for valve ${validated.valveNumber}` : ""}${validated.notes ? ` (${validated.notes})` : ""}`;

      await Promise.all(
        systemItems.map((item) =>
          storage.updateEquipment(item.id, {
            status: "available",
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            notes: stageDetails,
          })
        )
      );

      await Promise.all(
        systemItems.map((item) =>
          storage.addEquipmentHistory({
            equipmentId: item.id,
            action: "stage",
            details: stageDetails,
            workOrder: item.workOrder || validated.sourceWorkOrder || undefined,
          })
        )
      );

      res.json(stagedSystem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error saving staged system:", error);
      res.status(500).json({ error: "Failed to save staged system" });
    }
  });

  app.delete("/api/staged-systems/:color", async (req, res) => {
    try {
      const deleted = await storage.deleteStagedSystem(req.params.color);
      if (!deleted) {
        return res.status(404).json({ error: "Staged system not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting staged system:", error);
      res.status(500).json({ error: "Failed to delete staged system" });
    }
  });

  app.post("/api/staged-systems/:color/checkout", async (req, res) => {
    try {
      await storage.deleteStagedSystem(req.params.color);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error clearing staged system on checkout:", error);
      res.status(500).json({ error: "Failed to clear staged system" });
    }
  });

  app.get("/api/outage-board/location-notes", async (_req, res) => {
    try {
      const notes = await storage.getAllOutageLocationNotes();
      res.json(notes);
    } catch (error) {
      console.error("Error fetching outage board notes:", error);
      res.status(500).json({ error: "Failed to fetch outage board notes" });
    }
  });

  app.put("/api/outage-board/location-notes/:location", async (req, res) => {
    try {
      const validated = insertOutageLocationNoteSchema.parse({
        ...req.body,
        location: req.params.location,
      });
      const note = await storage.upsertOutageLocationNote(validated);
      res.json(note);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error saving outage board note:", error);
      res.status(500).json({ error: "Failed to save outage board note" });
    }
  });

  app.post("/api/equipment/swap/resolve", async (req, res) => {
    try {
      const payload = z.object({
        borrowedId: z.string().min(1),
        action: z.enum(["return_home", "assign_permanent", "move_to_spares", "set_custom_location"]),
        destinationLocation: z.string().optional(),
      }).parse(req.body);

      const borrowedItem = await storage.getEquipment(payload.borrowedId);
      if (!borrowedItem) {
        return res.status(404).json({ error: "Borrowed item not found" });
      }

      const originalItem = borrowedItem.swappedFromId
        ? await storage.getEquipment(borrowedItem.swappedFromId)
        : null;
      if (borrowedItem.swappedFromId && !originalItem) {
        return res.status(404).json({ error: "Original item not found" });
      }

      const currentSystemColor = borrowedItem.temporarySystemColor || borrowedItem.systemColor || null;

      if (payload.action === "return_home") {
        await storage.updateEquipment(borrowedItem.id, {
          temporarySystemColor: null,
          swappedFromId: null,
          status: "available",
          workOrder: null,
          checkedOutBy: null,
          checkedOutAt: null,
          location: payload.destinationLocation || borrowedItem.location || "Shop",
        });
        if (originalItem) {
          await storage.updateEquipment(originalItem.id, {
            replacementId: null,
          });
        }
      } else {
        await storage.updateEquipment(borrowedItem.id, {
          systemColor:
            payload.action === "move_to_spares"
              ? (borrowedItem.originalSystemColor || borrowedItem.systemColor || "Spare")
              : (currentSystemColor || borrowedItem.systemColor || undefined),
          originalSystemColor:
            payload.action === "move_to_spares"
              ? (borrowedItem.originalSystemColor || borrowedItem.systemColor || "Spare")
              : (currentSystemColor || borrowedItem.originalSystemColor || undefined),
          temporarySystemColor: null,
          swappedFromId: null,
          status: "available",
          workOrder: null,
          checkedOutBy: null,
          checkedOutAt: null,
          location:
            payload.action === "move_to_spares"
              ? "Shop"
              : payload.action === "set_custom_location"
                ? (payload.destinationLocation || borrowedItem.location || "Shop")
                : (borrowedItem.location || "Shop"),
        });

        if (originalItem) {
          await storage.updateEquipment(originalItem.id, {
            systemColor: null,
            replacementId: null,
            location:
              payload.action === "move_to_spares"
                ? "Shop"
                : payload.action === "set_custom_location"
                  ? (payload.destinationLocation || originalItem.location || "Shop")
                  : (originalItem.location || "Waiting on Repairs"),
          });
        }
      }

      if (originalItem) {
        await storage.updateEquipment(originalItem.id, {
          replacementId: null,
        });
      }

      await storage.addEquipmentHistory({
        equipmentId: borrowedItem.id,
        action: "swap_resolved",
        details: `Swap resolved with action ${payload.action}${payload.destinationLocation ? ` to ${payload.destinationLocation}` : ""}.`,
      });

      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error resolving swap:", error);
      res.status(500).json({ error: "Failed to resolve swap" });
    }
  });

  return httpServer;
}
