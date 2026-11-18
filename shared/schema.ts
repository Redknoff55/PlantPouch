import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";
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

export const kioskFormFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "checkbox", "radio", "dropdown", "option-list"]),
  multiline: z.boolean().default(false),
  required: z.boolean().default(false),
  source: z.enum(["answer", "technician_name", "work_order", "submitted_at", "supervisor_name"]).default("answer"),
  options: z.array(z.string()).default([]),
});

export const kioskFormPhaseSchema = z.enum(["pre_checkout", "scheduled"]);

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey(),
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
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
  accessorySystemLabels: jsonb("accessory_system_labels").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  accessoryHomeLocation: text("accessory_home_location"),
  accessorySystemColor: text("accessory_system_color"),
  accessoryNote: text("accessory_note"),
  dueDate: timestamp("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systems = pgTable("systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  isAlwaysAvailable: boolean("is_always_available"),
});

export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  isKioskWarehouse: boolean("is_kiosk_warehouse").notNull().default(false),
  isAccessoryWarehouse: boolean("is_accessory_warehouse").notNull().default(false),
  defaultAccessorySystemLabels: jsonb("default_accessory_system_labels")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
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
  isAccessoryToolbox: boolean("is_accessory_toolbox").notNull().default(false),
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
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
  systemColor: text("system_color").notNull(),
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
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
  systemColor: text("system_color").notNull(),
  bagColor: text("bag_color"),
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
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
  location: text("location").notNull(),
  note: text("note").notNull().default(""),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const activeOutage = pgTable("active_outage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  toolboxId: varchar("toolbox_id").references(() => toolboxes.id, { onDelete: "set null" }),
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

export const kioskUsers = pgTable("kiosk_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  badgeTokenHash: text("badge_token_hash").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  role: text("role").notNull().default("technician"),
  active: boolean("active").notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kioskSessions = pgTable("kiosk_sessions", {
  tokenHash: varchar("token_hash").primaryKey(),
  userId: varchar("user_id").notNull().references(() => kioskUsers.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kioskTemplates = pgTable("kiosk_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  phase: text("phase").notNull(),
  category: text("category"),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  fields: jsonb("fields").$type<Array<z.infer<typeof kioskFormFieldSchema>>>().notNull().default(sql`'[]'::jsonb`),
  allowBatch: boolean("allow_batch").notNull().default(false),
  scheduleInterval: integer("schedule_interval"),
  scheduleUnit: text("schedule_unit"),
  firstDueAt: timestamp("first_due_at"),
  requiresSupervisorApproval: boolean("requires_supervisor_approval").notNull().default(false),
  pdfPath: text("pdf_path").notNull(),
  active: boolean("active").notNull().default(false),
  createdBy: varchar("created_by").references(() => kioskUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  warehouseNameVersion: uniqueIndex("kiosk_templates_warehouse_name_version").on(table.warehouseId, table.name, table.version),
}));

export const kioskSubmissions = pgTable("kiosk_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => kioskTemplates.id, { onDelete: "restrict" }),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().notNull(),
  phase: text("phase").notNull(),
  workOrder: text("work_order"),
  technicianId: varchar("technician_id").notNull().references(() => kioskUsers.id, { onDelete: "restrict" }),
  supervisorId: varchar("supervisor_id").references(() => kioskUsers.id, { onDelete: "set null" }),
  answers: jsonb("answers").$type<Record<string, string | boolean>>().notNull(),
  result: text("result").notNull(),
  status: text("status").notNull(),
  pdfPath: text("pdf_path").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

export const kioskEquipmentState = pgTable("kiosk_equipment_state", {
  equipmentId: varchar("equipment_id").primaryKey().references(() => equipment.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  nextDueAt: timestamp("next_due_at"),
  lastPassedAt: timestamp("last_passed_at"),
  outOfService: boolean("out_of_service").notNull().default(false),
  holdReason: text("hold_reason"),
  holdPhase: text("hold_phase"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kioskCheckouts = pgTable("kiosk_checkouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().notNull(),
  workOrder: text("work_order").notNull(),
  technicianId: varchar("technician_id").notNull().references(() => kioskUsers.id, { onDelete: "restrict" }),
  checkoutSubmissionId: varchar("checkout_submission_id").notNull().references(() => kioskSubmissions.id, { onDelete: "restrict" }),
  checkedOutAt: timestamp("checked_out_at").defaultNow().notNull(),
  returnedAt: timestamp("returned_at"),
  checkedInBy: varchar("checked_in_by").references(() => kioskUsers.id, { onDelete: "set null" }),
  checkInNotes: text("check_in_notes"),
});

export const kioskAuditEvents = pgTable("kiosk_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  actorId: varchar("actor_id").references(() => kioskUsers.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  equipmentIds: jsonb("equipment_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
}).extend({
  toolboxId: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(1),
  color: z.string().trim().min(1),
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  enabled: z.boolean().default(true),
  isKioskWarehouse: z.boolean().default(false),
  defaultAccessorySystemLabels: z.array(z.string().trim().min(1)).default([]),
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
  isAccessoryToolbox: z.boolean().default(false),
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
  toolboxId: z.string().min(1).optional().nullable(),
  requirements: z.array(systemRequirementSchema).default([]),
});

export const insertStagedSystemSchema = createInsertSchema(stagedSystems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  toolboxId: z.string().min(1).optional().nullable(),
  bagColor: z.string().trim().min(1).optional().nullable(),
  missingItems: z.array(stagedSystemMissingItemSchema).default([]),
});

export const insertOutageLocationNoteSchema = createInsertSchema(outageLocationNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  toolboxId: z.string().min(1).optional().nullable(),
  location: z.string().min(1),
  note: z.string().default(""),
});

export const insertActiveOutageSchema = createInsertSchema(activeOutage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  toolboxId: z.string().min(1),
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
export type KioskUser = typeof kioskUsers.$inferSelect;
export type KioskTemplate = typeof kioskTemplates.$inferSelect;
export type KioskSubmission = typeof kioskSubmissions.$inferSelect;
export type KioskTemplateField = z.infer<typeof kioskFormFieldSchema>;
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
