import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const systemRequirementSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  variant: z.string().min(1).default("Standard"),
  quantity: z.number().int().positive(),
});

export const stagedSystemMissingItemSchema = z.object({
  category: z.string().min(1),
  variant: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  variant: text("variant"),
  systemColor: text("system_color"),
  originalSystemColor: text("original_system_color"),
  temporarySystemColor: text("temporary_system_color"),
  replacementId: text("replacement_id"),
  swappedFromId: text("swapped_from_id"),
  status: text("status").notNull().default('available'),
  location: text("location").notNull().default('Shop'),
  workOrder: text("work_order"),
  checkedOutBy: text("checked_out_by"),
  checkedOutAt: timestamp("checked_out_at"),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systems = pgTable("systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  color: text("color").notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const toolboxes = pgTable("toolboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pouches = pgTable("pouches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toolboxId: varchar("toolbox_id").notNull().references(() => toolboxes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  moduleType: text("module_type").notNull().default("custom"),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systemConfigs = pgTable("system_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  systemColor: text("system_color").notNull().unique(),
  displayName: text("display_name"),
  requirements: jsonb("requirements")
    .$type<Array<z.infer<typeof systemRequirementSchema>>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const stagedSystems = pgTable("staged_systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  systemColor: text("system_color").notNull().unique(),
  stagingLocation: text("staging_location").notNull(),
  stagedBy: text("staged_by").notNull(),
  valveNumber: text("valve_number"),
  notes: text("notes"),
  missingItems: jsonb("missing_items")
    .$type<Array<z.infer<typeof stagedSystemMissingItemSchema>>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  targetDate: timestamp("target_date"),
  sourceWorkOrder: text("source_work_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const outageLocationNotes = pgTable("outage_location_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  location: text("location").notNull().unique(),
  note: text("note").notNull().default(""),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activeOutage = pgTable("active_outage", {
  id: varchar("id").primaryKey().default("active"),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  locations: jsonb("locations").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enabled: z.boolean().default(true),
});

export const insertToolboxSchema = createInsertSchema(toolboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  warehouseId: z.string().min(1),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enabled: z.boolean().default(true),
});

export const insertPouchSchema = createInsertSchema(pouches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  toolboxId: z.string().min(1),
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  moduleType: z.string().trim().min(1).default("custom"),
  enabled: z.boolean().default(true),
});

export const insertSystemConfigSchema = createInsertSchema(systemConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  requirements: z.array(systemRequirementSchema).default([]),
});

export const insertStagedSystemSchema = createInsertSchema(stagedSystems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  missingItems: z.array(stagedSystemMissingItemSchema).default([]),
});

export const insertOutageLocationNoteSchema = createInsertSchema(outageLocationNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  location: z.string().min(1),
  note: z.string().default(""),
});

export const insertActiveOutageSchema = createInsertSchema(activeOutage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1),
  unit: z.string().min(1),
  locations: z.array(z.string().min(1)).default([]),
});

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type EquipmentHistory = typeof equipmentHistory.$inferSelect;
export type InsertEquipmentHistory = z.infer<typeof insertEquipmentHistorySchema>;
export type System = typeof systems.$inferSelect;
export type InsertSystem = z.infer<typeof insertSystemSchema>;
export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Toolbox = typeof toolboxes.$inferSelect;
export type InsertToolbox = z.infer<typeof insertToolboxSchema>;
export type Pouch = typeof pouches.$inferSelect;
export type InsertPouch = z.infer<typeof insertPouchSchema>;
export type SystemRequirement = z.infer<typeof systemRequirementSchema>;
export type SystemConfig = typeof systemConfigs.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type StagedSystemMissingItem = z.infer<typeof stagedSystemMissingItemSchema>;
export type StagedSystem = typeof stagedSystems.$inferSelect;
export type InsertStagedSystem = z.infer<typeof insertStagedSystemSchema>;
export type OutageLocationNote = typeof outageLocationNotes.$inferSelect;
export type InsertOutageLocationNote = z.infer<typeof insertOutageLocationNoteSchema>;
export type ActiveOutage = typeof activeOutage.$inferSelect;
export type InsertActiveOutage = z.infer<typeof insertActiveOutageSchema>;
