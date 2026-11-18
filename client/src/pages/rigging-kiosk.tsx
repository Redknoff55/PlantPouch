import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeftRight, ClipboardCheck, LogOut, ShieldCheck, Wrench } from "lucide-react";
import type { KioskTemplateField } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  kioskApi,
  type KioskEquipment,
  type KioskTemplateRecord,
  type KioskUser,
} from "@/lib/kiosk";

type KioskMode = "checkout" | "scheduled" | "return";

function getApplicableTemplate(
  item: KioskEquipment,
  phase: string,
  templates: KioskTemplateRecord[],
) {
  const active = templates.filter((template) => template.active && template.phase === phase);
  return active.find((template) => template.equipmentIds.includes(item.id)) ??
    active.find((template) => template.category === item.category && template.equipmentIds.length === 0);
}

export default function RiggingKioskPage() {
  const [, params] = useRoute("/kiosk/:warehouseSlug");
  const slug = params?.warehouseSlug ?? "";
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<KioskMode>("checkout");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [workOrder, setWorkOrder] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [result, setResult] = useState<"passed" | "failed">("passed");
  const [precheckResult, setPrecheckResult] = useState<{
    id: string;
    status: string;
    result: "passed" | "failed";
    equipmentIds: string[];
    workOrder: string | null;
  } | null>(null);
  const [checkInNotes, setCheckInNotes] = useState<Record<string, string>>({});
  const [credential, setCredential] = useState<{ token: string; qrCode: string; pin: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const moduleQuery = useQuery({
    queryKey: ["kiosk-module", slug],
    queryFn: () => kioskApi.module(slug),
    enabled: !!slug,
    retry: false,
  });
  const module = moduleQuery.data;
  const signedIn = !!module?.user;
  const equipmentQuery = useQuery({
    queryKey: ["kiosk-equipment", slug],
    queryFn: () => kioskApi.equipment(slug),
    enabled: signedIn,
  });
  const templatesQuery = useQuery({
    queryKey: ["kiosk-templates", slug],
    queryFn: () => kioskApi.templates(slug),
    enabled: signedIn,
  });
  const checkoutsQuery = useQuery({
    queryKey: ["kiosk-checkouts", slug],
    queryFn: () => kioskApi.checkouts(slug),
    enabled: signedIn,
  });

  const allEquipment = equipmentQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const selectedEquipment = useMemo(
    () => selectedIds.map((id) => allEquipment.find((item) => item.id === id)).filter((item): item is KioskEquipment => !!item),
    [allEquipment, selectedIds],
  );
  const phase = mode === "scheduled" ? "scheduled" : "pre_checkout";
  const selectedTemplates = selectedEquipment.map((item) => getApplicableTemplate(item, phase, templates));
  const template = selectedTemplates.length && selectedTemplates.every((candidate) => candidate?.id === selectedTemplates[0]?.id)
    ? selectedTemplates[0]
    : undefined;
  const templateMismatch = selectedTemplates.some((candidate) => candidate?.id !== selectedTemplates[0]?.id);

  const refreshKiosk = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kiosk-module", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-equipment", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-templates", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-checkouts", slug] }),
      queryClient.invalidateQueries({ queryKey: ["kiosk-submissions", slug] }),
    ]);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    try {
      await kioskApi.login(slug, String(form.get("badgeToken") ?? ""), String(form.get("pin") ?? ""));
      setCredential(null);
      await refreshKiosk();
      toast.success("You are signed in.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    try {
      const created = await kioskApi.setup(
        slug,
        String(form.get("name") ?? ""),
        String(form.get("pin") ?? ""),
      );
      setCredential({ token: created.badgeToken, qrCode: created.badgeQrCode, pin: String(form.get("pin") ?? "") });
      await refreshKiosk();
      toast.success("Initial administrator created. Save the badge QR code now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create the administrator.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const changeMode = (nextMode: KioskMode) => {
    setMode(nextMode);
    setSelectedIds([]);
    setAnswers({});
    setPrecheckResult(null);
    setResult("passed");
  };

  const toggleItem = (itemId: string) => {
    setSelectedIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId],
    );
    setAnswers({});
    setPrecheckResult(null);
  };

  const submitInspection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!template || !selectedEquipment.length) return;
    if (templateMismatch) {
      toast.error("Selected items need different forms. Submit each form group separately.");
      return;
    }
    if (selectedEquipment.length > 1 && !template.allowBatch) {
      toast.error("This form is configured for one item at a time.");
      return;
    }
    setIsSubmitting(true);
    try {
      const submitted = await kioskApi.submitInspection(slug, {
        templateId: template.id,
        equipmentIds: selectedIds,
        workOrder: mode === "checkout" ? workOrder.trim() : null,
        answers,
        result,
      });
      if (mode === "checkout") {
        setPrecheckResult({
          id: submitted.id,
          status: submitted.status,
          result: submitted.result,
          equipmentIds: [...selectedIds],
          workOrder: workOrder.trim(),
        });
      } else {
        setSelectedIds([]);
        setAnswers({});
      }
      await refreshKiosk();
      toast.success(
        submitted.status === "pending_approval"
          ? "Inspection saved; it needs supervisor approval before checkout."
          : submitted.result === "passed"
            ? "Inspection saved."
            : "Inspection failed. The selected item(s) are on hold.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save inspection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkout = async () => {
    if (!precheckResult || precheckResult.status !== "approved" || precheckResult.result !== "passed") return;
    setIsSubmitting(true);
    try {
      await kioskApi.checkout(slug, {
        equipmentIds: precheckResult.equipmentIds,
        workOrder: precheckResult.workOrder ?? "",
        submissionId: precheckResult.id,
      });
      setSelectedIds([]);
      setPrecheckResult(null);
      setWorkOrder("");
      await refreshKiosk();
      toast.success("Equipment checked out.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check out equipment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkIn = async (checkoutId: string) => {
    setIsSubmitting(true);
    try {
      await kioskApi.checkin(slug, checkoutId, checkInNotes[checkoutId] ?? "");
      setCheckInNotes((previous) => ({ ...previous, [checkoutId]: "" }));
      await refreshKiosk();
      toast.success("Equipment checked in.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check in equipment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signOut = async () => {
    try {
      await kioskApi.logout(slug);
      setSelectedIds([]);
      setCredential(null);
      await refreshKiosk();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  if (moduleQuery.isLoading) return <main className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Loading kiosk...</main>;
  if (moduleQuery.isError || !module) {
    return <main className="mx-auto max-w-xl p-6"><Card><CardContent className="pt-6">This warehouse does not have an enabled kiosk.</CardContent></Card></main>;
  }

  if (!signedIn) {
    return (
      <main className="mx-auto max-w-xl space-y-5 p-4 sm:p-8">
        <KioskTitle title={module.warehouse.name} />
        {credential && <CredentialCard credential={credential} />}
        {module.needsSetup ? (
          <Card>
            <CardHeader>
              <CardTitle>Set up the first administrator</CardTitle>
              <CardDescription>This one-time setup closes after the first administrator is created.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSetup}>
                <Field label="Administrator name"><Input name="name" required maxLength={120} /></Field>
                <Field label="Create a 6–12 digit PIN"><Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required /></Field>
                <Button className="w-full" disabled={isSubmitting}>Create administrator</Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Technician sign in</CardTitle>
              <CardDescription>Scan your personal badge QR code into the badge field, then enter your PIN.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleLogin}>
                <Field label="Badge QR code"><Input name="badgeToken" autoFocus autoComplete="off" required /></Field>
                <Field label="PIN"><Input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required /></Field>
                <Button className="w-full" disabled={isSubmitting}>Sign in</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <KioskTitle title={module.warehouse.name} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{module.user?.name} · {roleLabel(module.user?.role)}</span>
          {module.user?.role === "admin" && <a className="rounded-md border px-3 py-2 text-sm" href={`/kiosk/${slug}/admin`}>Admin</a>}
          <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
        </div>
      </header>

      {credential && <CredentialCard credential={credential} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <ModeButton selected={mode === "checkout"} onClick={() => changeMode("checkout")} icon={<Wrench className="h-4 w-4" />} title="Check out" />
        <ModeButton selected={mode === "scheduled"} onClick={() => changeMode("scheduled")} icon={<ClipboardCheck className="h-4 w-4" />} title="Scheduled inspection" />
        <ModeButton selected={mode === "return"} onClick={() => changeMode("return")} icon={<ArrowLeftRight className="h-4 w-4" />} title="Check in" />
      </div>

      {mode === "return" ? (
        <CheckoutsPanel
          checkouts={checkoutsQuery.data ?? []}
          equipment={allEquipment}
          notes={checkInNotes}
          setNotes={setCheckInNotes}
          onCheckIn={checkIn}
          isSubmitting={isSubmitting}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{mode === "checkout" ? "Select equipment" : "Select items for inspection"}</CardTitle>
              <CardDescription>
                {mode === "checkout"
                  ? "Items must be available, in service, and current on scheduled inspections."
                  : "Choose the item(s) due for their scheduled inspection. Passing the inspection clears the hold."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {equipmentQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading equipment...</p> : null}
              {allEquipment.map((item) => {
                const scheduled = getApplicableTemplate(item, "scheduled", templates);
                const dueAt = item.kioskState?.nextDueAt ?? scheduled?.firstDueAt ?? null;
                const isDue = !!dueAt && new Date(dueAt).getTime() <= Date.now();
                const onHold = !!item.kioskState?.outOfService;
                const available = item.status === "available";
                const relevant = mode === "checkout" ? available : item.forms.scheduled && available;
                if (!relevant) return null;
                const disabled = mode === "checkout" && (!available || onHold || isDue || !item.forms.preCheckout);
                return (
                  <label key={item.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${disabled ? "opacity-55" : "hover:border-primary/50"}`}>
                    <input
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      disabled={disabled}
                      onChange={() => toggleItem(item.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">{item.category}{item.variant ? ` · ${item.variant}` : ""} · {item.id}</span>
                      {onHold && <span className="mt-1 block text-xs font-medium text-destructive">On hold: {item.kioskState?.holdReason}</span>}
                      {isDue && <span className="mt-1 block text-xs font-medium text-destructive">Scheduled inspection due {new Date(dueAt!).toLocaleDateString()}</span>}
                      {!item.forms.preCheckout && mode === "checkout" && <span className="mt-1 block text-xs text-amber-700">No pre-check form is assigned</span>}
                      {item.status !== "available" && <span className="mt-1 block text-xs text-muted-foreground">Currently checked out</span>}
                    </span>
                  </label>
                );
              })}
              {!allEquipment.length && !equipmentQuery.isLoading && <p className="text-sm text-muted-foreground">No equipment is assigned to this warehouse.</p>}
            </CardContent>
          </Card>
          <div className="space-y-5">
            {mode === "checkout" && (
              <Card>
                <CardHeader><CardTitle>Work order</CardTitle><CardDescription>A work order is required for every checkout.</CardDescription></CardHeader>
                <CardContent><Field label="Work order"><Input value={workOrder} onChange={(event) => setWorkOrder(event.target.value)} required /></Field></CardContent>
              </Card>
            )}
            {selectedEquipment.length > 0 && (
              <InspectionForm
                mode={mode}
                template={template}
                templateMismatch={templateMismatch}
                selectedCount={selectedEquipment.length}
                answers={answers}
                onAnswer={(name, value) => setAnswers((previous) => ({ ...previous, [name]: value }))}
                result={result}
                onResultChange={setResult}
                onSubmit={submitInspection}
                isSubmitting={isSubmitting}
                hasWorkOrder={mode !== "checkout" || !!workOrder.trim()}
              />
            )}
            {precheckResult && (
              <Card>
                <CardHeader>
                  <CardTitle>{precheckResult.status === "pending_approval" ? "Waiting for supervisor approval" : "Pre-check complete"}</CardTitle>
                  <CardDescription>
                    {precheckResult.result === "failed"
                      ? "The selected equipment is on hold."
                      : precheckResult.status === "pending_approval"
                        ? "Checkout remains blocked until a different signed-in supervisor approves the form."
                        : "The form passed. You can now finish the checkout."}
                  </CardDescription>
                </CardHeader>
                {precheckResult.result === "passed" && precheckResult.status === "approved" && (
                  <CardContent><Button className="w-full" disabled={isSubmitting} onClick={checkout}>Check out selected equipment</Button></CardContent>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function InspectionForm({
  mode,
  template,
  templateMismatch,
  selectedCount,
  answers,
  onAnswer,
  result,
  onResultChange,
  onSubmit,
  isSubmitting,
  hasWorkOrder,
}: {
  mode: Exclude<KioskMode, "return">;
  template?: KioskTemplateRecord;
  templateMismatch: boolean;
  selectedCount: number;
  answers: Record<string, string | boolean>;
  onAnswer: (name: string, value: string | boolean) => void;
  result: "passed" | "failed";
  onResultChange: (value: "passed" | "failed") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  hasWorkOrder: boolean;
}) {
  if (templateMismatch) {
    return <Card><CardContent className="pt-6 text-sm text-destructive">Selected items use different forms. Select one form group at a time.</CardContent></Card>;
  }
  if (!template) {
    return <Card><CardContent className="pt-6 text-sm text-muted-foreground">No applicable form is configured for the selected item(s).</CardContent></Card>;
  }
  if (selectedCount > 1 && !template.allowBatch) {
    return <Card><CardContent className="pt-6 text-sm text-destructive">This form requires one item per inspection.</CardContent></Card>;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name} · v{template.version}</CardTitle>
        <CardDescription>{mode === "checkout" ? "Required pre-check" : "Scheduled inspection"} · {selectedCount} item(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {template.fields.map((field) => (
            <InspectionField key={field.name} field={field} value={answers[field.name]} onChange={onAnswer} />
          ))}
          <Field label="Inspection result">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={result} onChange={(event) => onResultChange(event.target.value as "passed" | "failed")}>
              <option value="passed">Passed - put in service / continue</option>
              <option value="failed">Failed - keep out of service</option>
            </select>
          </Field>
          <Button className="w-full" disabled={isSubmitting || !hasWorkOrder}>
            {isSubmitting ? "Saving..." : "Save completed inspection"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function InspectionField({
  field,
  value,
  onChange,
}: {
  field: KioskTemplateField;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
}) {
  if (field.source !== "answer") {
    const label = {
      technician_name: "Technician signoff (filled from sign-in)",
      work_order: "Work order (filled from checkout)",
      submitted_at: "Inspection date (filled automatically)",
      supervisor_name: "Supervisor signoff (filled on approval)",
      answer: "",
    }[field.source];
    return <div className="rounded-md border border-dashed p-3"><Label>{field.label}</Label><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
        <input type="checkbox" required={field.required} checked={value === true} onChange={(event) => onChange(field.name, event.target.checked)} />
        <span>{field.label}{field.required ? " *" : ""}</span>
      </label>
    );
  }
  if (field.type === "radio") {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{field.label}{field.required ? " *" : ""}</legend>
        {field.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="radio" name={field.name} required={field.required} checked={value === option} onChange={() => onChange(field.name, option)} />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.type === "dropdown" || field.type === "option-list") {
    return (
      <Field label={`${field.label}${field.required ? " *" : ""}`}>
        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.name, event.target.value)}>
          <option value="">Choose an option</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
    );
  }
  return (
    <Field label={`${field.label}${field.required ? " *" : ""}`}>
      {field.multiline ? (
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required={field.required}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      ) : (
        <Input required={field.required} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(field.name, event.target.value)} />
      )}
    </Field>
  );
}

function CheckoutsPanel({
  checkouts,
  equipment,
  notes,
  setNotes,
  onCheckIn,
  isSubmitting,
}: {
  checkouts: Awaited<ReturnType<typeof kioskApi.checkouts>>;
  equipment: KioskEquipment[];
  notes: Record<string, string>;
  setNotes: (value: Record<string, string>) => void;
  onCheckIn: (id: string) => void;
  isSubmitting: boolean;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Equipment currently checked out</CardTitle><CardDescription>Record a note if an item is damaged, missing, or returned to a different location.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {checkouts.length === 0 ? <p className="text-sm text-muted-foreground">No open checkouts.</p> : checkouts.map(({ checkout, technicianName }) => {
          const itemNames = checkout.equipmentIds.map((id) => equipment.find((item) => item.id === id)?.name ?? id);
          return (
            <div key={checkout.id} className="space-y-3 rounded-lg border p-3">
              <div>
                <div className="font-medium">{itemNames.join(", ")}</div>
                <div className="text-xs text-muted-foreground">WO {checkout.workOrder} · {technicianName} · {new Date(checkout.checkedOutAt).toLocaleString()}</div>
              </div>
              <Input value={notes[checkout.id] ?? ""} onChange={(event) => setNotes({ ...notes, [checkout.id]: event.target.value })} placeholder="Check-in note (optional)" />
              <Button variant="outline" disabled={isSubmitting} onClick={() => onCheckIn(checkout.id)}>Check in selected checkout</Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CredentialCard({ credential }: { credential: { token: string; qrCode: string; pin: string } }) {
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>Save this one-time badge setup</CardTitle>
        <CardDescription>The QR code and PIN are shown only now. Print or securely distribute them to the administrator.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <img src={credential.qrCode} alt="Administrator badge QR code" className="h-56 w-56" />
        <p className="break-all text-center text-xs text-muted-foreground">{credential.token}</p>
        <p className="text-lg font-semibold">PIN: {credential.pin}</p>
      </CardContent>
    </Card>
  );
}

function KioskTitle({ title }: { title: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><ShieldCheck className="h-4 w-4" />Inspection kiosk</div>
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}

function ModeButton({ selected, onClick, icon, title }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string }) {
  return <Button className="h-12 justify-start gap-2" variant={selected ? "default" : "outline"} onClick={onClick}>{icon}{title}</Button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function roleLabel(role?: KioskUser["role"]) {
  if (role === "admin") return "Administrator";
  if (role === "supervisor") return "Supervisor";
  return "Technician";
}
