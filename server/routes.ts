import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertEquipmentSchema,
  insertSystemSchema,
  insertSystemConfigSchema,
  insertStagedSystemSchema,
  insertOutageLocationNoteSchema,
  insertActiveOutageSchema,
  insertWarehouseSchema,
  insertToolboxSchema,
  insertPouchSchema,
  type Equipment,
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

const isRepairLocation = (location?: string | null) =>
  ["waiting on repairs", "sent for repairs", "repairs", "out for repair", "out for repairs"]
    .includes((location ?? "").trim().toLowerCase());

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
  const getAccessoryInventoryContext = async () => {
    const [warehouses, toolboxes] = await Promise.all([
      storage.getAllWarehouses(),
      storage.getAllToolboxes(),
    ]);
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
    const toolboxById = new Map(toolboxes.map((toolbox) => [toolbox.id, toolbox]));
    const getToolbox = (item: Equipment) =>
      item.toolboxId ? toolboxById.get(item.toolboxId) : undefined;
    const getWarehouse = (item: Equipment) => {
      const toolbox = getToolbox(item);
      return toolbox ? warehouseById.get(toolbox.warehouseId) : undefined;
    };
    const isAccessory = (item: Equipment) =>
      getToolbox(item)?.isAccessoryToolbox === true ||
      !!item.accessoryHomeLocation ||
      !!item.accessorySystemColor ||
      !!item.accessoryNote;
    const isEnabledAccessory = (item: Equipment, warehouseId?: string) => {
      const toolbox = getToolbox(item);
      const warehouse = getWarehouse(item);
      return !!toolbox?.isAccessoryToolbox &&
        toolbox.enabled &&
        !!warehouse?.enabled &&
        (!warehouseId || toolbox.warehouseId === warehouseId);
    };
    return { isAccessory, isEnabledAccessory, getToolbox };
  };
  const isCalibrationCurrent = (item: Equipment) => {
    if (!item.dueDate) return true;
    const dueDate = new Date(item.dueDate);
    if (Number.isNaN(dueDate.getTime())) return false;
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dueDay > todayStart;
  };

  app.get("/api/registry", async (_req, res) => {
    try {
      const [warehouses, toolboxes, pouches] = await Promise.all([
        storage.getAllWarehouses(),
        storage.getAllToolboxes(),
        storage.getAllPouches(),
      ]);
      res.json({ warehouses, toolboxes, pouches });
    } catch (error) {
      console.error("Error fetching platform registry:", error);
      res.status(500).json({ error: "Failed to fetch platform registry" });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const warehouse = await storage.createWarehouse(insertWarehouseSchema.parse(req.body));
      res.status(201).json(warehouse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating warehouse:", error);
      res.status(500).json({ error: "Failed to create warehouse" });
    }
  });

  app.patch("/api/warehouses/:id", async (req, res) => {
    try {
      const warehouse = await storage.updateWarehouse(req.params.id, insertWarehouseSchema.partial().parse(req.body));
      if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
      res.json(warehouse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error updating warehouse:", error);
      res.status(500).json({ error: "Failed to update warehouse" });
    }
  });

  app.delete("/api/warehouses/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteWarehouse(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Warehouse not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting warehouse:", error);
      res.status(500).json({ error: "Failed to delete warehouse" });
    }
  });

  app.post("/api/toolboxes", async (req, res) => {
    try {
      const toolbox = await storage.createToolbox(insertToolboxSchema.parse(req.body));
      res.status(201).json(toolbox);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating toolbox:", error);
      res.status(500).json({ error: "Failed to create toolbox" });
    }
  });

  app.post("/api/toolboxes/:id/claim-equipment", async (req, res) => {
    try {
      const toolboxes = await storage.getAllToolboxes();
      if (!toolboxes.some((toolbox) => toolbox.id === req.params.id)) {
        return res.status(404).json({ error: "Toolbox not found" });
      }
      const claimed = await storage.assignUnscopedResources(req.params.id);
      res.json({ claimed });
    } catch (error) {
      console.error("Error assigning equipment to toolbox:", error);
      res.status(500).json({ error: "Failed to assign equipment to toolbox" });
    }
  });

  app.patch("/api/toolboxes/:id", async (req, res) => {
    try {
      const toolbox = await storage.updateToolbox(req.params.id, insertToolboxSchema.partial().parse(req.body));
      if (!toolbox) return res.status(404).json({ error: "Toolbox not found" });
      res.json(toolbox);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error updating toolbox:", error);
      res.status(500).json({ error: "Failed to update toolbox" });
    }
  });

  app.delete("/api/toolboxes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteToolbox(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Toolbox not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting toolbox:", error);
      res.status(500).json({ error: "Failed to delete toolbox" });
    }
  });

  app.post("/api/pouches", async (req, res) => {
    try {
      const pouch = await storage.createPouch(insertPouchSchema.parse(req.body));
      res.status(201).json(pouch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating pouch:", error);
      res.status(500).json({ error: "Failed to create pouch" });
    }
  });

  app.patch("/api/pouches/:id", async (req, res) => {
    try {
      const pouch = await storage.updatePouch(req.params.id, insertPouchSchema.partial().parse(req.body));
      if (!pouch) return res.status(404).json({ error: "Pouch not found" });
      res.json(pouch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error updating pouch:", error);
      res.status(500).json({ error: "Failed to update pouch" });
    }
  });

  app.delete("/api/pouches/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePouch(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Pouch not found" });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting pouch:", error);
      res.status(500).json({ error: "Failed to delete pouch" });
    }
  });

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
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const equipment = await storage.getAllEquipment(toolboxId);
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
      if (typeof payload.id === "string") {
        const existing = await storage.getEquipment(payload.id.trim());
        if (existing) {
          return res.status(409).json({ error: `Equipment ID ${payload.id.trim()} already exists.` });
        }
      }
      const validatedData = insertEquipmentSchema.parse(payload);
      const equipment = await storage.createEquipment(validatedData);
      res.status(201).json(equipment);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return res.status(409).json({ error: "Equipment ID already exists." });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error creating equipment:", error);
      res.status(500).json({ error: "Failed to create equipment" });
    }
  });

  app.post("/api/equipment/import", async (req, res) => {
    try {
      const payload = { ...req.body } as Partial<InsertEquipment>;
      for (const field of ["dueDate", "checkedOutAt"] as const) {
        const input: unknown = req.body?.[field];
        if (typeof input === "string") {
          const trimmed = input.trim();
          if (!trimmed) {
            payload[field] = null;
          } else {
            const parsed = parseDueDateString(trimmed);
            if (!parsed) {
              return res.status(400).json({ error: `${field} must be a valid date.` });
            }
            payload[field] = parsed;
          }
        }
      }

      const validatedData = insertEquipmentSchema.parse(payload);
      const existing = await storage.getEquipment(validatedData.id);
      if (existing) {
        if (req.body?.accessorySystemLabels === undefined) {
          validatedData.accessorySystemLabels = existing.accessorySystemLabels;
        }
        const equipment = await storage.updateEquipment(existing.id, validatedData);
        if (!equipment) return res.status(404).json({ error: "Equipment not found" });
        return res.json({ action: "updated", equipment });
      }

      const equipment = await storage.createEquipment(validatedData);
      res.status(201).json({ action: "created", equipment });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        return res.status(409).json({ error: "Equipment ID already exists; retry the import." });
      }
      console.error("Error importing equipment:", error);
      res.status(500).json({ error: "Failed to import equipment" });
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

  app.post("/api/equipment/:id/move", async (req, res) => {
    try {
      const { location, details } = z.object({
        location: z.string().trim().min(1),
        details: z.string().trim().max(500).optional(),
      }).parse(req.body);
      const equipment = await storage.moveEquipment(req.params.id, location, details);
      if (!equipment) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error moving equipment:", error);
      res.status(500).json({ error: "Failed to move equipment" });
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

  app.post("/api/equipment/checkout/accessories", async (req, res) => {
    try {
      const { equipmentIds, workOrder, techName, systemColor, valveNumber } = z.object({
        equipmentIds: z.array(z.string().min(1)).min(1),
        workOrder: z.string().trim().min(1),
        techName: z.string().trim().min(1),
        systemColor: z.string().trim().min(1).optional(),
        valveNumber: z.string().optional(),
      }).parse(req.body);
      if (new Set(equipmentIds).size !== equipmentIds.length) {
        return res.status(400).json({ error: "Accessories cannot be selected more than once." });
      }

      const accessoryContext = await getAccessoryInventoryContext();
      let targetWarehouseId: string | undefined;
      if (systemColor) {
        const activeWorkOrderItems = await storage.getEquipmentByWorkOrder(workOrder);
        const checkedOutComputer = activeWorkOrderItems.find(
          (item) =>
            item.category === "Computer" &&
            item.systemColor?.trim().toLowerCase() === systemColor.trim().toLowerCase()
        );
        if (!checkedOutComputer) {
          return res.status(400).json({ error: `No active ${systemColor} system checkout was found for WO ${workOrder}.` });
        }
        targetWarehouseId = accessoryContext.getToolbox(checkedOutComputer)?.warehouseId;
        if (!targetWarehouseId) {
          return res.status(400).json({ error: "The active system is not assigned to a warehouse." });
        }
      }
      const selectedItems = await Promise.all(equipmentIds.map((id) => storage.getEquipment(id)));
      if (selectedItems.some((item) => !item || !accessoryContext.isEnabledAccessory(item, targetWarehouseId))) {
        return res.status(400).json({ error: "Accessories must come from an enabled accessory toolbox in the system's warehouse." });
      }
      for (const item of selectedItems) {
        if (!item) continue;
        if (
          item.status !== "available" ||
          isRepairLocation(item.location) ||
          !isCalibrationCurrent(item)
        ) {
          return res.status(409).json({ error: `${item.id} is not available or is out of calibration.` });
        }
      }

      const checkedOutAt = new Date();
      const valveSuffix = valveNumber?.trim() ? `, Valve # ${valveNumber.trim()}` : "";
      const checkedOut = await Promise.all(selectedItems.map(async (item) => {
        if (!item) return undefined;
        const updated = await storage.updateEquipment(item.id, {
          status: "checked_out",
          workOrder,
          checkedOutBy: techName,
          checkedOutAt,
          accessoryHomeLocation: item.location || "Shop",
          accessorySystemColor: systemColor ?? null,
          accessoryNote: null,
          notes: `Checked out as an accessory under WO ${workOrder}${valveSuffix} by ${techName}`,
        });
        await storage.addEquipmentHistory({
          equipmentId: item.id,
          action: "accessory_check_out",
          details: `Checked out${systemColor ? ` for ${systemColor} System` : ""}${valveSuffix} by ${techName}`,
          workOrder,
        });
        return updated;
      }));
      res.json(checkedOut.filter((item): item is NonNullable<typeof item> => !!item));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error checking out accessories:", error);
      res.status(500).json({ error: "Failed to check out accessories" });
    }
  });

  app.post("/api/equipment/:id/accessory-return", async (req, res) => {
    try {
      const { confirmed } = z.object({ confirmed: z.literal(true) }).parse(req.body);
      if (!confirmed) return res.status(400).json({ error: "Confirm the accessory has been physically returned." });
      const existing = await storage.getEquipment(req.params.id);
      if (!existing) return res.status(404).json({ error: "Equipment not found" });
      const accessoryContext = await getAccessoryInventoryContext();
      if (!accessoryContext.isAccessory(existing)) {
        return res.status(400).json({ error: "Equipment is not in an accessory toolbox." });
      }
      if (existing.status !== "checked_out") {
        return res.status(409).json({ error: "Accessory is not checked out." });
      }

      const workOrder = existing.workOrder ?? undefined;
      const location = existing.accessoryHomeLocation || existing.location || "Shop";
      const returned = await storage.updateEquipment(existing.id, {
        status: "available",
        workOrder: null,
        checkedOutBy: null,
        checkedOutAt: null,
        location,
        accessoryHomeLocation: null,
        accessorySystemColor: null,
        accessoryNote: null,
        notes: `Physically returned to ${location}`,
      });
      await storage.addEquipmentHistory({
        equipmentId: existing.id,
        action: "accessory_return",
        details: `Physically returned to ${location}`,
        workOrder,
      });
      res.json(returned);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error returning accessory:", error);
      res.status(500).json({ error: "Failed to return accessory" });
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
      const { systemColor, equipmentIds, accessoryIds, workOrder, techName, valveNumber } = z.object({
        systemColor: z.string().trim().min(1),
        equipmentIds: z.array(z.string().min(1)).min(1),
        accessoryIds: z.array(z.string().min(1)).default([]),
        workOrder: z.string().trim().min(1),
        techName: z.string().trim().min(1),
        valveNumber: z.string().optional(),
      }).parse(req.body);

      const equipmentToCheckout = await Promise.all(equipmentIds.map((id) => storage.getEquipment(id)));
      if (equipmentToCheckout.some((item) => !item)) {
        return res.status(404).json({ error: "Equipment not found" });
      }
      const accessoryContext = await getAccessoryInventoryContext();
      if (equipmentToCheckout.some((item) => item && accessoryContext.isAccessory(item))) {
        return res.status(400).json({ error: "Accessory equipment must be checked out as an accessory." });
      }
      if (new Set(accessoryIds).size !== accessoryIds.length) {
        return res.status(400).json({ error: "Accessories cannot be selected more than once." });
      }
      const selectedComputer = equipmentToCheckout.find((item) => item?.category === "Computer");
      const targetWarehouseId = selectedComputer
        ? accessoryContext.getToolbox(selectedComputer)?.warehouseId
        : undefined;
      const accessoriesToCheckout = await Promise.all(accessoryIds.map((id) => storage.getEquipment(id)));
      if (accessoryIds.length > 0 && !targetWarehouseId) {
        return res.status(400).json({ error: "Select a system from a warehouse before adding accessories." });
      }
      if (accessoriesToCheckout.some((item) => !item || !accessoryContext.isEnabledAccessory(item, targetWarehouseId))) {
        return res.status(400).json({ error: "Accessories must come from an enabled accessory toolbox in the system's warehouse." });
      }
      for (const accessory of accessoriesToCheckout) {
        if (!accessory) continue;
        if (
          accessory.status !== "available" ||
          isRepairLocation(accessory.location) ||
          !isCalibrationCurrent(accessory)
        ) {
          return res.status(409).json({ error: `${accessory.id} is not available or is out of calibration.` });
        }
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

      const checkedOutAccessories = await Promise.all(accessoriesToCheckout.map(async (item) => {
        if (!item) return undefined;
        const updated = await storage.updateEquipment(item.id, {
          status: "checked_out",
          workOrder,
          checkedOutBy: techName,
          checkedOutAt,
          accessoryHomeLocation: item.location || "Shop",
          accessorySystemColor: systemColor,
          accessoryNote: null,
          notes: `Checked out as an accessory for ${systemColor} System under WO ${workOrder} by ${techName}`,
        });
        await storage.addEquipmentHistory({
          equipmentId: item.id,
          action: "accessory_check_out",
          details: `Checked out as an accessory for ${systemColor} System${valveSuffix} by ${techName}`,
          workOrder,
        });
        return updated;
      }));

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

      res.json([...updatedEquipment, ...checkedOutAccessories.filter((item): item is NonNullable<typeof item> => !!item)]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.message });
      }
      console.error("Error checking out system:", error);
      res.status(500).json({ error: "Failed to check out system" });
    }
  });

  // System check-in by work order
  app.post("/api/equipment/checkin/workorder", async (req, res) => {
    try {
      const { workOrder, itemReports } = z.object({
        workOrder: z.string().trim().min(1),
        itemReports: z.record(z.object({
          isBroken: z.boolean().default(false),
          notes: z.string().optional(),
          keepCheckedOut: z.boolean().optional(),
          accessoryNote: z.string().optional(),
          accessoryReturned: z.boolean().optional(),
        })),
      }).parse(req.body);

      // Get all equipment for this work order
      const equipment = await storage.getEquipmentByWorkOrder(workOrder);
      
      if (equipment.length === 0) {
        return res.status(404).json({ error: "No equipment found for this work order" });
      }

      const accessoryContext = await getAccessoryInventoryContext();
      for (const item of equipment) {
        if (!accessoryContext.isAccessory(item)) continue;
        const report = itemReports[item.id];
        if (report?.keepCheckedOut) {
          if (report.isBroken) {
            return res.status(400).json({ error: `${item.id} cannot be kept checked out when reported broken.` });
          }
          if (!report.accessoryNote?.trim()) {
            return res.status(400).json({ error: `Add a note explaining why ${item.id} is staying checked out.` });
          }
        } else if (report?.accessoryReturned !== true) {
          return res.status(400).json({ error: `Confirm ${item.id} was physically returned or choose to keep it checked out.` });
        }
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
          const isAccessory = accessoryContext.isAccessory(item);
          if (isAccessory && report.keepCheckedOut) {
            const note = report.accessoryNote?.trim() ?? "";
            const updated = await storage.updateEquipment(item.id, {
              status: "checked_out",
              workOrder: null,
              checkedOutBy: item.checkedOutBy,
              checkedOutAt: item.checkedOutAt,
              accessorySystemColor: null,
              accessoryNote: note,
              notes: `Kept checked out after WO ${workOrder}: ${note}`,
            });
            await storage.addEquipmentHistory({
              equipmentId: item.id,
              action: "accessory_retained",
              details: `Kept checked out after WO ${workOrder}: ${note}`,
              workOrder,
            });
            return updated;
          }
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
          } else if (!isAccessory && item.systemColor) {
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
            location: report.isBroken ? "Waiting on Repairs" : isAccessory
              ? item.accessoryHomeLocation || item.location
              : item.location,
            accessoryHomeLocation: isAccessory ? null : item.accessoryHomeLocation,
            accessorySystemColor: isAccessory ? null : item.accessorySystemColor,
            accessoryNote: isAccessory ? null : item.accessoryNote,
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
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const systems = await storage.getAllSystems(toolboxId);
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

  app.get("/api/system-configs", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const configs = await storage.getAllSystemConfigs(toolboxId);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching system configs:", error);
      res.status(500).json({ error: "Failed to fetch system configs" });
    }
  });

  app.get("/api/system-configs/:color", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const config = await storage.getSystemConfig(req.params.color, toolboxId);
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

  app.get("/api/staged-systems", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const stagedSystems = await storage.getAllStagedSystems(toolboxId);
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
      const allEquipment = await storage.getAllEquipment(validated.toolboxId ?? undefined);
      const systemItems = allEquipment.filter(
        (item) => (item.temporarySystemColor || item.systemColor) === req.params.color
      );
      const selectedBagItems = validated.bagColor && validated.bagColor !== req.params.color
        ? allEquipment.filter(
            (item) =>
              item.category !== "Computer" &&
              item.systemColor === validated.bagColor &&
              item.status === "available" &&
              !item.temporarySystemColor &&
              !["Waiting on Repairs", "Sent for Repairs", "Repairs", "Out for Repair", "Out for Repairs"].includes(item.location ?? "")
          )
        : [];
      const selectedBagItemIds = new Set(selectedBagItems.map((item) => item.id));
      const itemsToStage = Array.from(
        new Map([...systemItems, ...selectedBagItems].map((item) => [item.id, item])).values()
      );
      const bagDetail = validated.bagColor && validated.bagColor !== req.params.color
        ? ` with ${validated.bagColor} bag components`
        : "";
      const stageDetails = `${validated.stagedBy} staged ${req.params.color} system${bagDetail} at ${validated.stagingLocation}${validated.valveNumber ? ` for valve ${validated.valveNumber}` : ""}${validated.notes ? ` (${validated.notes})` : ""}`;

      await Promise.all(
        itemsToStage.map((item) =>
          storage.updateEquipment(item.id, {
            status: "available",
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            location: validated.stagingLocation,
            notes: stageDetails,
            ...(selectedBagItemIds.has(item.id) ? { temporarySystemColor: req.params.color } : {}),
          })
        )
      );

      await Promise.all(
        itemsToStage.map((item) =>
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
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const staged = await storage.getStagedSystem(req.params.color, toolboxId);
      const deleted = await storage.deleteStagedSystem(req.params.color, toolboxId);
      if (!deleted) {
        return res.status(404).json({ error: "Staged system not found" });
      }
      if (staged?.bagColor && staged.bagColor !== staged.systemColor) {
        const pairedBagItems = (await storage.getAllEquipment(toolboxId)).filter(
          (item) =>
            item.category !== "Computer" &&
            item.systemColor === staged.bagColor &&
            item.temporarySystemColor === staged.systemColor &&
            item.status === "available" &&
            item.location === staged.stagingLocation
        );
        await Promise.all(
          pairedBagItems.map((item) => storage.updateEquipment(item.id, { temporarySystemColor: null }))
        );
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting staged system:", error);
      res.status(500).json({ error: "Failed to delete staged system" });
    }
  });

  app.post("/api/staged-systems/:color/checkout", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      await storage.deleteStagedSystem(req.params.color, toolboxId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error clearing staged system on checkout:", error);
      res.status(500).json({ error: "Failed to clear staged system" });
    }
  });

  app.get("/api/outage-board/location-notes", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const notes = await storage.getAllOutageLocationNotes(toolboxId);
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

  app.get("/api/outage-board/active", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      const activeOutage = await storage.getActiveOutage(toolboxId);
      res.json(activeOutage ?? null);
    } catch (error) {
      console.error("Error fetching active outage:", error);
      res.status(500).json({ error: "Failed to fetch active outage" });
    }
  });

  app.get("/api/outage-board/active/all", async (_req, res) => {
    try {
      res.json(await storage.getAllActiveOutages());
    } catch (error) {
      console.error("Error fetching active outages:", error);
      res.status(500).json({ error: "Failed to fetch active outages" });
    }
  });

  app.put("/api/outage-board/active", async (req, res) => {
    try {
      const validated = insertActiveOutageSchema.parse(req.body);
      const activeOutage = await storage.setActiveOutage(validated);
      res.json(activeOutage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromZodError(error).toString() });
      }
      console.error("Error saving active outage:", error);
      res.status(500).json({ error: "Failed to save active outage" });
    }
  });

  app.delete("/api/outage-board/active", async (req, res) => {
    try {
      const toolboxId = typeof req.query.toolboxId === "string" ? req.query.toolboxId : undefined;
      await storage.clearActiveOutage(toolboxId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing active outage:", error);
      res.status(500).json({ error: "Failed to clear active outage" });
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
