import { 
  type Equipment, 
  type InsertEquipment,
  type EquipmentHistory,
  type InsertEquipmentHistory,
  type System,
  type InsertSystem,
  type SystemConfig,
  type InsertSystemConfig,
  type StagedSystem,
  type InsertStagedSystem,
  type OutageLocationNote,
  type InsertOutageLocationNote,
  type ActiveOutage,
  type InsertActiveOutage,
  type Warehouse,
  type InsertWarehouse,
  type Toolbox,
  type InsertToolbox,
  type Pouch,
  type InsertPouch,
  equipment as equipmentTable,
  equipmentHistory as equipmentHistoryTable,
  systems as systemsTable,
  systemConfigs as systemConfigsTable,
  stagedSystems as stagedSystemsTable,
  outageLocationNotes as outageLocationNotesTable,
  activeOutage as activeOutageTable,
  warehouses as warehousesTable,
  toolboxes as toolboxesTable,
  pouches as pouchesTable,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, isNull } from "drizzle-orm";

export interface IStorage {
  // Equipment CRUD
  getAllEquipment(toolboxId?: string): Promise<Equipment[]>;
  assignUnscopedEquipment(toolboxId: string): Promise<number>;
  assignUnscopedResources(toolboxId: string): Promise<{ equipment: number; systemConfigs: number; stagedSystems: number; outageNotes: number }>;
  getEquipment(id: string): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: string, updates: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: string): Promise<boolean>;
  
  // Equipment by filters
  getEquipmentByWorkOrder(workOrder: string): Promise<Equipment[]>;
  getEquipmentBySystemColor(systemColor: string): Promise<Equipment[]>;
  
  // Equipment History
  addEquipmentHistory(history: InsertEquipmentHistory): Promise<EquipmentHistory>;
  getEquipmentHistory(equipmentId: string): Promise<EquipmentHistory[]>;
  getRecentEquipmentHistory(limit: number): Promise<EquipmentHistory[]>;
  
  // Systems CRUD
  getAllSystems(): Promise<System[]>;
  createSystem(system: InsertSystem): Promise<System>;
  updateSystem(id: string, updates: Partial<InsertSystem>): Promise<System | undefined>;
  deleteSystem(id: string): Promise<boolean>;

  // System config CRUD
  getAllSystemConfigs(toolboxId?: string): Promise<SystemConfig[]>;
  getSystemConfig(systemColor: string, toolboxId?: string): Promise<SystemConfig | undefined>;
  upsertSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;

  // Staged systems CRUD
  getAllStagedSystems(toolboxId?: string): Promise<StagedSystem[]>;
  getStagedSystem(systemColor: string, toolboxId?: string): Promise<StagedSystem | undefined>;
  upsertStagedSystem(stagedSystem: InsertStagedSystem): Promise<StagedSystem>;
  deleteStagedSystem(systemColor: string, toolboxId?: string): Promise<boolean>;

  // Outage board location notes
  getAllOutageLocationNotes(toolboxId?: string): Promise<OutageLocationNote[]>;
  getOutageLocationNote(location: string, toolboxId?: string): Promise<OutageLocationNote | undefined>;
  upsertOutageLocationNote(note: InsertOutageLocationNote): Promise<OutageLocationNote>;

  // Active outage mode
  getActiveOutage(): Promise<ActiveOutage | undefined>;
  setActiveOutage(outage: InsertActiveOutage): Promise<ActiveOutage>;
  clearActiveOutage(): Promise<boolean>;

  // Warehouse, toolbox, and pouch registry
  getAllWarehouses(): Promise<Warehouse[]>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: string, updates: Partial<InsertWarehouse>): Promise<Warehouse | undefined>;
  deleteWarehouse(id: string): Promise<boolean>;
  getAllToolboxes(): Promise<Toolbox[]>;
  createToolbox(toolbox: InsertToolbox): Promise<Toolbox>;
  updateToolbox(id: string, updates: Partial<InsertToolbox>): Promise<Toolbox | undefined>;
  deleteToolbox(id: string): Promise<boolean>;
  getAllPouches(): Promise<Pouch[]>;
  createPouch(pouch: InsertPouch): Promise<Pouch>;
  updatePouch(id: string, updates: Partial<InsertPouch>): Promise<Pouch | undefined>;
  deletePouch(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getAllEquipment(toolboxId?: string): Promise<Equipment[]> {
    if (!toolboxId) return await db.select().from(equipmentTable);
    return await db.select().from(equipmentTable).where(eq(equipmentTable.toolboxId, toolboxId));
  }

  async assignUnscopedEquipment(toolboxId: string): Promise<number> {
    const result = await db
      .update(equipmentTable)
      .set({ toolboxId, updatedAt: new Date() })
      .where(isNull(equipmentTable.toolboxId))
      .returning({ id: equipmentTable.id });
    return result.length;
  }

  async assignUnscopedResources(toolboxId: string) {
    const [equipment, systemConfigs, stagedSystems, outageNotes] = await Promise.all([
      this.assignUnscopedEquipment(toolboxId),
      db.update(systemConfigsTable).set({ toolboxId }).where(isNull(systemConfigsTable.toolboxId)).returning({ id: systemConfigsTable.id }),
      db.update(stagedSystemsTable).set({ toolboxId }).where(isNull(stagedSystemsTable.toolboxId)).returning({ id: stagedSystemsTable.id }),
      db.update(outageLocationNotesTable).set({ toolboxId }).where(isNull(outageLocationNotesTable.toolboxId)).returning({ id: outageLocationNotesTable.id }),
    ]);
    return { equipment, systemConfigs: systemConfigs.length, stagedSystems: stagedSystems.length, outageNotes: outageNotes.length };
  }

  async getEquipment(id: string): Promise<Equipment | undefined> {
    const result = await db.select().from(equipmentTable).where(eq(equipmentTable.id, id));
    return result[0];
  }

  async createEquipment(equipment: InsertEquipment): Promise<Equipment> {
    const result = await db.insert(equipmentTable).values(equipment).returning();
    return result[0];
  }

  async updateEquipment(id: string, updates: Partial<InsertEquipment>): Promise<Equipment | undefined> {
    const result = await db
      .update(equipmentTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(equipmentTable.id, id))
      .returning();
    return result[0];
  }

  async deleteEquipment(id: string): Promise<boolean> {
    const result = await db.delete(equipmentTable).where(eq(equipmentTable.id, id)).returning();
    return result.length > 0;
  }

  async getEquipmentByWorkOrder(workOrder: string): Promise<Equipment[]> {
    return await db
      .select()
      .from(equipmentTable)
      .where(and(
        eq(equipmentTable.workOrder, workOrder),
        eq(equipmentTable.status, 'checked_out')
      ));
  }

  async getEquipmentBySystemColor(systemColor: string): Promise<Equipment[]> {
    return await db
      .select()
      .from(equipmentTable)
      .where(eq(equipmentTable.systemColor, systemColor));
  }

  async addEquipmentHistory(history: InsertEquipmentHistory): Promise<EquipmentHistory> {
    const result = await db.insert(equipmentHistoryTable).values(history).returning();
    return result[0];
  }

  async getEquipmentHistory(equipmentId: string): Promise<EquipmentHistory[]> {
    return await db
      .select()
      .from(equipmentHistoryTable)
      .where(eq(equipmentHistoryTable.equipmentId, equipmentId))
      .orderBy(equipmentHistoryTable.timestamp);
  }

  async getRecentEquipmentHistory(limit: number): Promise<EquipmentHistory[]> {
    return await db
      .select()
      .from(equipmentHistoryTable)
      .orderBy(desc(equipmentHistoryTable.timestamp))
      .limit(limit);
  }

  async getAllSystems(): Promise<System[]> {
    return await db.select().from(systemsTable);
  }

  async createSystem(system: InsertSystem): Promise<System> {
    const result = await db.insert(systemsTable).values(system).returning();
    return result[0];
  }

  async updateSystem(id: string, updates: Partial<InsertSystem>): Promise<System | undefined> {
    const result = await db
      .update(systemsTable)
      .set(updates)
      .where(eq(systemsTable.id, id))
      .returning();
    return result[0];
  }

  async deleteSystem(id: string): Promise<boolean> {
    const result = await db.delete(systemsTable).where(eq(systemsTable.id, id)).returning();
    return result.length > 0;
  }

  async getAllSystemConfigs(toolboxId?: string): Promise<SystemConfig[]> {
    if (!toolboxId) return await db.select().from(systemConfigsTable);
    return await db.select().from(systemConfigsTable).where(eq(systemConfigsTable.toolboxId, toolboxId));
  }

  async getSystemConfig(systemColor: string, toolboxId?: string): Promise<SystemConfig | undefined> {
    const result = await db
      .select()
      .from(systemConfigsTable)
      .where(and(
        eq(systemConfigsTable.systemColor, systemColor),
        ...(toolboxId ? [eq(systemConfigsTable.toolboxId, toolboxId)] : [])
      ));
    return result[0];
  }

  async upsertSystemConfig(config: InsertSystemConfig): Promise<SystemConfig> {
    const existing = await this.getSystemConfig(config.systemColor, config.toolboxId ?? undefined);
    if (existing) {
      const result = await db
        .update(systemConfigsTable)
        .set({
          ...config,
          updatedAt: new Date(),
        })
        .where(and(
          eq(systemConfigsTable.systemColor, config.systemColor),
          ...(config.toolboxId ? [eq(systemConfigsTable.toolboxId, config.toolboxId)] : [])
        ))
        .returning();
      return result[0];
    }

    const result = await db.insert(systemConfigsTable).values(config).returning();
    return result[0];
  }

  async getAllStagedSystems(toolboxId?: string): Promise<StagedSystem[]> {
    const query = db.select().from(stagedSystemsTable);
    return await (toolboxId
      ? query.where(eq(stagedSystemsTable.toolboxId, toolboxId)).orderBy(desc(stagedSystemsTable.updatedAt))
      : query.orderBy(desc(stagedSystemsTable.updatedAt)));
  }

  async getStagedSystem(systemColor: string, toolboxId?: string): Promise<StagedSystem | undefined> {
    const result = await db
      .select()
      .from(stagedSystemsTable)
      .where(and(
        eq(stagedSystemsTable.systemColor, systemColor),
        ...(toolboxId ? [eq(stagedSystemsTable.toolboxId, toolboxId)] : [])
      ));
    return result[0];
  }

  async upsertStagedSystem(stagedSystem: InsertStagedSystem): Promise<StagedSystem> {
    const existing = await this.getStagedSystem(stagedSystem.systemColor, stagedSystem.toolboxId ?? undefined);
    if (existing) {
      const result = await db
        .update(stagedSystemsTable)
        .set({
          ...stagedSystem,
          updatedAt: new Date(),
        })
        .where(and(
          eq(stagedSystemsTable.systemColor, stagedSystem.systemColor),
          ...(stagedSystem.toolboxId ? [eq(stagedSystemsTable.toolboxId, stagedSystem.toolboxId)] : [])
        ))
        .returning();
      return result[0];
    }

    const result = await db.insert(stagedSystemsTable).values(stagedSystem).returning();
    return result[0];
  }

  async deleteStagedSystem(systemColor: string, toolboxId?: string): Promise<boolean> {
    const result = await db
      .delete(stagedSystemsTable)
      .where(and(
        eq(stagedSystemsTable.systemColor, systemColor),
        ...(toolboxId ? [eq(stagedSystemsTable.toolboxId, toolboxId)] : [])
      ))
      .returning();
    return result.length > 0;
  }

  async getAllOutageLocationNotes(toolboxId?: string): Promise<OutageLocationNote[]> {
    const query = db.select().from(outageLocationNotesTable);
    return await (toolboxId
      ? query.where(eq(outageLocationNotesTable.toolboxId, toolboxId)).orderBy(outageLocationNotesTable.location)
      : query.orderBy(outageLocationNotesTable.location));
  }

  async getOutageLocationNote(location: string, toolboxId?: string): Promise<OutageLocationNote | undefined> {
    const result = await db
      .select()
      .from(outageLocationNotesTable)
      .where(and(
        eq(outageLocationNotesTable.location, location),
        ...(toolboxId ? [eq(outageLocationNotesTable.toolboxId, toolboxId)] : [])
      ));
    return result[0];
  }

  async upsertOutageLocationNote(note: InsertOutageLocationNote): Promise<OutageLocationNote> {
    const existing = await this.getOutageLocationNote(note.location, note.toolboxId ?? undefined);
    if (existing) {
      const result = await db
        .update(outageLocationNotesTable)
        .set({
          ...note,
          updatedAt: new Date(),
        })
        .where(and(
          eq(outageLocationNotesTable.location, note.location),
          ...(note.toolboxId ? [eq(outageLocationNotesTable.toolboxId, note.toolboxId)] : [])
        ))
        .returning();
      return result[0];
    }

    const result = await db.insert(outageLocationNotesTable).values(note).returning();
    return result[0];
  }

  async getActiveOutage(): Promise<ActiveOutage | undefined> {
    const result = await db.select().from(activeOutageTable).limit(1);
    return result[0];
  }

  async setActiveOutage(outage: InsertActiveOutage): Promise<ActiveOutage> {
    const existing = await this.getActiveOutage();
    if (existing) {
      const result = await db
        .update(activeOutageTable)
        .set({
          ...outage,
          updatedAt: new Date(),
        })
        .where(eq(activeOutageTable.id, existing.id))
        .returning();
      return result[0];
    }

    const result = await db
      .insert(activeOutageTable)
      .values({
        id: "active",
        ...outage,
      })
      .returning();
    return result[0];
  }

  async clearActiveOutage(): Promise<boolean> {
    const result = await db.delete(activeOutageTable).returning();
    return result.length > 0;
  }

  async getAllWarehouses(): Promise<Warehouse[]> {
    return await db.select().from(warehousesTable).orderBy(warehousesTable.name);
  }

  async createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse> {
    const result = await db.insert(warehousesTable).values(warehouse).returning();
    return result[0];
  }

  async updateWarehouse(id: string, updates: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const result = await db
      .update(warehousesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(warehousesTable.id, id))
      .returning();
    return result[0];
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    const result = await db.delete(warehousesTable).where(eq(warehousesTable.id, id)).returning();
    return result.length > 0;
  }

  async getAllToolboxes(): Promise<Toolbox[]> {
    return await db.select().from(toolboxesTable).orderBy(toolboxesTable.name);
  }

  async createToolbox(toolbox: InsertToolbox): Promise<Toolbox> {
    const result = await db.insert(toolboxesTable).values(toolbox).returning();
    return result[0];
  }

  async updateToolbox(id: string, updates: Partial<InsertToolbox>): Promise<Toolbox | undefined> {
    const result = await db
      .update(toolboxesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(toolboxesTable.id, id))
      .returning();
    return result[0];
  }

  async deleteToolbox(id: string): Promise<boolean> {
    const result = await db.delete(toolboxesTable).where(eq(toolboxesTable.id, id)).returning();
    return result.length > 0;
  }

  async getAllPouches(): Promise<Pouch[]> {
    return await db.select().from(pouchesTable).orderBy(pouchesTable.name);
  }

  async createPouch(pouch: InsertPouch): Promise<Pouch> {
    const result = await db.insert(pouchesTable).values(pouch).returning();
    return result[0];
  }

  async updatePouch(id: string, updates: Partial<InsertPouch>): Promise<Pouch | undefined> {
    const result = await db
      .update(pouchesTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pouchesTable.id, id))
      .returning();
    return result[0];
  }

  async deletePouch(id: string): Promise<boolean> {
    const result = await db.delete(pouchesTable).where(eq(pouchesTable.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
