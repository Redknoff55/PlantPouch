import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ClipboardCheck, FileUp, KeyRound, QrCode, Save, ShieldCheck, Users } from "lucide-react";
import type { KioskTemplateField } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { kioskApi, type KioskSubmission, type KioskTemplateRecord, type KioskUser } from "@/lib/kiosk";

type AdminTab = "forms" | "users" | "signoffs" | "history" | "audit";
type Credential = { name: string; pin: string; token: string; qrCode: string };

export default function RiggingAdminPage() {
  const [, params] = useRoute("/kiosk/:warehouseSlug/admin");
  const slug = params?.warehouseSlug ?? "";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("forms");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loginError, setLoginError] = useState("");
  const [submissionSearch, setSubmissionSearch] = useState("");

  const moduleQuery = useQuery({
    queryKey: ["kiosk-module", slug],
    queryFn: () => kioskApi.module(slug),
    enabled: !!slug,
    retry: false,
  });
  const module = moduleQuery.data;
  const signedIn = !!module?.user;
  const isAdmin = module?.user?.role === "admin";
  const isSupervisor = module?.user?.role === "supervisor";
  const templatesQuery = useQuery({
    queryKey: ["kiosk-templates", slug],
    queryFn: () => kioskApi.templates(slug),
    enabled: signedIn && isAdmin,
  });
  const equipmentQuery = useQuery({
    queryKey: ["kiosk-equipment", slug],
    queryFn: () => kioskApi.equipment(slug),
    enabled: signedIn && isAdmin,
  });
  const usersQuery = useQuery({
    queryKey: ["kiosk-users", slug],
    queryFn: () => kioskApi.users(slug),
    enabled: signedIn && isAdmin,
  });
  const submissionsQuery = useQuery({
    queryKey: ["kiosk-submissions", slug, submissionSearch],
    queryFn: () => kioskApi.submissions(slug, submissionSearch),
    enabled: signedIn && (isAdmin || isSupervisor),
  });
  const auditQuery = useQuery({
    queryKey: ["kiosk-audit", slug],
    queryFn: () => kioskApi.audit(slug),
    enabled: signedIn && isAdmin,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kiosk-module", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-templates", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-equipment", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-users", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-submissions", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-audit", slug] }),
    ]);
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoginError("");
    try {
      await kioskApi.login(slug, String(form.get("badgeToken") ?? ""), String(form.get("pin") ?? ""));
      await refresh();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  };

  const signOut = async () => {
    try {
      await kioskApi.logout(slug);
      setCredential(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  const updateCredentials = (value: { user: KioskUser; pin: string; badgeToken: string; badgeQrCode: string }) => {
    setCredential({
      name: value.user.name,
      pin: value.pin,
      token: value.badgeToken,
      qrCode: value.badgeQrCode,
    });
  };

  if (moduleQuery.isLoading) return <main className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">Loading kiosk admin...</main>;
  if (moduleQuery.isError || !module) {
    return <main className="mx-auto max-w-2xl p-6"><Card><CardContent className="pt-6">This warehouse does not have an enabled kiosk.</CardContent></Card></main>;
  }
  if (module.needsSetup) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <PageHeader title={`${module.warehouse.name} kiosk admin`} />
        <Card><CardContent className="space-y-3 pt-6">
          <p className="text-sm">The first administrator has not been created.</p>
          <a className="text-sm text-primary underline" href={`/kiosk/${slug}`}>Complete one-time setup on the kiosk</a>
        </CardContent></Card>
      </main>
    );
  }
  if (!signedIn) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <PageHeader title={`${module.warehouse.name} kiosk admin`} />
        <Card>
          <CardHeader><CardTitle>Administrator sign in</CardTitle><CardDescription>Scan your admin badge and enter your PIN.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={signIn}>
              <FormField label="Badge QR code"><Input name="badgeToken" autoFocus autoComplete="off" required /></FormField>
              <FormField label="PIN"><Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required /></FormField>
              {loginError && <p className="text-sm text-destructive">{loginError}</p>}
              <Button className="w-full">Sign in</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }
  if (!isAdmin && !isSupervisor) {
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <PageHeader title={`${module.warehouse.name} kiosk admin`} />
        <Card><CardContent className="space-y-3 pt-6">
          <p className="text-sm">This account cannot manage or review kiosk forms.</p>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </CardContent></Card>
      </main>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: ReactNode; visible: boolean }> = [
    { id: "forms", label: "Forms", icon: <FileUp className="h-4 w-4" />, visible: isAdmin },
    { id: "users", label: "Users", icon: <Users className="h-4 w-4" />, visible: isAdmin },
    { id: "signoffs", label: "Supervisor signoffs", icon: <ShieldCheck className="h-4 w-4" />, visible: isSupervisor },
    { id: "history", label: "Inspection history", icon: <ClipboardCheck className="h-4 w-4" />, visible: isAdmin },
    { id: "audit", label: "Audit log", icon: <KeyRound className="h-4 w-4" />, visible: isAdmin },
  ];
  const activeTab = isAdmin ? tab : "signoffs";

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title={`${module.warehouse.name} kiosk admin`} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{module.user?.name} · {module.user?.role}</span>
          <a href={`/kiosk/${slug}`}><Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Kiosk</Button></a>
          <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </header>

      {credential && <CredentialCard credential={credential} />}

      <nav className="flex flex-wrap gap-2" aria-label="Kiosk administration">
        {tabs.filter((item) => item.visible).map((item) => (
          <Button key={item.id} variant={activeTab === item.id ? "default" : "outline"} onClick={() => setTab(item.id)}>
            {item.icon}<span className="ml-2">{item.label}</span>
          </Button>
        ))}
      </nav>

      {activeTab === "forms" && isAdmin && (
        <FormsPanel
          slug={slug}
          templates={templatesQuery.data ?? []}
          equipment={equipmentQuery.data ?? []}
          onPublished={refresh}
        />
      )}
      {activeTab === "users" && isAdmin && (
        <UsersPanel slug={slug} users={usersQuery.data ?? []} onCredentials={updateCredentials} onRefresh={refresh} />
      )}
      {activeTab === "signoffs" && isSupervisor && (
        <SignoffsPanel slug={slug} submissions={submissionsQuery.data ?? []} onRefresh={refresh} />
      )}
      {activeTab === "history" && isAdmin && (
        <HistoryPanel
          search={submissionSearch}
          setSearch={setSubmissionSearch}
          submissions={submissionsQuery.data ?? []}
          isLoading={submissionsQuery.isLoading}
        />
      )}
      {activeTab === "audit" && isAdmin && (
        <AuditPanel events={auditQuery.data ?? []} />
      )}
    </main>
  );
}

