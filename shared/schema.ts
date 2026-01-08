import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  systemColor: text("system_color"),
  status: text("status").notNull().default('available'),
  location: text("location").notNull().default('Shop'),
  workOrder: text("work_order"),
  checkedOutBy: text("checked_out_by"),
  checkedOutAt: timestamp("checked_out_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systems = pgTable("systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const equipmentHistory = pgTable("equipment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  equipmentId: varchar("equipment_id").notNull().references(() => equipment.id, { onDelete: 'cascade' }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  details: text("details"),
  workOrder: text("work_order"),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertEquipmentHistorySchema = createInsertSchema(equipmentHistory).omit({
  id: true,
  timestamp: true,
});

export const insertSystemSchema = createInsertSchema(systems).omit({
  id: true,
});

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type EquipmentHistory = typeof equipmentHistory.$inferSelect;
export type InsertEquipmentHistory = z.infer<typeof insertEquipmentHistorySchema>;
export type System = typeof systems.$inferSelect;
export type InsertSystem = z.infer<typeof insertSystemSchema>;
