import { createHash, randomBytes, randomInt, scrypt as nodeScrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { raw, Router } from "express";
import { and, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { z } from "zod";
import {
  equipment,
  equipmentHistory,
  kioskAuditEvents,
  kioskCheckouts,
  kioskEquipmentState,
  kioskSessions,
  kioskSubmissions,
  kioskTemplates,
  kioskUsers,
  kioskFormFieldSchema,
  type KioskTemplate,
  type KioskUser,
  type Warehouse,
  warehouses,
  toolboxes,
} from "@shared/schema";
import { db } from "./db";
import { fillKioskPdf, inspectKioskPdf, nextScheduledDueDate, pdfBindingsMatch, validateKioskAnswers } from "./kiosk-utils";

const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = "plantpouch_kiosk_session";
const SESSION_LENGTH_MS = 8 * 60 * 60 * 1000;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_PIN_FAILURES = 5;
const kioskDataPath = path.resolve(process.env.KIOSK_DATA_PATH || path.join(process.cwd(), "data", "kiosk"));

declare global {
  namespace Express {
    interface Request {
      kioskWarehouse?: Warehouse;
      kioskUser?: KioskUser;
      kioskSessionToken?: string;
    }
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const hashPin = async (pin: string) => {
  const salt = randomBytes(16).toString("hex");
  const digest = (await scrypt(pin, salt, 64)) as Buffer;
  return `${salt}:${digest.toString("hex")}`;
};

const verifyPin = async (pin: string, storedHash: string) => {
  const [salt, storedDigest] = storedHash.split(":");
  if (!salt || !storedDigest) return false;
  const candidate = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(storedDigest, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
};

const publicUser = (user: KioskUser) => ({
  id: user.id,
  name: user.name,
  role: user.role,
  active: user.active,
});

const cookieValue = (req: Request) => {
  const entry = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry ? entry.slice(SESSION_COOKIE.length + 1) : undefined;
};

const setSessionCookie = (res: Response, token: string) => {
  const secure = process.env.KIOSK_COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/kiosk; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LENGTH_MS / 1000}${secure}`,
  );
};

const clearSessionCookie = (res: Response) => {
  const secure = process.env.KIOSK_COOKIE_SECURE === "true" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/api/kiosk; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
};

const badgeValue = (value: string) =>
  value.trim().replace(/^plantpouch-badge:/i, "").trim();

const makeBadge = async () => {
  const token = randomBytes(32).toString("base64url");
  const qrCode = await QRCode.toDataURL(`plantpouch-badge:${token}`, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 280,
  });
  return { token, tokenHash: hashToken(token), qrCode };
};

const createSession = async (user: KioskUser, res: Response, action?: string) => {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LENGTH_MS);
  await db.transaction(async (transaction) => {
    await transaction.insert(kioskSessions).values({
      tokenHash: hashToken(token),
      userId: user.id,
      warehouseId: user.warehouseId,
      expiresAt,
    });
    if (action) {
      await transaction.insert(kioskAuditEvents).values({
        warehouseId: user.warehouseId,
        actorId: user.id,
        action,
        equipmentIds: [],
        details: {},
      });
    }
  });
  setSessionCookie(res, token);
};

const getWarehouse = (req: Request): Warehouse => {
  if (!req.kioskWarehouse) throw new Error("Kiosk warehouse middleware was not applied");
  return req.kioskWarehouse;
};

const getUser = (req: Request): KioskUser => {
  if (!req.kioskUser) throw new Error("Kiosk authentication middleware was not applied");
  return req.kioskUser;
};

const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.kioskUser) return res.status(401).json({ error: "Sign in to continue" });
    if (!roles.includes(req.kioskUser.role)) return res.status(403).json({ error: "You do not have permission to do that" });
    next();
  };

const accountInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pin: z.string().regex(/^\d{6,12}$/, "PIN must contain 6 to 12 digits"),
});

const templateConfigSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phase: z.enum(["pre_checkout", "scheduled"]),
  category: z.string().trim().min(1).max(120).nullable(),
  equipmentIds: z.array(z.string().min(1)).max(500),
  fields: z.array(kioskFormFieldSchema),
  allowBatch: z.boolean(),
  scheduleInterval: z.number().int().positive().max(365).nullable(),
  scheduleUnit: z.enum(["day", "week", "month"]).nullable(),
  firstDueAt: z.string().nullable(),
  requiresSupervisorApproval: z.boolean(),
});

const submissionInputSchema = z.object({
  templateId: z.string().min(1),
  equipmentIds: z.array(z.string().min(1)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
  workOrder: z.string().trim().max(120).nullable(),
  answers: z.record(z.union([z.string(), z.boolean()])),
  result: z.enum(["passed", "failed"]),
});

const storedPdfPath = (warehouseId: string, fileId: string) =>
  path.join(kioskDataPath, warehouseId, `${fileId}.pdf`);

const removeStoredPdf = async (filePath: string) => {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

const applicableTemplate = async (
  warehouseId: string,
  asset: typeof equipment.$inferSelect,
  phase: string,
) => {
  const templates = await db.select().from(kioskTemplates).where(and(
    eq(kioskTemplates.warehouseId, warehouseId),
    eq(kioskTemplates.phase, phase),
    eq(kioskTemplates.active, true),
  ));
  const itemTemplates = templates.filter((template) => template.equipmentIds.includes(asset.id));
  const template = itemTemplates[0] ?? templates.find((candidate) =>
    candidate.category === asset.category && candidate.equipmentIds.length === 0,
  );
  return template;
};

const updateInspectionState = async (
  transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
  warehouseId: string,
  equipmentId: string,
  template: KioskTemplate,
  result: string,
  effectiveAt: Date,
) => {
  const [current] = await transaction.select().from(kioskEquipmentState).where(
    and(
      eq(kioskEquipmentState.equipmentId, equipmentId),
      eq(kioskEquipmentState.warehouseId, warehouseId),
    ),
  );
  if (result === "failed") {
    await transaction.insert(kioskEquipmentState).values({
      equipmentId,
      warehouseId,
      nextDueAt: current?.nextDueAt ?? template.firstDueAt,
      lastPassedAt: current?.lastPassedAt ?? null,
      outOfService: true,
      holdReason: "Inspection failed",
      holdPhase: template.phase,
      updatedAt: effectiveAt,
    }).onConflictDoUpdate({
      target: kioskEquipmentState.equipmentId,
      set: {
        warehouseId,
        outOfService: true,
        holdReason: "Inspection failed",
        holdPhase: template.phase,
        updatedAt: effectiveAt,
      },
    });
    return;
  }

  const remainsOnHold = !!current?.outOfService && current.holdPhase !== template.phase;
  const nextDueAt = template.phase === "scheduled"
    ? nextScheduledDueDate(current?.nextDueAt, template.firstDueAt, template.scheduleInterval, template.scheduleUnit, effectiveAt)
    : current?.nextDueAt ?? template.firstDueAt;
  await transaction.insert(kioskEquipmentState).values({
    equipmentId,
    warehouseId,
    nextDueAt,
    lastPassedAt: effectiveAt,
    outOfService: remainsOnHold,
    holdReason: remainsOnHold ? current?.holdReason ?? null : null,
    holdPhase: remainsOnHold ? current?.holdPhase ?? null : null,
    updatedAt: effectiveAt,
  }).onConflictDoUpdate({
    target: kioskEquipmentState.equipmentId,
    set: {
      warehouseId,
      ...(template.phase === "scheduled" ? { nextDueAt } : {}),
      lastPassedAt: effectiveAt,
      outOfService: remainsOnHold,
      holdReason: remainsOnHold ? current?.holdReason ?? null : null,
      holdPhase: remainsOnHold ? current?.holdPhase ?? null : null,
      updatedAt: effectiveAt,
    },
  });
};

export function registerKioskRoutes(app: Express) {
  const router = Router({ mergeParams: true });

  router.use(async (req, res, next) => {
    try {
      const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.slug, req.params.warehouseSlug));
      if (!warehouse || !warehouse.enabled || !warehouse.isKioskWarehouse) {
        return res.status(404).json({ error: "Kiosk not found" });
      }
      req.kioskWarehouse = warehouse;
      const token = cookieValue(req);
      if (token) {
        const [session] = await db.select().from(kioskSessions).where(and(
          eq(kioskSessions.tokenHash, hashToken(token)),
          eq(kioskSessions.warehouseId, warehouse.id),
          gt(kioskSessions.expiresAt, new Date()),
        ));
        if (session) {
          const [user] = await db.select().from(kioskUsers).where(and(
            eq(kioskUsers.id, session.userId),
            eq(kioskUsers.warehouseId, warehouse.id),
            eq(kioskUsers.active, true),
          ));
          if (user) {
            req.kioskUser = user;
            req.kioskSessionToken = token;
            await db.update(kioskSessions)
              .set({ expiresAt: new Date(Date.now() + SESSION_LENGTH_MS) })
              .where(eq(kioskSessions.tokenHash, session.tokenHash));
            setSessionCookie(res, token);
          } else {
            await db.delete(kioskSessions).where(eq(kioskSessions.tokenHash, session.tokenHash));
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (req, res) => {
    const warehouse = getWarehouse(req);
    const admins = await db.select({ id: kioskUsers.id }).from(kioskUsers).where(and(
      eq(kioskUsers.warehouseId, warehouse.id),
      eq(kioskUsers.role, "admin"),
    ));
    res.json({
      warehouse: { id: warehouse.id, name: warehouse.name, slug: warehouse.slug },
      needsSetup: admins.length === 0,
      user: req.kioskUser ? publicUser(req.kioskUser) : null,
    });
  });

  router.post("/setup", async (req, res) => {
    try {
      const warehouse = getWarehouse(req);
      const input = accountInputSchema.parse(req.body);
      const badge = await makeBadge();
      const pinHash = await hashPin(input.pin);
      const sessionToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_LENGTH_MS);
      const user = await db.transaction(async (transaction) => {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${warehouse.id}))`);
        const existingAdmins = await transaction.select({ id: kioskUsers.id }).from(kioskUsers).where(and(
          eq(kioskUsers.warehouseId, warehouse.id),
          eq(kioskUsers.role, "admin"),
        ));
        if (existingAdmins.length) throw new Error("Initial administrator setup is already complete");
        const [created] = await transaction.insert(kioskUsers).values({
          warehouseId: warehouse.id,
          name: input.name,
          badgeTokenHash: badge.tokenHash,
          pinHash,
          role: "admin",
        }).returning();
        await transaction.insert(kioskSessions).values({
          tokenHash: hashToken(sessionToken),
          userId: created.id,
          warehouseId: warehouse.id,
          expiresAt,
        });
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: created.id,
          action: "administrator_created",
          equipmentIds: [],
          details: { initialSetup: true },
        });
        return created;
      });
      setSessionCookie(res, sessionToken);
      res.status(201).json({ user: publicUser(user), badgeToken: badge.token, badgeQrCode: badge.qrCode });
    } catch (error) {
      if (error instanceof Error && error.message === "Initial administrator setup is already complete") {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid setup data" });
      console.error("Kiosk administrator setup failed:", error);
      res.status(500).json({ error: "Unable to complete administrator setup" });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const input = z.object({
        badgeToken: z.string().min(1).max(256),
        pin: z.string().regex(/^\d{6,12}$/),
      }).parse(req.body);
      const warehouse = getWarehouse(req);
      const token = badgeValue(input.badgeToken);
      const loginResult = await db.transaction(async (transaction) => {
        const [user] = await transaction.select().from(kioskUsers).where(and(
          eq(kioskUsers.warehouseId, warehouse.id),
          eq(kioskUsers.badgeTokenHash, hashToken(token)),
        )).for("update");
        if (!user || !user.active) return { error: "invalid" as const };
        if (user.lockedUntil && user.lockedUntil > new Date()) return { error: "locked" as const };
        if (!(await verifyPin(input.pin, user.pinHash))) {
          const failedLoginCount = user.failedLoginCount + 1;
          await transaction.update(kioskUsers).set({
            failedLoginCount: failedLoginCount >= MAX_PIN_FAILURES ? 0 : failedLoginCount,
            lockedUntil: failedLoginCount >= MAX_PIN_FAILURES ? new Date(Date.now() + PIN_LOCKOUT_MS) : null,
          }).where(eq(kioskUsers.id, user.id));
          return { error: failedLoginCount >= MAX_PIN_FAILURES ? "locked" as const : "invalid" as const };
        }
        const [updatedUser] = await transaction.update(kioskUsers).set({
          failedLoginCount: 0,
          lockedUntil: null,
        }).where(eq(kioskUsers.id, user.id)).returning();
        return { user: updatedUser };
      });
      if ("error" in loginResult) {
        if (loginResult.error === "locked") return res.status(429).json({ error: "Too many attempts. Try again after the lockout period." });
        return res.status(401).json({ error: "Invalid badge or PIN" });
      }
      await createSession(loginResult.user, res, "signed_in");
      res.json({ user: publicUser(loginResult.user) });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a valid badge and PIN" });
      console.error("Kiosk sign-in failed:", error);
      res.status(500).json({ error: "Unable to sign in" });
    }
  });

  router.post("/logout", async (req, res) => {
    if (req.kioskSessionToken) {
      await db.transaction(async (transaction) => {
        await transaction.delete(kioskSessions).where(eq(kioskSessions.tokenHash, hashToken(req.kioskSessionToken!)));
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: getWarehouse(req).id,
          actorId: req.kioskUser?.id ?? null,
          action: "signed_out",
          equipmentIds: [],
          details: {},
        });
      });
    }
    clearSessionCookie(res);
    res.status(204).send();
  });

  router.get("/users", requireRole("admin"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const users = await db.select({
      id: kioskUsers.id,
      name: kioskUsers.name,
      role: kioskUsers.role,
      active: kioskUsers.active,
      createdAt: kioskUsers.createdAt,
    }).from(kioskUsers).where(eq(kioskUsers.warehouseId, warehouse.id)).orderBy(kioskUsers.name);
    res.json(users);
  });

  router.post("/users", requireRole("admin"), async (req, res) => {
    try {
      const input = z.object({
        name: z.string().trim().min(1).max(120),
        role: z.enum(["admin", "supervisor", "technician"]),
        pin: z.string().regex(/^\d{6,12}$/).optional(),
      }).parse(req.body);
      const warehouse = getWarehouse(req);
      const badge = await makeBadge();
      const pin = input.pin ?? randomInt(100000, 1000000).toString();
      const user = await db.transaction(async (transaction) => {
        const [created] = await transaction.insert(kioskUsers).values({
          warehouseId: warehouse.id,
          name: input.name,
          badgeTokenHash: badge.tokenHash,
          pinHash: await hashPin(pin),
          role: input.role,
        }).returning();
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: getUser(req).id,
          action: "user_created",
          equipmentIds: [],
          details: { userId: created.id, role: created.role },
        });
        return created;
      });
      res.status(201).json({ user: publicUser(user), pin, badgeToken: badge.token, badgeQrCode: badge.qrCode });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid account data" });
      console.error("Kiosk user creation failed:", error);
      res.status(500).json({ error: "Unable to create account" });
    }
  });

  router.patch("/users/:id", requireRole("admin"), async (req, res) => {
    try {
      const input = z.object({
        active: z.boolean().optional(),
        role: z.enum(["admin", "supervisor", "technician"]).optional(),
      }).refine((value) => Object.keys(value).length > 0).parse(req.body);
      const warehouse = getWarehouse(req);
      const updated = await db.transaction(async (transaction) => {
        await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${warehouse.id}))`);
        const [target] = await transaction.select().from(kioskUsers).where(and(
          eq(kioskUsers.id, req.params.id),
          eq(kioskUsers.warehouseId, warehouse.id),
        )).for("update");
        if (!target) return undefined;
        const removingAdmin = target.role === "admin" &&
          ((input.active === false) || (input.role && input.role !== "admin"));
        if (removingAdmin) {
          const otherAdmins = await transaction.select({ id: kioskUsers.id }).from(kioskUsers).where(and(
            eq(kioskUsers.warehouseId, warehouse.id),
            eq(kioskUsers.role, "admin"),
            eq(kioskUsers.active, true),
          ));
          if (otherAdmins.length <= 1) throw new Error("At least one active administrator must remain");
        }
        const [saved] = await transaction.update(kioskUsers).set({ ...input, updatedAt: new Date() })
          .where(eq(kioskUsers.id, target.id)).returning();
        if (input.active === false) await transaction.delete(kioskSessions).where(eq(kioskSessions.userId, target.id));
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: getUser(req).id,
          action: "user_updated",
          equipmentIds: [],
          details: { userId: target.id, changes: input },
        });
        return saved;
      });
      if (!updated) return res.status(404).json({ error: "Account not found" });
      res.json(publicUser(updated));
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid account update" });
      if (error instanceof Error && error.message === "At least one active administrator must remain") {
        return res.status(400).json({ error: error.message });
      }
      console.error("Kiosk user update failed:", error);
      res.status(500).json({ error: "Unable to update account" });
    }
  });

  router.post("/users/:id/reset-credentials", requireRole("admin"), async (req, res) => {
    try {
      const pinInput = z.object({ pin: z.string().regex(/^\d{6,12}$/).optional() }).parse(req.body ?? {});
      const warehouse = getWarehouse(req);
      const [target] = await db.select().from(kioskUsers).where(and(
        eq(kioskUsers.id, req.params.id),
        eq(kioskUsers.warehouseId, warehouse.id),
      ));
      if (!target) return res.status(404).json({ error: "Account not found" });
      const badge = await makeBadge();
      const pin = pinInput.pin ?? randomInt(100000, 1000000).toString();
      const pinHash = await hashPin(pin);
      const updated = await db.transaction(async (transaction) => {
        const [saved] = await transaction.update(kioskUsers).set({
          badgeTokenHash: badge.tokenHash,
          pinHash,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: new Date(),
        }).where(and(
          eq(kioskUsers.id, target.id),
          eq(kioskUsers.warehouseId, warehouse.id),
        )).returning();
        if (!saved) return undefined;
        await transaction.delete(kioskSessions).where(eq(kioskSessions.userId, target.id));
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: getUser(req).id,
          action: "user_credentials_reset",
          equipmentIds: [],
          details: { userId: target.id },
        });
        return saved;
      });
      if (!updated) return res.status(404).json({ error: "Account not found" });
      res.json({ user: publicUser(updated), pin, badgeToken: badge.token, badgeQrCode: badge.qrCode });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid PIN" });
      console.error("Kiosk credential reset failed:", error);
      res.status(500).json({ error: "Unable to reset credentials" });
    }
  });

  router.get("/equipment", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const items = await db.select({
      item: equipment,
      state: kioskEquipmentState,
    }).from(equipment)
      .innerJoin(toolboxes, eq(equipment.toolboxId, toolboxes.id))
      .leftJoin(kioskEquipmentState, and(
        eq(equipment.id, kioskEquipmentState.equipmentId),
        eq(kioskEquipmentState.warehouseId, warehouse.id),
      ))
      .where(eq(toolboxes.warehouseId, warehouse.id))
      .orderBy(equipment.category, equipment.name);
    const templates = await db.select().from(kioskTemplates).where(and(
      eq(kioskTemplates.warehouseId, warehouse.id),
      eq(kioskTemplates.active, true),
    ));
    res.json(items.map(({ item, state }) => ({
      ...item,
      kioskState: state ?? null,
      forms: {
        preCheckout: templates.some((template) =>
          template.phase === "pre_checkout" &&
          (template.equipmentIds.includes(item.id) || (template.equipmentIds.length === 0 && template.category === item.category)),
        ),
        scheduled: templates.some((template) =>
          template.phase === "scheduled" &&
          (template.equipmentIds.includes(item.id) || (template.equipmentIds.length === 0 && template.category === item.category)),
        ),
      },
    })));
  });

  router.get("/templates", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const templates = await db.select().from(kioskTemplates).where(eq(kioskTemplates.warehouseId, warehouse.id))
      .orderBy(desc(kioskTemplates.createdAt));
    res.json(templates.map(({ pdfPath: _pdfPath, ...template }) => template));
  });

  router.post(
    "/templates/upload",
    requireRole("admin"),
    raw({ type: "application/pdf", limit: "8mb" }),
    async (req, res) => {
      let filePath: string | undefined;
      try {
        const warehouse = getWarehouse(req);
        const name = req.header("x-template-name")?.trim();
        if (!name || name.length > 160) return res.status(400).json({ error: "Enter a form name" });
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Upload a PDF file" });
        let pdf: PDFDocument;
        try {
          pdf = await PDFDocument.load(req.body);
        } catch {
          return res.status(400).json({ error: "The file could not be read as a PDF" });
        }
        const { fields, revision } = await inspectKioskPdf(pdf, req.body);
        if (!fields.length) return res.status(400).json({ error: "This PDF has no supported fillable fields" });
        const [latest] = await db.select({ version: kioskTemplates.version }).from(kioskTemplates).where(and(
          eq(kioskTemplates.warehouseId, warehouse.id),
          eq(kioskTemplates.name, name),
        )).orderBy(desc(kioskTemplates.version)).limit(1);
        const id = randomBytes(16).toString("hex");
        filePath = storedPdfPath(warehouse.id, id);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, req.body);
        const template = await db.transaction(async (transaction) => {
          const [created] = await transaction.insert(kioskTemplates).values({
            id,
            warehouseId: warehouse.id,
            name,
            version: (latest?.version ?? 0) + 1,
            phase: "pre_checkout",
            revision,
            fields,
            pdfPath: filePath!,
            active: false,
            createdBy: getUser(req).id,
          }).returning();
          await transaction.insert(kioskAuditEvents).values({
            warehouseId: warehouse.id,
            actorId: getUser(req).id,
            action: "template_uploaded",
            equipmentIds: [],
            details: { templateId: created.id, name, version: created.version },
          });
          return created;
        });
        const { pdfPath: _pdfPath, ...publicTemplate } = template;
        res.status(201).json(publicTemplate);
      } catch (error) {
        if (filePath) await removeStoredPdf(filePath);
        if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid PDF upload" });
        console.error("Kiosk PDF upload failed:", error);
        res.status(500).json({ error: "Unable to save the uploaded form" });
      }
    },
  );

  router.put("/templates/:id", requireRole("admin"), async (req, res) => {
    try {
      const input = templateConfigSchema.parse(req.body);
      const warehouse = getWarehouse(req);
      const [template] = await db.select().from(kioskTemplates).where(and(
        eq(kioskTemplates.id, req.params.id),
        eq(kioskTemplates.warehouseId, warehouse.id),
      ));
      if (!template) return res.status(404).json({ error: "Form version not found" });
      if (template.active) return res.status(409).json({ error: "Published form versions cannot be edited; upload a new version" });
      if (!input.category && !input.equipmentIds.length) {
        return res.status(400).json({ error: "Assign the form to a category or specific equipment" });
      }
      if (input.phase === "scheduled" && (
        !input.scheduleInterval || !input.scheduleUnit || !input.firstDueAt
      )) return res.status(400).json({ error: "Scheduled forms need an interval and first due date" });
      if (input.phase === "pre_checkout" && (
        input.scheduleInterval || input.scheduleUnit || input.firstDueAt
      )) return res.status(400).json({ error: "Pre-check forms cannot have a recurring schedule" });
      if (input.firstDueAt && Number.isNaN(new Date(input.firstDueAt).getTime())) {
        return res.status(400).json({ error: "Enter a valid first due date" });
      }
      const existingNames = template.fields.map((field) => field.name);
      const configuredNames = input.fields.map((field) => field.name);
      if (
        new Set(configuredNames).size !== configuredNames.length ||
        existingNames.length !== configuredNames.length ||
        existingNames.some((fieldName) => !configuredNames.includes(fieldName))
      ) return res.status(400).json({ error: "Form fields must match the fields detected in the uploaded PDF" });
      const fields = input.fields.map((field) => {
        const detected = template.fields.find((candidate) => candidate.name === field.name)!;
        if (
          detected.type !== field.type ||
          detected.multiline !== field.multiline ||
          JSON.stringify(detected.options) !== JSON.stringify(field.options) ||
          !pdfBindingsMatch(detected.pdfBindings, field.pdfBindings)
        ) {
          throw new Error("Form field type and options cannot be changed");
        }
        return field;
      });
      if (fields.some((field) => field.source !== "answer" && field.type !== "text")) {
        return res.status(400).json({ error: "Automatic signoff fields must be PDF text fields" });
      }
      if (!input.requiresSupervisorApproval && fields.some((field) => field.source === "supervisor_name")) {
        return res.status(400).json({ error: "Enable supervisor approval to use a supervisor signoff field" });
      }
      if (input.equipmentIds.length) {
        const assigned = await db.select({ id: equipment.id }).from(equipment)
          .innerJoin(toolboxes, eq(equipment.toolboxId, toolboxes.id))
          .where(and(
            eq(toolboxes.warehouseId, warehouse.id),
            inArray(equipment.id, input.equipmentIds),
          ));
        if (assigned.length !== new Set(input.equipmentIds).size) {
          return res.status(400).json({ error: "Every assigned item must belong to this warehouse" });
        }
      }
      const competingTemplates = await db.select().from(kioskTemplates).where(and(
        eq(kioskTemplates.warehouseId, warehouse.id),
        eq(kioskTemplates.phase, input.phase),
        eq(kioskTemplates.active, true),
      ));
      const scopeConflict = competingTemplates.some((other) => {
        if (other.name === input.name) return false;
        if (input.category && other.category === input.category && other.equipmentIds.length === 0) return true;
        return input.equipmentIds.some((id) => other.equipmentIds.includes(id));
      });
      if (scopeConflict) {
        return res.status(409).json({ error: "Another published form already covers this category or equipment item" });
      }
      const published = await db.transaction(async (transaction) => {
        await transaction.update(kioskTemplates).set({ active: false }).where(and(
          eq(kioskTemplates.warehouseId, warehouse.id),
          eq(kioskTemplates.name, input.name),
          eq(kioskTemplates.active, true),
        ));
        const [updated] = await transaction.update(kioskTemplates).set({
          name: input.name,
          phase: input.phase,
          category: input.category,
          equipmentIds: input.equipmentIds,
          fields,
          allowBatch: input.allowBatch,
          scheduleInterval: input.scheduleInterval,
          scheduleUnit: input.scheduleUnit,
          firstDueAt: input.firstDueAt ? new Date(input.firstDueAt) : null,
          requiresSupervisorApproval: input.requiresSupervisorApproval,
          active: true,
        }).where(eq(kioskTemplates.id, template.id)).returning();
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: getUser(req).id,
          action: "template_published",
          equipmentIds: [],
          details: {
            templateId: updated.id,
            name: updated.name,
            version: updated.version,
            phase: updated.phase,
          },
        });
        return updated;
      });
      const { pdfPath: _pdfPath, ...publicTemplate } = published;
      res.json(publicTemplate);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid form settings" });
      if (error instanceof Error && error.message === "Form field type and options cannot be changed") {
        return res.status(400).json({ error: error.message });
      }
      console.error("Kiosk form configuration failed:", error);
      res.status(500).json({ error: "Unable to publish form version" });
    }
  });

  router.post("/submissions", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    let outputPath: string | undefined;
    try {
      const input = submissionInputSchema.parse(req.body);
      const warehouse = getWarehouse(req);
      const user = getUser(req);
      const [template] = await db.select().from(kioskTemplates).where(and(
        eq(kioskTemplates.id, input.templateId),
        eq(kioskTemplates.warehouseId, warehouse.id),
        eq(kioskTemplates.active, true),
      ));
      if (!template) return res.status(404).json({ error: "Active form not found" });
      if (template.phase === "pre_checkout" && !input.workOrder?.trim()) {
        return res.status(400).json({ error: "A work order is required for a pre-check" });
      }
      if (!template.allowBatch && input.equipmentIds.length !== 1) {
        return res.status(400).json({ error: "This form is configured for one item at a time" });
      }
      const items = await db.select({ item: equipment }).from(equipment)
        .innerJoin(toolboxes, eq(equipment.toolboxId, toolboxes.id))
        .where(and(
          eq(toolboxes.warehouseId, warehouse.id),
          inArray(equipment.id, input.equipmentIds),
        ));
      if (items.length !== new Set(input.equipmentIds).size) {
        return res.status(400).json({ error: "Every selected item must belong to this warehouse" });
      }
      for (const { item } of items) {
        if (item.status !== "available") {
          return res.status(409).json({ error: `${item.name} must be checked in before it can be inspected` });
        }
        const assignedTemplate = await applicableTemplate(warehouse.id, item, template.phase);
        if (assignedTemplate?.id !== template.id) {
          return res.status(400).json({ error: "This form is not assigned to every selected item" });
        }
      }
      const validationError = validateKioskAnswers(template.fields, input.answers);
      if (validationError) return res.status(400).json({ error: validationError });

      const submittedAt = new Date();
      const pdfBytes = await fillKioskPdf(await readFile(template.pdfPath), template.fields, input.answers, {
        technicianName: user.name,
        workOrder: input.workOrder ?? "",
        submittedAt,
      });
      const submissionId = randomBytes(16).toString("hex");
      outputPath = storedPdfPath(warehouse.id, `submission-${submissionId}`);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, pdfBytes);
      const status = template.requiresSupervisorApproval ? "pending_approval" : "approved";
      const submission = await db.transaction(async (transaction) => {
        const lockedItems = await transaction.select().from(equipment)
          .where(inArray(equipment.id, input.equipmentIds))
          .for("update");
        if (lockedItems.length !== input.equipmentIds.length || lockedItems.some((item) => item.status !== "available")) {
          throw new Error("Every selected item must be checked in before it can be inspected");
        }
        const [created] = await transaction.insert(kioskSubmissions).values({
          id: submissionId,
          warehouseId: warehouse.id,
          templateId: template.id,
          equipmentIds: input.equipmentIds,
          phase: template.phase,
          workOrder: input.workOrder?.trim() || null,
          technicianId: user.id,
          answers: input.answers,
          result: input.result,
          status,
          pdfPath: outputPath!,
          submittedAt,
          approvedAt: status === "approved" ? submittedAt : null,
        }).returning();
        if (status === "approved" || input.result === "failed") {
          for (const equipmentId of input.equipmentIds) {
            await updateInspectionState(transaction, warehouse.id, equipmentId, template, input.result, submittedAt);
          }
        }
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: user.id,
          action: "inspection_submitted",
          equipmentIds: input.equipmentIds,
          details: {
            submissionId,
            templateId: template.id,
            phase: template.phase,
            result: input.result,
            status,
            workOrder: input.workOrder,
          },
        });
        return created;
      });
      res.status(201).json({
        id: submission.id,
        phase: submission.phase,
        result: submission.result,
        status: submission.status,
        pdfUrl: `/api/kiosk/${warehouse.slug}/submissions/${submission.id}/pdf`,
      });
    } catch (error) {
      if (outputPath) await removeStoredPdf(outputPath);
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid inspection" });
      if (error instanceof Error && error.message === "Every selected item must be checked in before it can be inspected") {
        return res.status(409).json({ error: error.message });
      }
      console.error("Kiosk inspection submission failed:", error);
      res.status(500).json({ error: "Unable to save inspection" });
    }
  });

  router.get("/submissions", requireRole("admin", "supervisor"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const searchTerm = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const equipmentMatches = searchTerm ? sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${kioskSubmissions.equipmentIds}) AS submitted_item(equipment_id)
      JOIN equipment AS matched_equipment ON matched_equipment.id = submitted_item.equipment_id
      WHERE matched_equipment.name ILIKE ${`%${searchTerm}%`}
    )` : undefined;
    const rows = await db.select({
      submission: kioskSubmissions,
      templateName: kioskTemplates.name,
      templateVersion: kioskTemplates.version,
      technicianName: kioskUsers.name,
    }).from(kioskSubmissions)
      .innerJoin(kioskTemplates, eq(kioskSubmissions.templateId, kioskTemplates.id))
      .innerJoin(kioskUsers, eq(kioskSubmissions.technicianId, kioskUsers.id))
      .where(and(
        eq(kioskSubmissions.warehouseId, warehouse.id),
        searchTerm ? or(
          ilike(kioskTemplates.name, `%${searchTerm}%`),
          ilike(kioskUsers.name, `%${searchTerm}%`),
          ilike(kioskSubmissions.workOrder, `%${searchTerm}%`),
          sql`${kioskSubmissions.equipmentIds}::text ILIKE ${`%${searchTerm}%`}`,
          equipmentMatches,
        ) : undefined,
      ))
      .orderBy(desc(kioskSubmissions.submittedAt))
      .limit(1000);
    const warehouseItems = await db.select({ id: equipment.id, name: equipment.name }).from(equipment)
      .innerJoin(toolboxes, eq(equipment.toolboxId, toolboxes.id))
      .where(eq(toolboxes.warehouseId, warehouse.id));
    const equipmentNames = new Map(warehouseItems.map((item) => [item.id, item.name]));
    res.json(rows.map(({ submission, ...row }) => ({
      ...submission,
      pdfPath: undefined,
      equipmentNames: submission.equipmentIds.map((id) => equipmentNames.get(id) ?? id),
      templateName: row.templateName,
      templateVersion: row.templateVersion,
      technicianName: row.technicianName,
      pdfUrl: `/api/kiosk/${warehouse.slug}/submissions/${submission.id}/pdf`,
    })));
  });

  router.get("/submissions/:id/pdf", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const [submission] = await db.select().from(kioskSubmissions).where(and(
      eq(kioskSubmissions.id, req.params.id),
      eq(kioskSubmissions.warehouseId, warehouse.id),
    ));
    if (!submission) return res.status(404).json({ error: "Inspection not found" });
    if (req.kioskUser?.role === "technician" && submission.technicianId !== req.kioskUser.id) {
      return res.status(403).json({ error: "You cannot access another technician's inspection" });
    }
    res.type("application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="inspection-${submission.id}.pdf"`);
    res.send(await readFile(submission.pdfPath));
  });

  router.post("/submissions/:id/review", requireRole("supervisor"), async (req, res) => {
    let reviewedPdfPath: string | undefined;
    let reviewCommitted = false;
    try {
      const { decision, notes } = z.object({
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().trim().max(1000).optional(),
      }).parse(req.body);
      const warehouse = getWarehouse(req);
      const supervisor = getUser(req);
      const [submission] = await db.select().from(kioskSubmissions).where(and(
        eq(kioskSubmissions.id, req.params.id),
        eq(kioskSubmissions.warehouseId, warehouse.id),
      ));
      if (!submission) return res.status(404).json({ error: "Inspection not found" });
      if (submission.technicianId === supervisor.id) {
        return res.status(403).json({ error: "A different supervisor must review this inspection" });
      }
      if (submission.status !== "pending_approval") {
        return res.status(409).json({ error: "This inspection is no longer awaiting approval" });
      }
      const [template] = await db.select().from(kioskTemplates).where(eq(kioskTemplates.id, submission.templateId));
      const [technician] = await db.select({ name: kioskUsers.name }).from(kioskUsers)
        .where(eq(kioskUsers.id, submission.technicianId));
      if (!template || !technician) return res.status(409).json({ error: "Inspection records are incomplete" });
      if (decision === "approved") {
        const pdfBytes = await fillKioskPdf(await readFile(template.pdfPath), template.fields, submission.answers, {
          technicianName: technician.name,
          workOrder: submission.workOrder ?? "",
          submittedAt: submission.submittedAt,
          supervisorName: supervisor.name,
        });
        reviewedPdfPath = storedPdfPath(warehouse.id, `submission-${submission.id}-approved-${randomBytes(8).toString("hex")}`);
        await writeFile(reviewedPdfPath, pdfBytes);
      }
      const approvedAt = new Date();
      await db.transaction(async (transaction) => {
        await transaction.select({ id: equipment.id }).from(equipment)
          .where(inArray(equipment.id, submission.equipmentIds))
          .for("update");
        const [reviewed] = await transaction.update(kioskSubmissions).set({
          status: decision,
          supervisorId: supervisor.id,
          approvedAt: decision === "approved" ? approvedAt : null,
          ...(reviewedPdfPath ? { pdfPath: reviewedPdfPath } : {}),
        }).where(and(
          eq(kioskSubmissions.id, submission.id),
          eq(kioskSubmissions.status, "pending_approval"),
        )).returning({ id: kioskSubmissions.id });
        if (!reviewed) throw new Error("Inspection is no longer awaiting approval");
        for (const equipmentId of submission.equipmentIds) {
          if (decision === "approved" || decision === "rejected") {
            await updateInspectionState(
              transaction,
              warehouse.id,
              equipmentId,
              template,
              decision === "approved" ? submission.result : "failed",
              approvedAt,
            );
          }
        }
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: supervisor.id,
          action: `inspection_${decision}`,
          equipmentIds: submission.equipmentIds,
          details: { submissionId: submission.id, notes: notes ?? "" },
        });
      });
      reviewCommitted = true;
      if (reviewedPdfPath) {
        try {
          await removeStoredPdf(submission.pdfPath);
        } catch (error) {
          console.error("Unable to remove the superseded inspection PDF:", error);
        }
      }
      res.json({ id: submission.id, status: decision });
    } catch (error) {
      if (reviewedPdfPath && !reviewCommitted) {
        try {
          await removeStoredPdf(reviewedPdfPath);
        } catch (cleanupError) {
          console.error("Unable to remove an uncommitted inspection PDF:", cleanupError);
        }
      }
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid review decision" });
      if (error instanceof Error && error.message === "Inspection is no longer awaiting approval") {
        return res.status(409).json({ error: error.message });
      }
      console.error("Kiosk inspection review failed:", error);
      res.status(500).json({ error: "Unable to review inspection" });
    }
  });

  router.post("/checkout", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    try {
      const { equipmentIds, workOrder, submissionId } = z.object({
        equipmentIds: z.array(z.string().min(1)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
        workOrder: z.string().trim().min(1).max(120),
        submissionId: z.string().min(1),
      }).parse(req.body);
      const warehouse = getWarehouse(req);
      const user = getUser(req);
      const [submission] = await db.select().from(kioskSubmissions).where(and(
        eq(kioskSubmissions.id, submissionId),
        eq(kioskSubmissions.warehouseId, warehouse.id),
      ));
      if (
        !submission ||
        submission.phase !== "pre_checkout" ||
        submission.result !== "passed" ||
        submission.status !== "approved" ||
        submission.workOrder !== workOrder ||
        submission.technicianId !== user.id ||
        JSON.stringify([...submission.equipmentIds].sort()) !== JSON.stringify([...equipmentIds].sort())
      ) return res.status(400).json({ error: "Complete and pass the required pre-check before checkout" });
      const items = await db.select({ item: equipment }).from(equipment)
        .innerJoin(toolboxes, eq(equipment.toolboxId, toolboxes.id))
        .where(and(
          eq(toolboxes.warehouseId, warehouse.id),
          inArray(equipment.id, equipmentIds),
        ));
      if (items.length !== new Set(equipmentIds).size) return res.status(400).json({ error: "Selected items are not in this warehouse" });
      const scheduledByEquipment = new Map<string, KioskTemplate | undefined>();
      for (const { item } of items) {
        const scheduled = await applicableTemplate(warehouse.id, item, "scheduled");
        scheduledByEquipment.set(item.id, scheduled);
        const [state] = await db.select().from(kioskEquipmentState).where(and(
          eq(kioskEquipmentState.equipmentId, item.id),
          eq(kioskEquipmentState.warehouseId, warehouse.id),
        ));
        const dueAt = state?.nextDueAt ?? scheduled?.firstDueAt;
        if (state?.outOfService) return res.status(409).json({ error: `${item.name} is on hold: ${state.holdReason ?? "inspection required"}` });
        if (dueAt && dueAt <= new Date()) return res.status(409).json({ error: `${item.name} is due for a scheduled inspection` });
        if (scheduled && !dueAt) return res.status(409).json({ error: `${item.name} has no scheduled inspection due date configured` });
      }
      const checkout = await db.transaction(async (transaction) => {
        const lockedItems = await transaction.select().from(equipment)
          .where(inArray(equipment.id, equipmentIds))
          .for("update");
        if (lockedItems.length !== new Set(equipmentIds).size || lockedItems.some((item) => item.status !== "available")) {
          throw new Error("One or more selected items are no longer available");
        }
        for (const item of lockedItems) {
          const [state] = await transaction.select().from(kioskEquipmentState)
            .where(and(
              eq(kioskEquipmentState.equipmentId, item.id),
              eq(kioskEquipmentState.warehouseId, warehouse.id),
            ))
            .for("update");
          const scheduled = scheduledByEquipment.get(item.id);
          const dueAt = state?.nextDueAt ?? scheduled?.firstDueAt;
          if (state?.outOfService) throw new Error(`${item.name} is on hold for an inspection`);
          if (dueAt && dueAt <= new Date()) throw new Error(`${item.name} is due for a scheduled inspection`);
          if (scheduled && !dueAt) throw new Error(`${item.name} has no scheduled inspection due date configured`);
        }
        const [record] = await transaction.insert(kioskCheckouts).values({
          warehouseId: warehouse.id,
          equipmentIds,
          workOrder,
          technicianId: user.id,
          checkoutSubmissionId: submission.id,
        }).returning();
        for (const id of equipmentIds) {
          await transaction.update(equipment).set({
            status: "checked_out",
            location: "Checked Out",
            workOrder,
            checkedOutBy: user.name,
            checkedOutAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(equipment.id, id));
          await transaction.insert(equipmentHistory).values({
            equipmentId: id,
            action: "checkout",
            details: `Checked out by ${user.name}`,
            workOrder,
          });
        }
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: user.id,
          action: "equipment_checked_out",
          equipmentIds,
          details: { workOrder, checkoutId: record.id, submissionId: submission.id },
        });
        return record;
      });
      res.status(201).json(checkout);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid checkout request" });
      if (error instanceof Error && error.message === "One or more selected items are no longer available") {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof Error && /on hold for an inspection|due for a scheduled inspection|no scheduled inspection due date/.test(error.message)) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Kiosk checkout failed:", error);
      res.status(500).json({ error: "Unable to check out equipment" });
    }
  });

  router.get("/checkouts", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const query = db.select({
      checkout: kioskCheckouts,
      technicianName: kioskUsers.name,
    }).from(kioskCheckouts)
      .innerJoin(kioskUsers, eq(kioskCheckouts.technicianId, kioskUsers.id))
      .where(and(
        eq(kioskCheckouts.warehouseId, warehouse.id),
        isNull(kioskCheckouts.returnedAt),
      )).orderBy(desc(kioskCheckouts.checkedOutAt));
    res.json(await query);
  });

  router.post("/checkouts/:id/checkin", requireRole("admin", "supervisor", "technician"), async (req, res) => {
    try {
      const { notes } = z.object({ notes: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
      const warehouse = getWarehouse(req);
      const user = getUser(req);
      const [record] = await db.select().from(kioskCheckouts).where(and(
        eq(kioskCheckouts.id, req.params.id),
        eq(kioskCheckouts.warehouseId, warehouse.id),
      ));
      if (!record) return res.status(404).json({ error: "Checkout not found" });
      if (record.returnedAt) return res.status(409).json({ error: "This checkout has already been returned" });
      await db.transaction(async (transaction) => {
        const lockedItems = await transaction.select({ id: equipment.id }).from(equipment)
          .where(inArray(equipment.id, record.equipmentIds))
          .for("update");
        if (lockedItems.length !== record.equipmentIds.length) throw new Error("Checkout equipment was not found");
        const [checkedIn] = await transaction.update(kioskCheckouts).set({
          returnedAt: new Date(),
          checkedInBy: user.id,
          checkInNotes: notes ?? null,
        }).where(and(
          eq(kioskCheckouts.id, record.id),
          isNull(kioskCheckouts.returnedAt),
        )).returning({ id: kioskCheckouts.id });
        if (!checkedIn) throw new Error("This checkout has already been returned");
        for (const id of record.equipmentIds) {
          await transaction.update(equipment).set({
            status: "available",
            location: "Shop",
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            updatedAt: new Date(),
          }).where(eq(equipment.id, id));
          await transaction.insert(equipmentHistory).values({
            equipmentId: id,
            action: "checkin",
            details: `Checked in by ${user.name}${notes ? `: ${notes}` : ""}`,
            workOrder: record.workOrder,
          });
        }
        await transaction.insert(kioskAuditEvents).values({
          warehouseId: warehouse.id,
          actorId: user.id,
          action: "equipment_checked_in",
          equipmentIds: record.equipmentIds,
          details: { checkoutId: record.id, workOrder: record.workOrder, notes: notes ?? "" },
        });
      });
      res.json({ id: record.id, returnedAt: new Date() });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid check-in notes" });
      if (error instanceof Error && error.message === "This checkout has already been returned") {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof Error && error.message === "Checkout equipment was not found") {
        return res.status(409).json({ error: error.message });
      }
      console.error("Kiosk check-in failed:", error);
      res.status(500).json({ error: "Unable to check in equipment" });
    }
  });

  router.get("/audit", requireRole("admin"), async (req, res) => {
    const warehouse = getWarehouse(req);
    const events = await db.select({
      event: kioskAuditEvents,
      actorName: kioskUsers.name,
    }).from(kioskAuditEvents)
      .leftJoin(kioskUsers, eq(kioskAuditEvents.actorId, kioskUsers.id))
      .where(eq(kioskAuditEvents.warehouseId, warehouse.id))
      .orderBy(desc(kioskAuditEvents.createdAt))
      .limit(500);
    res.json(events.map(({ event, actorName }) => ({ ...event, actorName })));
  });

  router.use((
    error: { status?: number; type?: string },
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (error.status === 413 || error.type === "entity.too.large") {
      return res.status(413).json({ error: "PDF upload exceeds the 8 MB limit" });
    }
    next(error);
  });

  app.use("/api/kiosk/:warehouseSlug", router);
}
