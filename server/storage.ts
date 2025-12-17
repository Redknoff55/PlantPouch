import { 
  type Equipment, 
  type InsertEquipment,
  type EquipmentHistory,
  type InsertEquipmentHistory,
  equipment as equipmentTable,
  equipmentHistory as equipmentHistoryTable
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Equipment CRUD
  getAllEquipment(): Promise<Equipment[]>;
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
}

export class DatabaseStorage implements IStorage {
  async getAllEquipment(): Promise<Equipment[]> {
    return await db.select().from(equipmentTable);
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
}

export const storage = new DatabaseStorage();
