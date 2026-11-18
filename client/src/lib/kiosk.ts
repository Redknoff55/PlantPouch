import type { Equipment, KioskTemplate } from "@shared/schema";

export type KioskUser = {
  id: string;
  name: string;
  role: "admin" | "supervisor" | "technician";
  active: boolean;
};

export type KioskModule = {
  warehouse: { id: string; name: string; slug: string };
  needsSetup: boolean;
  user: KioskUser | null;
};

export type KioskEquipment = Equipment & {
  kioskState: {
    equipmentId: string;
    nextDueAt: string | null;
    lastPassedAt: string | null;
    outOfService: boolean;
    holdReason: string | null;
  } | null;
  forms: { preCheckout: boolean; scheduled: boolean };
};

export type KioskTemplateRecord = Omit<KioskTemplate, "createdAt"> & { createdAt: string };

export type KioskSubmission = {
  id: string;
  equipmentIds: string[];
  equipmentNames: string[];
  phase: string;
  workOrder: string | null;
  technicianId: string;
  technicianName: string;
  result: "passed" | "failed";
  status: "pending_approval" | "approved" | "rejected";
  submittedAt: string;
  templateName: string;
  templateVersion: number;
  pdfUrl: string;
};

async function request<T>(slug: string, route: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/kiosk/${encodeURIComponent(slug)}${route}`, {
    credentials: "same-origin",
    ...init,
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Kiosk request failed");
  return result as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const kioskApi = {
  module: (slug: string) => request<KioskModule>(slug, ""),
  setup: (slug: string, name: string, pin: string) =>
    request<{ user: KioskUser; badgeToken: string; badgeQrCode: string }>(slug, "/setup", json({ name, pin })),
  login: (slug: string, badgeToken: string, pin: string) =>
    request<{ user: KioskUser }>(slug, "/login", json({ badgeToken, pin })),
  logout: (slug: string) => request<void>(slug, "/logout", { method: "POST" }),
  equipment: (slug: string) => request<KioskEquipment[]>(slug, "/equipment"),
  templates: (slug: string) => request<KioskTemplateRecord[]>(slug, "/templates"),
  checkouts: (slug: string) => request<Array<{
    checkout: {
      id: string;
      equipmentIds: string[];
      workOrder: string;
      technicianId: string;
      checkedOutAt: string;
    };
    technicianName: string;
  }>>(slug, "/checkouts"),
  users: (slug: string) => request<Array<{
    id: string;
    name: string;
    role: KioskUser["role"];
    active: boolean;
    createdAt: string;
  }>>(slug, "/users"),
  createUser: (slug: string, body: { name: string; role: KioskUser["role"]; pin?: string }) =>
    request<{ user: KioskUser; pin: string; badgeToken: string; badgeQrCode: string }>(slug, "/users", json(body)),
  updateUser: (slug: string, id: string, body: { active?: boolean; role?: KioskUser["role"] }) =>
    request<KioskUser>(slug, `/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  resetCredentials: (slug: string, id: string) =>
    request<{ user: KioskUser; pin: string; badgeToken: string; badgeQrCode: string }>(
      slug,
      `/users/${encodeURIComponent(id)}/reset-credentials`,
      json({}),
    ),
  uploadTemplate: async (slug: string, name: string, file: File) =>
    request<KioskTemplateRecord>(slug, "/templates/upload", {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "X-Template-Name": name },
      body: await file.arrayBuffer(),
    }),
  publishTemplate: (slug: string, id: string, body: unknown) =>
    request<KioskTemplateRecord>(slug, `/templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  submissions: (slug: string, search = "") =>
    request<KioskSubmission[]>(slug, `/submissions${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  audit: (slug: string) => request<Array<{
    id: string;
    actorName: string | null;
    action: string;
    equipmentIds: string[];
    details: Record<string, unknown>;
    createdAt: string;
  }>>(slug, "/audit"),
  reviewSubmission: (slug: string, id: string, decision: "approved" | "rejected", notes: string) =>
    request<{ id: string; status: string }>(
      slug,
      `/submissions/${encodeURIComponent(id)}/review`,
      json({ decision, notes }),
    ),
  submitInspection: (slug: string, body: {
    templateId: string;
    equipmentIds: string[];
    workOrder: string | null;
    answers: Record<string, string | boolean>;
    result: "passed" | "failed";
  }) => request<{
    id: string;
    phase: string;
    result: "passed" | "failed";
    status: "pending_approval" | "approved" | "rejected";
    pdfUrl: string;
  }>(slug, "/submissions", json(body)),
  checkout: (slug: string, body: { equipmentIds: string[]; workOrder: string; submissionId: string }) =>
    request<{ id: string }>(slug, "/checkout", json(body)),
  checkin: (slug: string, id: string, notes: string) =>
    request<{ id: string; returnedAt: string }>(slug, `/checkouts/${encodeURIComponent(id)}/checkin`, json({ notes })),
};
