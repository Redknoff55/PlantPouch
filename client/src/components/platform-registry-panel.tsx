import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { InsertPouch, InsertToolbox, Warehouse } from "@shared/schema";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function PlatformRegistryPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["platform-registry"],
    queryFn: api.registry.get,
  });
  const { data: systems = [] } = useQuery({
    queryKey: ["systems", "all"],
    queryFn: () => api.systems.getAll(),
  });
  const [warehouseName, setWarehouseName] = useState("");
  const [toolboxName, setToolboxName] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [pouchName, setPouchName] = useState("");
  const [selectedToolboxId, setSelectedToolboxId] = useState("");
  const [moduleType, setModuleType] = useState("custom");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingWarehouseId, setSavingWarehouseId] = useState<string | null>(null);

  const warehouses = data?.warehouses ?? [];
  const toolboxes = data?.toolboxes ?? [];
  const pouches = data?.pouches ?? [];
  const systemLabels = Array.from(new Set(systems.map((system) => system.color))).sort();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["platform-registry"] });

  const handleCreateWarehouse = async () => {
    const name = warehouseName.trim();
    if (!name) return;
    setIsSubmitting(true);
    try {
      await api.registry.createWarehouse({
        name,
        slug: slugify(name),
        description: null,
        enabled: true,
        isAccessoryWarehouse: false,
        defaultAccessorySystemLabels: [],
      });
      setWarehouseName("");
      await refresh();
      toast.success(`${name} warehouse created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create warehouse.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateToolbox = async () => {
    const name = toolboxName.trim();
    if (!name || !selectedWarehouseId) return;
    setIsSubmitting(true);
    try {
      const payload: InsertToolbox = {
        warehouseId: selectedWarehouseId,
        name,
        slug: slugify(name),
        description: null,
        enabled: true,
      };
      await api.registry.createToolbox(payload);
      setToolboxName("");
      await refresh();
      toast.success(`${name} toolbox created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create toolbox.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreatePouch = async () => {
    const name = pouchName.trim();
    if (!name || !selectedToolboxId) return;
    setIsSubmitting(true);
    try {
      const payload: InsertPouch = {
        toolboxId: selectedToolboxId,
        name,
        slug: slugify(name),
        moduleType: moduleType.trim() || "custom",
        description: null,
        enabled: true,
      };
      await api.registry.createPouch(payload);
      setPouchName("");
      await refresh();
      toast.success(`${name} pouch created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create pouch.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = async (kind: "warehouse" | "toolbox" | "pouch", id: string, enabled: boolean) => {
    try {
      if (kind === "warehouse") await api.registry.updateWarehouse(id, { enabled: !enabled });
      if (kind === "toolbox") await api.registry.updateToolbox(id, { enabled: !enabled });
      if (kind === "pouch") await api.registry.updatePouch(id, { enabled: !enabled });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update registry item.");
    }
  };

  const remove = async (kind: "warehouse" | "toolbox" | "pouch", id: string, name: string) => {
    if (!window.confirm(`Delete ${name}? This also removes its child registry items.`)) return;
    try {
      if (kind === "warehouse") await api.registry.deleteWarehouse(id);
      if (kind === "toolbox") await api.registry.deleteToolbox(id);
      if (kind === "pouch") await api.registry.deletePouch(id);
      await refresh();
      toast.success(`${name} deleted.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete registry item.");
    }
  };

  const claimEquipment = async (id: string, name: string) => {
    try {
      const claimed = await api.registry.claimUnassignedEquipment(id);
      await queryClient.invalidateQueries({ queryKey: ["equipment"] });
      await queryClient.invalidateQueries({ queryKey: ["system-configs"] });
      await queryClient.invalidateQueries({ queryKey: ["staged-systems"] });
      await queryClient.invalidateQueries({ queryKey: ["outage-location-notes"] });
      toast.success(`${claimed.equipment} equipment item(s) and ${claimed.systems + claimed.systemConfigs + claimed.stagedSystems + claimed.outageNotes} other resource(s) assigned to ${name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign equipment.");
    }
  };

  const saveAccessoryWarehouse = async (
    warehouse: Warehouse,
    isAccessoryWarehouse: boolean,
    defaultAccessorySystemLabels: string[]
  ) => {
    setSavingWarehouseId(warehouse.id);
    try {
      await api.registry.updateWarehouse(warehouse.id, {
        isAccessoryWarehouse,
        defaultAccessorySystemLabels,
      });
      await refresh();
      toast.success(`${warehouse.name} accessory settings saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save accessory warehouse settings.");
    } finally {
      setSavingWarehouseId(null);
    }
  };

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle>Platform Registry</CardTitle>
        <CardDescription>Create and enable the warehouses, toolboxes, and pouches that appear in the platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading registry...</div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>New warehouse</Label>
                <div className="flex gap-2">
                  <Input value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} placeholder="Plant warehouse" />
                  <Button size="icon" onClick={handleCreateWarehouse} disabled={isSubmitting || !warehouseName.trim()} aria-label="Create warehouse">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>New toolbox</Label>
                <div className="flex gap-2">
                  <select className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)}>
                    <option value="">Choose warehouse</option>
                    {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                  </select>
                  <Input value={toolboxName} onChange={(event) => setToolboxName(event.target.value)} placeholder="AOV" />
                  <Button size="icon" onClick={handleCreateToolbox} disabled={isSubmitting || !toolboxName.trim() || !selectedWarehouseId} aria-label="Create toolbox">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>New pouch</Label>
                <div className="flex gap-2">
                  <select className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={selectedToolboxId} onChange={(event) => setSelectedToolboxId(event.target.value)}>
                    <option value="">Choose toolbox</option>
                    {toolboxes.map((toolbox) => <option key={toolbox.id} value={toolbox.id}>{toolbox.name}</option>)}
                  </select>
                  <Input value={pouchName} onChange={(event) => setPouchName(event.target.value)} placeholder="Inventory" />
                  <Input className="max-w-28" value={moduleType} onChange={(event) => setModuleType(event.target.value)} placeholder="Type" />
                  <Button size="icon" onClick={handleCreatePouch} disabled={isSubmitting || !pouchName.trim() || !selectedToolboxId} aria-label="Create pouch">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <RegistryList title="Warehouses" emptyLabel="No warehouses yet." items={warehouses.map((item) => ({ ...item, parent: undefined }))} onToggle={(item) => toggle("warehouse", item.id, item.enabled)} onRemove={(item) => remove("warehouse", item.id, item.name)} />
              <RegistryList title="Toolboxes" emptyLabel="No toolboxes yet." items={toolboxes.map((item) => ({ ...item, parent: warehouses.find((warehouse) => warehouse.id === item.warehouseId)?.name }))} onToggle={(item) => toggle("toolbox", item.id, item.enabled)} onRemove={(item) => remove("toolbox", item.id, item.name)} onClaim={(item) => claimEquipment(item.id, item.name)} />
              <RegistryList title="Pouches" emptyLabel="No pouches yet." items={pouches.map((item) => ({ ...item, parent: toolboxes.find((toolbox) => toolbox.id === item.toolboxId)?.name }))} onToggle={(item) => toggle("pouch", item.id, item.enabled)} onRemove={(item) => remove("pouch", item.id, item.name)} />
            </div>
            <section className="space-y-3 rounded-lg border border-border/60 p-3">
              <div>
                <h3 className="text-sm font-semibold">Accessory warehouses</h3>
                <p className="text-xs text-muted-foreground">
                  Mark warehouses that hold shared accessories and choose the system labels they serve. Equipment can override these defaults.
                </p>
              </div>
              {warehouses.length === 0 ? (
                <p className="text-xs text-muted-foreground">Create a warehouse first.</p>
              ) : (
                warehouses.map((warehouse) => (
                  <AccessoryWarehouseConfig
                    key={warehouse.id}
                    warehouse={warehouse}
                    systemLabels={systemLabels}
                    isSaving={savingWarehouseId === warehouse.id}
                    onSave={saveAccessoryWarehouse}
                  />
                ))
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AccessoryWarehouseConfig({
  warehouse,
  systemLabels,
  isSaving,
  onSave,
}: {
  warehouse: Warehouse;
  systemLabels: string[];
  isSaving: boolean;
  onSave: (warehouse: Warehouse, enabled: boolean, labels: string[]) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(warehouse.isAccessoryWarehouse);
  const [labels, setLabels] = useState(warehouse.defaultAccessorySystemLabels ?? []);

  useEffect(() => {
    setEnabled(warehouse.isAccessoryWarehouse);
    setLabels(warehouse.defaultAccessorySystemLabels ?? []);
  }, [warehouse]);

  return (
    <div className="grid gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,1fr)_auto] sm:items-center">
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={`Mark ${warehouse.name} as an accessory warehouse`}
        />
        <div>
          <div className="text-sm font-medium">{warehouse.name}</div>
          <div className="text-xs text-muted-foreground">{enabled ? "Accessory warehouse" : "Standard warehouse"}</div>
        </div>
      </div>
      <select
        multiple
        value={labels}
        onChange={(event) => setLabels(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
        disabled={!enabled}
        aria-label={`Default system labels for ${warehouse.name}`}
        className="min-h-20 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
      >
        {systemLabels.map((label) => <option key={label} value={label}>{label}</option>)}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={isSaving}
        onClick={() => onSave(warehouse, enabled, labels)}
      >
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

type RegistryItem = { id: string; name: string; enabled: boolean; parent?: string };

function RegistryList({ title, emptyLabel, items, onToggle, onRemove, onClaim }: { title: string; emptyLabel: string; items: RegistryItem[]; onToggle: (item: RegistryItem) => void; onRemove: (item: RegistryItem) => void; onClaim?: (item: RegistryItem) => void }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length === 0 ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.name}</div>
                {item.parent && <div className="truncate text-[11px] text-muted-foreground">in {item.parent}</div>}
              </div>
              <Switch checked={item.enabled} onCheckedChange={() => onToggle(item)} aria-label={`Toggle ${item.name}`} />
              {onClaim && <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px]" onClick={() => onClaim(item)}>Claim</Button>}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(item)} aria-label={`Delete ${item.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