function FormsPanel({
  slug,
  templates,
  equipment,
  onPublished,
}: {
  slug: string;
  templates: KioskTemplateRecord[];
  equipment: Awaited<ReturnType<typeof kioskApi.equipment>>;
  onPublished: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<KioskTemplateRecord | null>(null);
  const [fields, setFields] = useState<KioskTemplateField[]>([]);
  const [phase, setPhase] = useState<"pre_checkout" | "scheduled">("pre_checkout");
  const [category, setCategory] = useState("");
  const [specificItems, setSpecificItems] = useState<string[]>([]);
  const [allowBatch, setAllowBatch] = useState(false);
  const [interval, setInterval] = useState("12");
  const [unit, setUnit] = useState<"day" | "week" | "month">("month");
  const [firstDue, setFirstDue] = useState("");
  const [requiresSupervisor, setRequiresSupervisor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(() => Array.from(new Set(equipment.map((item) => item.category))).sort(), [equipment]);
  const dueItems = equipment.map((item) => {
    const activeScheduled = templates.filter((template) => template.active && template.phase === "scheduled");
    const scheduled = activeScheduled.find((template) => template.equipmentIds.includes(item.id)) ??
      activeScheduled.find((template) => template.category === item.category && !template.equipmentIds.length);
    const dueAt = item.kioskState?.nextDueAt ?? scheduled?.firstDueAt;
    const onHold = !!item.kioskState?.outOfService;
    return { item, dueAt, onHold };
  }).filter(({ dueAt, onHold }) => onHold || (!!dueAt && new Date(dueAt).getTime() <= Date.now()));

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return setError("Choose a fillable PDF.");
    setBusy(true);
    setError("");
    try {
      const created = await kioskApi.uploadTemplate(slug, name.trim(), file);
      setDraft(created);
      setFields(created.fields);
      setPhase("pre_checkout");
      setCategory("");
      setSpecificItems([]);
      setAllowBatch(false);
      setRequiresSupervisor(false);
      toast.success(
        `Detected ${created.fields.length} fields${created.revision ? ` (Rev. ${created.revision})` : ""} in version ${created.version}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload form.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await kioskApi.publishTemplate(slug, draft.id, {
        name: name.trim(),
        phase,
        category: specificItems.length ? null : category || null,
        equipmentIds: specificItems,
        fields,
        allowBatch,
        scheduleInterval: phase === "scheduled" ? Number(interval) : null,
        scheduleUnit: phase === "scheduled" ? unit : null,
        firstDueAt: phase === "scheduled" ? firstDue : null,
        requiresSupervisorApproval: requiresSupervisor,
      });
      setDraft(null);
      setFile(null);
      setName("");
      await onPublished();
      toast.success("Form version published.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to publish form.");
    } finally {
      setBusy(false);
    }
  };

  const updateField = (index: number, patch: Partial<KioskTemplateField>) => {
    setFields((previous) => previous.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  };

  const toggleSpecificItem = (id: string) => {
    setSpecificItems((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
    setCategory("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader><CardTitle>Upload a form version</CardTitle><CardDescription>Upload a searchable, fillable PDF. The kiosk detects its revision, inspection questions, and answer fields, then keeps every published version.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {dueItems.length > 0 && (
            <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3">
              <h3 className="text-sm font-semibold text-amber-900">{dueItems.length} item(s) due or on hold</h3>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {dueItems.slice(0, 10).map(({ item, dueAt, onHold }) => (
                  <li key={item.id}>{item.name} · {item.category} · {onHold ? item.kioskState?.holdReason ?? "On hold" : `due ${new Date(dueAt!).toLocaleDateString()}`}</li>
                ))}
                {dueItems.length > 10 && <li>And {dueItems.length - 10} more.</li>}
              </ul>
            </div>
          )}
          <form className="space-y-3" onSubmit={upload}>
            <FormField label="Form name"><Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} placeholder="Rigging pre-use inspection" /></FormField>
            <FormField label="Fillable PDF file"><Input type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></FormField>
            <Button className="w-full" disabled={busy || !name.trim() || !file}><FileUp className="mr-2 h-4 w-4" />Upload and detect fields</Button>
          </form>
          {draft && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              <strong>Draft v{draft.version}{draft.revision ? ` · Rev. ${draft.revision}` : ""} ready.</strong> Finish its assignment and field settings to publish it. Uploading the same name creates a new version.
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Published and draft versions</h3>
            {templates.length === 0 ? <p className="text-xs text-muted-foreground">No forms uploaded.</p> : templates.map((template) => (
              <div key={template.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{template.name} · v{template.version}{template.revision ? ` · Rev. ${template.revision}` : ""}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${template.active ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{template.active ? "Published" : "Draft / archived"}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{template.phase.replace("_", " ")} · {template.category ?? `${template.equipmentIds.length} specific item(s)`}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader><CardTitle>Configure version {draft.version}{draft.revision ? ` · Rev. ${draft.revision}` : ""}</CardTitle><CardDescription>Review the detected prompts and PDF field mappings, then set the form assignment.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Inspection stage">
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={phase} onChange={(event) => setPhase(event.target.value as "pre_checkout" | "scheduled")}>
                  <option value="pre_checkout">Before every checkout</option>
                  <option value="scheduled">Recurring calendar inspection</option>
                </select>
              </FormField>
              <FormField label="Assign by category">
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => { setCategory(event.target.value); setSpecificItems([]); }}>
                  <option value="">Use specific equipment below</option>
                  {categories.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </FormField>
            </div>
            {!category && (
              <FormField label="Specific equipment (select one or more)">
                <select multiple className="min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={specificItems} onChange={(event) => setSpecificItems(Array.from(event.target.selectedOptions, (option) => option.value))}>
                  {equipment.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category} · {item.id}</option>)}
                </select>
              </FormField>
            )}
            {phase === "scheduled" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Repeat every"><Input type="number" min={1} max={365} value={interval} onChange={(event) => setInterval(event.target.value)} /></FormField>
                <FormField label="Interval">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={unit} onChange={(event) => setUnit(event.target.value as "day" | "week" | "month")}>
                    <option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option>
                  </select>
                </FormField>
                <FormField label="First due date"><Input type="date" value={firstDue} onChange={(event) => setFirstDue(event.target.value)} /></FormField>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowBatch} onChange={(event) => setAllowBatch(event.target.checked)} />
              Allow one inspection to cover multiple selected items
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requiresSupervisor} onChange={(event) => setRequiresSupervisor(event.target.checked)} />
              Require a separate supervisor account to approve each submission
            </label>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Detected fields ({fields.length})</h3>
              {fields.map((field, index) => (
                <div key={field.name} className="space-y-2 rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">PDF field: <code>{field.name}</code> · {field.type}{field.options.length ? ` · ${field.options.join(", ")}` : ""}</div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <FormField label="Prompt shown to technician"><Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} /></FormField>
                    <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={field.required} onChange={(event) => updateField(index, { required: event.target.checked })} />Required</label>
                  </div>
                  <FormField label="PDF field source">
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={field.source} onChange={(event) => updateField(index, { source: event.target.value as KioskTemplateField["source"] })}>
                      <option value="answer">Technician answer</option>
                      <option value="technician_name">Signed-in technician name</option>
                      <option value="work_order">Work order</option>
                      <option value="submitted_at">Inspection date</option>
                      <option value="supervisor_name">Supervisor name (on approval)</option>
                    </select>
                  </FormField>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy || !category && !specificItems.length || (phase === "scheduled" && (!interval || !firstDue))} onClick={publish}>
              <Save className="mr-2 h-4 w-4" />Publish form version
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersPanel({
  slug,
  users,
  onCredentials,
  onRefresh,
}: {
  slug: string;
  users: Awaited<ReturnType<typeof kioskApi.users>>;
  onCredentials: (value: { user: KioskUser; pin: string; badgeToken: string; badgeQrCode: string }) => void;
  onRefresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<KioskUser["role"]>("technician");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await kioskApi.createUser(slug, { name, role, ...(pin ? { pin } : {}) });
      onCredentials(created);
      setName("");
      setPin("");
      await onRefresh();
      toast.success("Account created. Save its QR code and PIN.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, active: boolean) => {
    try {
      await kioskApi.updateUser(slug, id, { active });
      await onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update account.");
    }
  };

  const reset = async (id: string) => {
    try {
      const credentials = await kioskApi.resetCredentials(slug, id);
      onCredentials(credentials);
      toast.success("New badge and PIN generated. Save them now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset credentials.");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader><CardTitle>Create a kiosk account</CardTitle><CardDescription>QR badge and PIN credentials are returned once and never stored in readable form.</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={createUser}>
            <FormField label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></FormField>
            <FormField label="Role">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as KioskUser["role"])}>
                <option value="technician">Technician</option><option value="supervisor">Supervisor</option><option value="admin">Administrator</option>
              </select>
            </FormField>
            <FormField label="PIN (leave blank to generate securely)"><Input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} /></FormField>
            <Button className="w-full" disabled={busy || !name.trim()}>Create account</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Accounts</CardTitle><CardDescription>Deactivate lost badges immediately; resetting credentials revokes existing sessions.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div><div className="font-medium">{user.name}</div><div className="text-xs text-muted-foreground">{user.role} · {user.active ? "Active" : "Inactive"}</div></div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => reset(user.id)}><QrCode className="mr-1 h-4 w-4" />Reset badge/PIN</Button>
                <Button variant={user.active ? "destructive" : "default"} size="sm" onClick={() => update(user.id, !user.active)}>{user.active ? "Deactivate" : "Reactivate"}</Button>
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="text-sm text-muted-foreground">No kiosk accounts.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function SignoffsPanel({
  slug,
  submissions,
  onRefresh,
}: {
  slug: string;
  submissions: KioskSubmission[];
  onRefresh: () => Promise<void>;
}) {
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const pending = submissions.filter((submission) => submission.status === "pending_approval");

  const review = async (submission: KioskSubmission, decision: "approved" | "rejected") => {
    setBusyId(submission.id);
    try {
      await kioskApi.reviewSubmission(slug, submission.id, decision, reviewNotes[submission.id] ?? "");
      await onRefresh();
      toast.success(decision === "approved" ? "Inspection approved." : "Inspection rejected; equipment remains on hold.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to review inspection.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Pending supervisor signoffs</CardTitle><CardDescription>Reviewers must use their own supervisor account, separate from the submitting technician.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {pending.length === 0 ? <p className="text-sm text-muted-foreground">No inspections are waiting for approval.</p> : pending.map((submission) => (
          <div key={submission.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{submission.templateName} · v{submission.templateVersion}</div>
                <div className="text-xs text-muted-foreground">{submission.technicianName} · {submission.phase.replace("_", " ")} · {new Date(submission.submittedAt).toLocaleString()}</div>
                {submission.workOrder && <div className="text-xs text-muted-foreground">WO {submission.workOrder}</div>}
                <div className={`mt-1 text-xs font-semibold ${submission.result === "passed" ? "text-green-700" : "text-destructive"}`}>Result: {submission.result}</div>
              </div>
              <a className="text-sm text-primary underline" href={submission.pdfUrl} target="_blank" rel="noreferrer">Open completed PDF</a>
            </div>
            <div className="flex flex-wrap gap-2">
              {submission.equipmentIds.map((id) => <span key={id} className="rounded bg-muted px-2 py-1 text-xs">{id}</span>)}
            </div>
            <FormField label="Supervisor note"><Input value={reviewNotes[submission.id] ?? ""} onChange={(event) => setReviewNotes((previous) => ({ ...previous, [submission.id]: event.target.value }))} maxLength={1000} /></FormField>
            <div className="flex gap-2">
              <Button disabled={busyId === submission.id} onClick={() => review(submission, "approved")}>Approve and sign</Button>
              <Button variant="destructive" disabled={busyId === submission.id} onClick={() => review(submission, "rejected")}>Reject</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HistoryPanel({
  search,
  setSearch,
  submissions,
  isLoading,
}: {
  search: string;
  setSearch: (value: string) => void;
  submissions: KioskSubmission[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Completed inspection records</CardTitle><CardDescription>Search by equipment ID, work order, form name, or technician. Each entry retains its submitted PDF and template version.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment, work order, form, or technician" />
        {isLoading ? <p className="text-sm text-muted-foreground">Searching records...</p> : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching inspection records.</p>
        ) : submissions.map((submission) => (
          <div key={submission.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="font-medium">{submission.templateName} · v{submission.templateVersion} · {submission.result}</div>
              <div className="text-xs text-muted-foreground">{submission.technicianName} · {submission.phase.replace("_", " ")} · {new Date(submission.submittedAt).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">{submission.equipmentNames.join(", ")} ({submission.equipmentIds.join(", ")}){submission.workOrder ? ` · WO ${submission.workOrder}` : ""} · {submission.status.replace("_", " ")}</div>
            </div>
            <a className="text-sm text-primary underline" href={submission.pdfUrl} target="_blank" rel="noreferrer">Open completed PDF</a>
          </div>
        ))}
        {submissions.length >= 1000 && <p className="text-xs text-muted-foreground">Showing the latest 1,000 matches. Narrow your search for older records.</p>}
      </CardContent>
    </Card>
  );
}

function AuditPanel({ events }: { events: Awaited<ReturnType<typeof kioskApi.audit>> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Kiosk audit history</CardTitle><CardDescription>Recent sign-ins, account changes, inspections, approvals, and equipment movements.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 ? <p className="text-sm text-muted-foreground">No audit activity recorded.</p> : events.map((event) => (
          <div key={event.id} className="rounded-md border p-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-medium">{event.action.replaceAll("_", " ")}</span>
              <time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</time>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{event.actorName ?? "System"}{event.equipmentIds.length ? ` · ${event.equipmentIds.join(", ")}` : ""}</div>
            {Object.keys(event.details).length > 0 && <pre className="mt-2 overflow-auto text-[11px] text-muted-foreground">{JSON.stringify(event.details, null, 2)}</pre>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CredentialCard({ credential }: { credential: Credential }) {
  return (
    <Card className="border-primary/40">
      <CardHeader><CardTitle>One-time credentials for {credential.name}</CardTitle><CardDescription>Print or securely share these now. The PIN and QR token cannot be retrieved later.</CardDescription></CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <img src={credential.qrCode} alt={`${credential.name} badge QR code`} className="h-56 w-56" />
        <p className="break-all text-center text-xs text-muted-foreground">{credential.token}</p>
        <p className="text-lg font-semibold">PIN: {credential.pin}</p>
      </CardContent>
    </Card>
  );
}

function PageHeader({ title }: { title: string }) {
  return <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ShieldCheck className="h-4 w-4" />Kiosk administration</div><h1 className="text-2xl font-bold">{title}</h1></div>;
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
