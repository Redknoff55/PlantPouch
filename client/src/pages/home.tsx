import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type {
  Equipment,
  InsertEquipment,
  SystemRequirement,
  StagedSystem,
  StagedSystemMissingItem,
} from "@shared/schema";
import {
  useEquipment,
  useCreateEquipment,
  useCheckoutSystem,
  useCheckinByWorkOrder,
  useCheckout,
  useCheckin,
  useUpdateEquipment,
  useDeleteEquipment,
  useSystemConfigs,
  useSaveSystemConfig,
  useStagedSystems,
  useSaveStagedSystem,
  useClearStagedSystem,
} from "@/lib/hooks";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  AlertTriangle, 
  Wrench, 
  History,
  X,
  Plus,
  RefreshCw,
  Box,
  ClipboardCheck,
  Download,
  Settings,
  Image,
  Upload,
  MapPin,
  PackageCheck,
  ClipboardList,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { addMonths, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { branding } from "@/config/branding";
import {
  applyBrandingToDocument,
  loadBrandingFromStorage,
  mergeBranding,
  saveBrandingToStorage,
  type BrandingState,
} from "@/lib/branding";
import { fontPresetOptions } from "@shared/branding";

const normalizeLocation = (location?: string | null) => (location ?? "").trim().toLowerCase();

const getRepairLocationType = (location?: string | null) => {
  const normalized = normalizeLocation(location);
  if (!normalized) return null;
  if (normalized === "waiting on repairs") return "waiting";
  if (
    normalized === "sent for repairs" ||
    normalized === "repairs" ||
    normalized === "out for repair" ||
    normalized === "out for repairs"
  ) {
    return "sent";
  }
  return null;
};

const isRepairLocation = (location?: string | null) => getRepairLocationType(location) !== null;

const getRepairLocationLabel = (location?: string | null) => {
  const type = getRepairLocationType(location);
  if (type === "waiting") return "Waiting on repairs";
  if (type === "sent") return "Sent for repairs";
  return null;
};

const parseDueDateString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [monthRaw, dayRaw, yearRaw] = trimmed.split("/");
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (!month || !day || !year) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const getDueDateStatus = (dueDate?: string | Date | null) => {
  if (!dueDate) return null;
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const oneMonth = addMonths(now, 1);
  const threeMonths = addMonths(now, 3);
  if (date.getTime() <= oneMonth.getTime()) return "red";
  if (date.getTime() <= threeMonths.getTime()) return "yellow";
  return "green";
};

const formatDueDateLabel = (dueDate?: string | Date | null) => {
  if (!dueDate) return "";
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "";
  return `Due Date: ${format(date, "MM/dd/yyyy")}`;
};

const formatDueDateValue = (dueDate?: string | Date | null) => {
  if (!dueDate) return "";
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "MM/dd/yyyy");
};

const csvEscape = (value: string) => {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const extractValveNumber = (notes?: string | null) => {
  if (!notes) return null;
  const match = notes.match(/Valve\s*#\s*(.+?)(?:\s+as part of|\s+by|,|\.|$)/i);
  return match?.[1]?.trim() || null;
};

const getVariantLabel = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Standard";
};

const getRequirementKey = (category: string, variant?: string | null) =>
  `${category.trim()}::${getVariantLabel(variant)}`;

const inferRequirementsFromItems = (items: Equipment[]): SystemRequirement[] =>
  Object.values(
    items.reduce((acc, item) => {
      const key = getRequirementKey(item.category, item.variant);
      if (!acc[key]) {
        acc[key] = {
          id: key,
          category: item.category,
          variant: getVariantLabel(item.variant),
          quantity: 0,
        };
      }
      acc[key].quantity += 1;
      return acc;
    }, {} as Record<string, SystemRequirement>)
  ).sort((a, b) => a.category.localeCompare(b.category) || a.variant.localeCompare(b.variant));

const compareEquipmentIds = (a: Equipment, b: Equipment) =>
  a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });

const sortEquipmentById = (items: Equipment[]) => [...items].sort(compareEquipmentIds);

// --- Components ---

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    checked_out: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    broken: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const labels: Record<string, string> = {
    available: "Available",
    checked_out: "Checked Out",
    broken: "Needs Repair",
  };

  return (
    <div className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border uppercase tracking-wider", styles[status])}>
      {labels[status]}
    </div>
  );
}

function EquipmentListItem({
  item,
  onClick,
  selectable,
  selected,
  onToggleSelect,
}: {
  item: Equipment;
  onClick: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const isBroken = item.status === 'broken';
  const effectiveSystemColor = item.temporarySystemColor || item.systemColor;
  const dueDateLabel = formatDueDateLabel(item.dueDate);
  const dueDateStatus = getDueDateStatus(item.dueDate);
  const dueDateStyles: Record<string, string> = {
    green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    yellow: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    red: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group cursor-pointer p-4 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:shadow-md transition-all"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {selectable && (
              <Checkbox
                checked={!!selected}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect?.(item.id);
                }}
              />
            )}
            <Box className="w-4 h-4 text-muted-foreground shrink-0" />
            {effectiveSystemColor && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/20 text-primary">
                {effectiveSystemColor} Sys
              </Badge>
            )}
            {dueDateLabel && dueDateStatus && (
              <Badge
                variant="outline"
                className={cn("text-[10px] h-5 px-2 border", dueDateStyles[dueDateStatus])}
              >
                {dueDateLabel}
              </Badge>
            )}
          </div>
          <h3 className={cn("font-semibold text-lg transition-colors", isBroken ? "text-destructive" : "text-foreground group-hover:text-primary")}>
            {item.name}
          </h3>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>{item.category}</span>
            <span className="text-xs font-mono">{item.id}</span>
            <span className="text-xs text-muted-foreground">Location: {item.location ?? "Shop"}</span>
          </div>
        </div>
        {item.status === 'checked_out' && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">WO: {item.workOrder}</div>
            <div className="text-xs text-primary">{item.checkedOutBy}</div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Main Pages/Views ---

function EditEquipmentModal({
  equipment,
  isOpen,
  onClose,
  locationOptions,
  systemColorOptions,
  onAddLocation,
  onIdUpdated,
}: {
  equipment: Equipment;
  isOpen: boolean;
  onClose: () => void;
  locationOptions: string[];
  systemColorOptions: string[];
  onAddLocation: (value: string) => void;
  onIdUpdated?: (newId: string) => void;
}) {
  const updateEquipment = useUpdateEquipment();
  const [formData, setFormData] = useState({
    id: equipment.id,
    name: equipment.name,
    category: equipment.category,
    variant: equipment.variant ?? "",
    systemColor: equipment.systemColor ?? "",
    location: equipment.location ?? "Shop",
    dueDate: formatDueDateValue(equipment.dueDate),
  });
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      variant: equipment.variant ?? "",
      systemColor: equipment.systemColor ?? "",
      location: equipment.location ?? "Shop",
      dueDate: formatDueDateValue(equipment.dueDate),
    });
  }, [equipment, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const nextId = formData.id.trim();
    if (!nextId || !formData.name || !formData.category) {
      toast.error("ID, name, and category are required.");
      return;
    }
    const payload: Partial<InsertEquipment> = {
      name: formData.name,
      category: formData.category,
      variant: formData.variant.trim() || undefined,
      systemColor: formData.systemColor || undefined,
      location: formData.location || "Shop",
    };
    const dueDateInput = formData.dueDate.trim();
    if (dueDateInput) {
      const parsed = parseDueDateString(dueDateInput);
      if (!parsed) {
        toast.error("Due Date must be MM/DD/YYYY.");
        return;
      }
      payload.dueDate = parsed;
    } else if (equipment.dueDate) {
      payload.dueDate = null;
    }
    if (nextId !== equipment.id) {
      payload.id = nextId;
    }
    updateEquipment.mutate(
      {
        id: equipment.id,
        data: payload,
      },
      {
        onSuccess: () => {
          toast.success(`Updated ${nextId}.`);
          if (nextId !== equipment.id) {
            onIdUpdated?.(nextId);
          }
          onClose();
        },
        onError: (error) => {
          toast.error(`Failed to update equipment: ${error.message}`);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Edit Equipment</h2>
              <p className="text-xs text-muted-foreground font-mono">{equipment.id}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment ID *</Label>
              <Input
                value={formData.id}
                onChange={(e) => setFormData((prev) => ({ ...prev, id: e.target.value }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                ID changes are blocked if this item has history or replacement links.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Equipment Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Variant</Label>
              <Input
                value={formData.variant}
                onChange={(e) => setFormData((prev) => ({ ...prev, variant: e.target.value }))}
                placeholder="e.g. 0-100 PSI"
              />
            </div>

            <div className="space-y-2">
              <Label>System Color (Optional)</Label>
              <Select
                value={formData.systemColor}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, systemColor: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a system color..." />
                </SelectTrigger>
                <SelectContent>
                  {systemColorOptions.map((color) => (
                    <SelectItem key={color} value={color}>
                      {color} System
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={formData.location}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, location: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a location..." />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date (MM/DD/YYYY)</Label>
              <Input
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                placeholder="MM/DD/YYYY"
              />
            </div>

            <div className="space-y-2">
              <Label>Add Location</Label>
              <div className="flex gap-2">
                <Input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Calibration"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!newLocation.trim()) return;
                    onAddLocation(newLocation);
                    setFormData((prev) => ({ ...prev, location: newLocation.trim() }));
                    setNewLocation("");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="flex-[2] h-12 text-lg font-semibold"
                onClick={handleSubmit}
                disabled={!formData.id || !formData.name || !formData.category || updateEquipment.isPending}
              >
                {updateEquipment.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ActionModal({ 
  equipment, 
  isOpen, 
  onClose,
  canManageEquipment,
  allEquipment,
  locationOptions,
  systemColorOptions,
  onAddLocation,
  onAssignReplacement,
  replacementCandidates,
  onIdUpdated,
  onReturnBorrowed,
}: { 
  equipment: Equipment | null; 
  isOpen: boolean; 
  onClose: () => void;
  canManageEquipment: boolean;
  allEquipment: Equipment[];
  locationOptions: string[];
  systemColorOptions: string[];
  onAddLocation: (value: string) => void;
  onAssignReplacement: (
    brokenItem: Equipment,
    replacementItem: Equipment,
    context: "broken" | "checked_out",
    reason: string
  ) => void | Promise<void>;
  replacementCandidates: Equipment[];
  onIdUpdated?: (newId: string) => void;
  onReturnBorrowed?: (item: Equipment) => void;
}) {
  const checkout = useCheckout();
  const checkin = useCheckin();
  const deleteEquipment = useDeleteEquipment();
  const updateEquipment = useUpdateEquipment();
  const [isEditing, setIsEditing] = useState(false);
  
  // Checkout State
  const [workOrder, setWorkOrder] = useState("");
  const [valveNumber, setValveNumber] = useState("");
  const [techName, setTechName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("plantpouch-tech-name") ?? ""
  );
  
  // Checkin State
  const [notes, setNotes] = useState("");
  const [isBroken, setIsBroken] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [repairAction, setRepairAction] = useState<"shop" | "system">("shop");

  if (!isOpen || !equipment) return null;

  const isCheckingOut = equipment.status === 'available';
  const isBrokenState = equipment.status === 'broken';
  const isRepairItem = isRepairLocation(equipment.location);
  const isBorrowedItem = !!equipment.swappedFromId;
  const getSystemReturnLocation = () => {
    if (!equipment.systemColor) return "Shop";
    const candidates = allEquipment.filter(
      (item) =>
        (item.temporarySystemColor || item.systemColor) === equipment.systemColor &&
        !isRepairLocation(item.location)
    );
    if (candidates.length === 0) return "Shop";
    const counts = candidates.reduce<Record<string, number>>((acc, item) => {
      const location = item.location || "Shop";
      acc[location] = (acc[location] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Shop";
  };
  const systemLocation = getSystemReturnLocation();

  const handleSubmit = () => {
    if (isCheckingOut) {
      if (!techName.trim()) {
        toast.error("Enter your name before checking out.");
        return;
      }
      const trimmedValveNumber = valveNumber.trim();
      checkout.mutate({
        id: equipment.id,
        workOrder,
        techName: techName.trim(),
        valveNumber: trimmedValveNumber || undefined,
      });
    } else {
      checkin.mutate(
        { id: equipment.id, notes, isBroken },
        {
          onSuccess: () => {
            if (isBroken && replacementId) {
              const replacementItem = replacementCandidates.find((item) => item.id === replacementId);
              if (replacementItem) {
                onAssignReplacement(
                  equipment,
                  replacementItem,
                  "broken",
                  "Reported broken during check-in"
                );
              }
            }
          },
        }
      );
    }
    onClose();
    // Reset state
    setWorkOrder("");
    setValveNumber("");
    setTechName("");
    setNotes("");
    setIsBroken(false);
    setReplacementId("");
    setRepairAction("shop");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("plantpouch-tech-name", techName);
  }, [techName]);

  const handleDelete = () => {
    const confirmed = window.confirm(`Delete ${equipment.id}? This cannot be undone.`);
    if (!confirmed) return;
    deleteEquipment.mutate(equipment.id, {
      onSuccess: () => {
        toast.success(`Deleted ${equipment.id}.`);
        onClose();
      },
      onError: (error) => {
        toast.error(`Failed to delete equipment: ${error.message}`);
      },
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        
        <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="relative w-full max-w-lg bg-card border-t sm:border border-border rounded-t-xl sm:rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
        >
            <div className="p-6 space-y-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold font-mono tracking-tight">{equipment.id}</h2>
                        <h3 className="text-primary text-lg font-medium">{equipment.name}</h3>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                        <X className="w-5 h-5" />
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                        <span className="text-muted-foreground block text-xs mb-1">Status</span>
                        <StatusBadge status={equipment.status} />
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                        <span className="text-muted-foreground block text-xs mb-1">Category</span>
                        <span className="font-medium">{equipment.category}</span>
                    </div>
                </div>
                
                {equipment.status === 'checked_out' && (
                    <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Work Order</span>
                            <span className="font-mono font-medium">{equipment.workOrder}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Checked Out By</span>
                            <span className="font-medium">{equipment.checkedOutBy}</span>
                        </div>
                         <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Time</span>
                            <span className="font-medium">{equipment.checkedOutAt ? format(new Date(equipment.checkedOutAt), 'HH:mm dd/MM') : '-'}</span>
                        </div>
                    </div>
                )}

                {equipment.notes && (
                     <div className="p-4 rounded-lg bg-muted space-y-1">
                        <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <History className="w-3 h-3" /> Latest Notes
                        </span>
                        <p className="text-sm italic text-foreground/80">"{equipment.notes}"</p>
                    </div>
                )}

                {canManageEquipment && isBorrowedItem && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-2">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">Temporary Assignment</div>
                    <div className="text-xs text-muted-foreground">
                      Temporarily assigned to {equipment.temporarySystemColor ?? "system"}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onReturnBorrowed?.(equipment)}
                    >
                      Clear Temporary Assignment
                    </Button>
                  </div>
                )}

                {canManageEquipment && (
                  <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setIsEditing(true)}
                      >
                          Edit Equipment
                      </Button>
                      <Button
                          variant="destructive"
                          className="w-full"
                          onClick={handleDelete}
                          disabled={deleteEquipment.isPending}
                      >
                          {deleteEquipment.isPending ? "Deleting..." : "Delete Equipment"}
                      </Button>
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                    {canManageEquipment && isRepairItem && (
                      <div className="mb-6 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Repair Actions</div>
                        <div className="space-y-2">
                          <Label>Return Action</Label>
                          <Select value={repairAction} onValueChange={(value) => setRepairAction(value as "shop" | "system")}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choose return action" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="shop">Send to Shop</SelectItem>
                              <SelectItem value="system">Send to System</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            if (repairAction === "system") {
                              if (!equipment.systemColor) {
                                toast.error("This item is not assigned to a system.");
                                return;
                              }
                              updateEquipment.mutate(
                                {
                                  id: equipment.id,
                                  data: {
                                    location: systemLocation,
                                    status: "available",
                                    workOrder: null,
                                    checkedOutBy: null,
                                    checkedOutAt: null,
                                  },
                                },
                                {
                                  onSuccess: () => {
                                    toast.success(`Returned ${equipment.id} to ${systemLocation}.`);
                                  },
                                  onError: (error) => {
                                    toast.error(`Failed to update ${equipment.id}: ${error.message}`);
                                  },
                                }
                              );
                              return;
                            }
                            updateEquipment.mutate(
                              {
                                id: equipment.id,
                                data: {
                                  location: "Shop",
                                  status: "available",
                                  workOrder: null,
                                  checkedOutBy: null,
                                  checkedOutAt: null,
                                },
                              },
                              {
                                onSuccess: () => {
                                  toast.success(`${equipment.id} returned to Shop.`);
                                },
                                onError: (error) => {
                                  toast.error(`Failed to update ${equipment.id}: ${error.message}`);
                                },
                              }
                            );
                          }}
                        >
                          Apply Return
                        </Button>
                      </div>
                    )}
                    {/* Action Form */}
                    {isBrokenState ? (
                        <div className="text-center py-4 space-y-4">
                            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
                                <Wrench className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold">Equipment Needs Repair</h3>
                                <p className="text-muted-foreground text-sm">This item is flagged as broken. Repair maintenance required before it can be checked out.</p>
                            </div>
                            <Button className="w-full" variant="secondary" onClick={() => {
                                checkin.mutate({ id: equipment.id, notes: "Repaired and returned to service", isBroken: false });
                                onClose();
                            }}>
                                Mark as Repaired (Admin)
                            </Button>
                        </div>
                    ) : isCheckingOut ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Tech Name</Label>
                                <Input 
                                    placeholder="Enter your name" 
                                    value={techName}
                                    onChange={(e) => setTechName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Work Order #</Label>
                                <Input 
                                    placeholder="Enter WO-XXXX" 
                                    className="font-mono"
                                    value={workOrder}
                                    onChange={(e) => setWorkOrder(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Valve # (Optional)</Label>
                                <Input
                                    placeholder="Enter valve number"
                                    className="font-mono"
                                    value={valveNumber}
                                    onChange={(e) => setValveNumber(e.target.value)}
                                />
                            </div>
                            <Button 
                                className="w-full h-12 text-lg font-semibold" 
                                size="lg"
                                onClick={handleSubmit}
                                disabled={!workOrder || !techName.trim()}
                            >
                                Check Out Equipment
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Inspection Notes</Label>
                                <Textarea 
                                    placeholder="Any issues or observations?" 
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                            <div className={cn(
                                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                                isBroken ? "border-destructive/50 bg-destructive/10" : "border-border bg-muted/30"
                            )}>
                                <div className="space-y-0.5">
                                    <Label className={cn("text-base", isBroken && "text-destructive")}>Report Issue</Label>
                                    <p className="text-xs text-muted-foreground">Flag this equipment as broken/damaged</p>
                                </div>
                                <Switch 
                                    checked={isBroken}
                                    onCheckedChange={setIsBroken}
                                    className="data-[state=checked]:bg-destructive"
                                />
                            </div>
                            {isBroken && (
                              <div className="space-y-2">
                                <Label>Replacement Component (Optional)</Label>
                                <Select value={replacementId} onValueChange={setReplacementId}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select replacement..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {replacementCandidates.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.id} - {item.systemColor ?? "Unassigned"} - {item.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <Button 
                                className={cn("w-full h-12 text-lg font-semibold", isBroken ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "")}
                                size="lg"
                                onClick={handleSubmit}
                            >
                                {isBroken ? "Report Broken & Check In" : "Complete Check In"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>

        {canManageEquipment && isEditing && (
          <EditEquipmentModal
            equipment={equipment}
            isOpen={isEditing}
            onClose={() => setIsEditing(false)}
            locationOptions={locationOptions}
            systemColorOptions={systemColorOptions}
            onAddLocation={onAddLocation}
            onIdUpdated={onIdUpdated}
          />
        )}
    </div>
  );
}

function SystemCheckoutModal({ 
  isOpen, 
  onClose,
  initialSystemColor,
  initialValveNumber,
}: { 
  isOpen: boolean; 
  onClose: () => void;
  initialSystemColor?: string | null;
  initialValveNumber?: string | null;
}) {
  const { data: equipment = [] } = useEquipment();
  const { data: systemConfigs = [] } = useSystemConfigs();
  const checkoutSystem = useCheckoutSystem();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedComputerColor, setSelectedComputerColor] = useState<string>("");
  const [selectedBagColor, setSelectedBagColor] = useState<string>("");
  const [selectedComputerId, setSelectedComputerId] = useState<string>("");
  const [workOrder, setWorkOrder] = useState("");
  const [valveNumber, setValveNumber] = useState("");
  const [techName, setTechName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("plantpouch-tech-name") ?? ""
  );
  
  // Track which items are selected/verified for checkout
  // Key: Original Item ID, Value: The ID of the item to actually checkout (could be the same, or a replacement)
  const [verifiedItems, setVerifiedItems] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});

  const isItemAvailable = (item: Equipment) =>
    item.status === "available" &&
    !isRepairLocation(item.location) &&
    !item.temporarySystemColor;

  // Get unique system colors
  const systemColors = Array.from(new Set(equipment.map(e => e.systemColor).filter(Boolean))) as string[];
  const computerColors = Array.from(
    new Set(
      equipment
        .filter((item) => item.category === "Computer" && item.systemColor)
        .map((item) => item.systemColor as string)
    )
  );
  const bagColors = Array.from(
    new Set(
      equipment
        .filter((item) => item.category !== "Computer" && item.systemColor)
        .map((item) => item.systemColor as string)
    )
  );
  const systemLocationSummary = systemColors.map((color) => {
    const items = equipment.filter((item) => {
      if (item.category === "Computer") {
        return item.systemColor === color;
      }
      return (item.temporarySystemColor || item.systemColor) === color;
    });
    const activeItems = items.filter(
      (item) => item.status === "available" && !isRepairLocation(item.location)
    );
    const itemsForLocation = activeItems.length > 0 ? activeItems : items;
    const uniqueLocations = Array.from(
      new Set(itemsForLocation.map((item) => item.location || "Shop"))
    );
    return {
      color,
      location: uniqueLocations.length === 1 ? uniqueLocations[0] : "Mixed",
    };
  });
  const colorClassMap: Record<string, string> = {
    Blue: "bg-blue-500",
    Red: "bg-red-500",
    Yellow: "bg-yellow-500",
    Green: "bg-green-500",
  };

  type CheckoutSlot = {
    slotId: string;
    category: string;
    variant: string;
    required: boolean;
    originalItem: Equipment | null;
    source: "computer" | "template" | "extra";
  };

  const getTemplateRequirementsForColor = (color: string): SystemRequirement[] => {
    const config = systemConfigs.find((entry) => entry.systemColor === color);
    if (config && config.requirements.length > 0) {
      return config.requirements;
    }
    const baseItems = equipment.filter(
      (item) => item.category !== "Computer" && item.systemColor === color
    );
    return inferRequirementsFromItems(baseItems);
  };

  const buildBagSlots = (color: string): CheckoutSlot[] => {
    if (!color) return [];
    const bagItemsForColor = equipment.filter(
      (item) =>
        item.category !== "Computer" &&
        (item.temporarySystemColor || item.systemColor) === color
    );
    const requirements = getTemplateRequirementsForColor(color);
    if (requirements.length === 0) {
      return bagItemsForColor.map((item) => ({
        slotId: item.id,
        category: item.category,
        variant: getVariantLabel(item.variant),
        required: false,
        originalItem: item,
        source: "extra",
      }));
    }

    const buckets = bagItemsForColor.reduce((acc, item) => {
      const key = getRequirementKey(item.category, item.variant);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, Equipment[]>);

    const requiredSlots: CheckoutSlot[] = requirements.flatMap((requirement, requirementIndex) => {
      const key = getRequirementKey(requirement.category, requirement.variant);
      const itemsForRequirement = buckets[key] ?? [];
      return Array.from({ length: requirement.quantity }, (_, quantityIndex) => {
        const existing = itemsForRequirement.shift() ?? null;
        return {
          slotId:
            existing?.id ??
            `missing:${key}:${requirementIndex + 1}:${quantityIndex + 1}`,
          category: requirement.category,
          variant: getVariantLabel(requirement.variant),
          required: true,
          originalItem: existing,
          source: "template",
        };
      });
    });

    const extras = Object.values(buckets)
      .flat()
      .map((item) => ({
        slotId: item.id,
        category: item.category,
        variant: getVariantLabel(item.variant),
        required: false,
        originalItem: item,
        source: "extra" as const,
      }));

    return [...requiredSlots, ...extras];
  };

  const bagSlots = buildBagSlots(selectedBagColor);
  const bagItems = bagSlots
    .map((slot) => slot.originalItem)
    .filter((item): item is Equipment => !!item);
  const selectedComputer = equipment.find((item) => item.id === selectedComputerId);
  const checkoutLocation = selectedComputer?.location || "Shop";
  const isAvailableAtLocation = (item: Equipment) =>
    item.status === "available" &&
    !item.temporarySystemColor &&
    (item.location || "Shop") === checkoutLocation &&
    !isRepairLocation(item.location);
  const combinedItems = [
    ...(selectedComputer
      ? [
          {
            slotId: selectedComputer.id,
            category: "Computer",
            variant: getVariantLabel(selectedComputer.variant),
            required: true,
            originalItem: selectedComputer,
            source: "computer" as const,
          },
        ]
      : []),
    ...bagSlots,
  ];

  useEffect(() => {
    if (!isOpen) return;
    if (!initialSystemColor) return;

    const computerCandidates = equipment.filter(
      (item) =>
        item.category === "Computer" &&
        item.systemColor === initialSystemColor &&
        isItemAvailable(item)
    );
    const selected = computerCandidates[0];
    if (!selected) return;

    const initialVerified: Record<string, string> = {
      [selected.id]: selected.id,
    };
    const slots = buildBagSlots(initialSystemColor);
    const checkoutLocationForPreset = selected.location || "Shop";
    slots.forEach((slot) => {
      if (!slot.originalItem) {
        initialVerified[slot.slotId] = "";
        return;
      }
      const available =
        slot.originalItem.status === "available" &&
        !slot.originalItem.temporarySystemColor &&
        (slot.originalItem.location || "Shop") === checkoutLocationForPreset &&
        !isRepairLocation(slot.originalItem.location);
      initialVerified[slot.slotId] = available ? slot.originalItem.id : "";
    });

    setSelectedComputerColor(initialSystemColor);
    setSelectedBagColor(initialSystemColor);
    setSelectedComputerId(selected.id);
    setVerifiedItems(initialVerified);
    setValveNumber(initialValveNumber ?? "");
    setStep(3);
  }, [equipment, systemConfigs, initialSystemColor, initialValveNumber, isOpen]);

  const handleComputerSelect = (color: string) => {
    const candidates = equipment.filter(
      (item) =>
        item.category === "Computer" &&
        item.systemColor === color &&
        isItemAvailable(item)
    );
    if (candidates.length === 0) return;
    setSelectedComputerColor(color);
    setSelectedComputerId(candidates[0].id);
    setStep(2);
  };

  const getMissingLabel = (item: Equipment) => {
    const repairLabel = getRepairLocationLabel(item.location);
    if (repairLabel) return repairLabel;
    if (item.status === "broken") return "broken";
    if (item.status === "checked_out") return "checked out";
    if (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor) return `temporarily assigned to ${item.temporarySystemColor}`;
    if ((item.location ?? "Shop") !== "Shop") return item.location ?? "Shop";
    return "missing";
  };

  const missingBagItems = bagItems.filter((item) => !isAvailableAtLocation(item));
  const templateMissingSlots = bagSlots.filter((slot) => slot.required && !slot.originalItem);
  const unresolvedRequiredSlots = bagSlots.filter(
    (slot) => slot.required && slot.category !== "Computer" && !verifiedItems[slot.slotId]
  );

  const handleBagSelect = (color: string) => {
    const initialVerified: Record<string, string> = {};
    const slots = buildBagSlots(color);
    if (selectedComputer) {
      initialVerified[selectedComputer.id] = selectedComputer.id;
    }
    slots.forEach((slot) => {
      if (!slot.originalItem) {
        initialVerified[slot.slotId] = "";
        return;
      }
      initialVerified[slot.slotId] = isAvailableAtLocation(slot.originalItem) ? slot.originalItem.id : "";
    });
    setSelectedBagColor(color);
    setVerifiedItems(initialVerified);
    setStep(3);
  };

  const handleSwap = (slotId: string, newItemId: string) => {
    setVerifiedItems(prev => ({
      ...prev,
      [slotId]: newItemId
    }));
  };

  const handleItemToggle = (slot: CheckoutSlot, checked: boolean) => {
    if (slot.category === "Computer") return;
    if (!checked) {
      handleSwap(slot.slotId, "");
      return;
    }

    if (!slot.originalItem) {
      return;
    }

    const fallbackSelection = isAvailableAtLocation(slot.originalItem)
      ? slot.originalItem.id
      : verifiedItems[slot.slotId] || "";
    handleSwap(slot.slotId, fallbackSelection);
  };

  const handleSubmit = () => {
    if (!workOrder || !techName.trim()) return;
    if (unresolvedRequiredSlots.length > 0) {
      toast.error("Resolve all required missing components before checkout.");
      return;
    }
    
    // Collect all final IDs to checkout
    const finalIds = Object.values(verifiedItems).filter((id) => !!id);
    
    const trimmedValveNumber = valveNumber.trim();
    checkoutSystem.mutate({
      systemColor: selectedComputerColor,
      equipmentIds: finalIds,
      workOrder,
      techName: techName.trim(),
      valveNumber: trimmedValveNumber || undefined,
    });
    onClose();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("plantpouch-tech-name", techName);
  }, [techName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Box className="w-5 h-5 text-primary" />
              System Checkout
            </h2>
            <p className="text-sm text-muted-foreground">Check out a complete equipment system</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            <div className="space-y-4">
              <Label>Choose Computer Color</Label>
              <div className="grid grid-cols-2 gap-3">
                {computerColors.map(color => {
                    const hasAvailableComputer = equipment.some(
                      (item) =>
                        item.category === "Computer" &&
                        item.systemColor === color &&
                        isItemAvailable(item)
                    );
                    const locationLabel =
                      systemLocationSummary.find((entry) => entry.color === color)?.location ?? "Shop";
                    return (
                        <Button
                            key={color}
                            variant="outline"
                            className={cn(
                                "h-24 text-lg font-semibold border-2 relative overflow-hidden flex flex-col items-start justify-center gap-1 whitespace-normal break-words",
                                hasAvailableComputer
                                  ? "hover:border-primary hover:bg-primary/5"
                                  : "opacity-50 cursor-not-allowed"
                            )}
                            onClick={() => hasAvailableComputer && handleComputerSelect(color)}
                            disabled={!hasAvailableComputer}
                        >
                            <div className={cn("absolute inset-y-0 left-0 w-2", colorClassMap[color] ?? "bg-foreground/20")} />
                            <span className="whitespace-normal break-words">{color} Computer</span>
                            <span className="text-xs text-muted-foreground whitespace-normal break-words">Location: {locationLabel}</span>
                        </Button>
                    );
                })}
              </div>
            </div>
          ) : step === 2 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Computer</span>
                  <div className="font-bold text-lg text-primary">{selectedComputerColor}</div>
                  {selectedComputer && (
                    <div className="text-xs text-muted-foreground font-mono">{selectedComputer.id}</div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Change</Button>
              </div>

              <div className="space-y-4">
                <Label>Select Bag Color</Label>
                <div className="grid grid-cols-2 gap-3">
                  {bagColors.map(color => {
                    const itemsForBag = equipment.filter(
                      (item) =>
                        item.category !== "Computer" &&
                        (item.temporarySystemColor || item.systemColor) === color
                    );
                    const slotsForBag = buildBagSlots(color);
                    const locationItems = itemsForBag.filter(
                      (item) => item.status === "available" && !isRepairLocation(item.location)
                    );
                    const uniqueLocations = Array.from(
                      new Set((locationItems.length > 0 ? locationItems : itemsForBag).map((item) => item.location || "Shop"))
                    );
                    const bagLocation =
                      uniqueLocations.length === 1 ? uniqueLocations[0] : "Mixed";
                    const isSameLocation = bagLocation === checkoutLocation;
                    const missingItems = itemsForBag.filter((item) => !isAvailableAtLocation(item));
                    const missingTemplateSlots = slotsForBag.filter(
                      (slot) => slot.required && !slot.originalItem
                    );
                    const totalGaps = missingItems.length + missingTemplateSlots.length;
                    return (
                      <Button
                        key={color}
                        variant="outline"
                        className="h-24 text-left border-2 flex flex-col items-start justify-center gap-1 whitespace-normal break-words"
                        onClick={() => handleBagSelect(color)}
                        disabled={itemsForBag.length === 0}
                      >
                        <span className="text-base font-semibold whitespace-normal break-words">{color} Bag</span>
                        {isSameLocation ? (
                          totalGaps > 0 ? (
                            <span className="text-xs text-muted-foreground whitespace-normal break-words">
                              Missing {totalGaps}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600">Complete</span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground whitespace-normal break-words">
                            Location: {bagLocation}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
               <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Checkout</span>
                    <div className="font-bold text-lg text-primary">{selectedComputerColor} Computer</div>
                    <div className="text-xs text-muted-foreground">{selectedBagColor} Bag</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(2)}>Change</Button>
               </div>

               {(missingBagItems.length > 0 || templateMissingSlots.length > 0) && (
                 <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                   <div className="mb-1 font-semibold text-amber-700">Missing component from bag.</div>
                   {templateMissingSlots.length > 0 && (
                     <div className="mb-1">
                       Template gaps: {templateMissingSlots.map((slot) => `${slot.category} (${slot.variant})`).join(", ")}
                     </div>
                   )}
                   {missingBagItems.length > 0 && (
                     <div>
                       Missing from bag: {missingBagItems.map((item) => `${item.name} (${getMissingLabel(item)})`).join(", ")}
                     </div>
                   )}
                   <div className="mt-1">Spare options are listed first in each replacement picker, followed by alternatives from other bags.</div>
                 </div>
               )}

               <div className="space-y-4">
                 <Label>Bag Components</Label>
                 <div className="space-y-3">
                    {combinedItems.map(slot => {
                        const currentSelectedId = verifiedItems[slot.slotId];
                        const originalItem = slot.originalItem;
                        const isAvailable = originalItem ? isAvailableAtLocation(originalItem) : false;
                        const isOriginal = !!originalItem && currentSelectedId === originalItem.id && isAvailable;
                        const selectedItem = equipment.find(e => e.id === currentSelectedId);
                        const isChecked = Boolean(currentSelectedId);
                        const selectedElsewhere = new Set(
                            Object.entries(verifiedItems)
                              .filter(([slotId, selectedId]) => slotId !== slot.slotId && Boolean(selectedId))
                              .map(([, selectedId]) => selectedId)
                        );
                        
                        // Find potential replacements that can actually fill this slot at the current location.
                        const replacements = slot.category === "Computer"
                          ? []
                          : equipment.filter(e => 
                              e.category === slot.category && 
                              getVariantLabel(e.variant) === getVariantLabel(slot.variant) &&
                              e.status === 'available' && 
                              e.id !== originalItem?.id &&
                              !e.temporarySystemColor &&
                              (e.location || "Shop") === checkoutLocation &&
                              !selectedElsewhere.has(e.id)
                            ).sort((a, b) => {
                              const aSpare = (a.systemColor || "").trim().toLowerCase() === "spare" ? 0 : 1;
                              const bSpare = (b.systemColor || "").trim().toLowerCase() === "spare" ? 0 : 1;
                              if (aSpare !== bSpare) return aSpare - bSpare;
                              return a.id.localeCompare(b.id);
                            });

                        return (
                            <div key={slot.slotId} className="p-4 rounded-lg border border-border bg-card space-y-3">
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={isChecked}
                                        disabled={slot.category === "Computer"}
                                        onCheckedChange={(checked) => handleItemToggle(slot, checked === true)}
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <span className="font-medium">
                                              {slot.category}
                                              {slot.variant ? ` · ${slot.variant}` : ""}
                                            </span>
                                            <div className="flex gap-2">
                                              {slot.required && (
                                                <Badge variant="outline" className="font-mono text-[10px]">REQUIRED</Badge>
                                              )}
                                              {slot.source === "extra" && (
                                                <Badge variant="secondary" className="font-mono text-[10px]">EXTRA</Badge>
                                              )}
                                              <Badge variant={isOriginal ? "outline" : "secondary"} className="font-mono text-[10px]">
                                                  {isOriginal ? 'ORIGINAL' : isChecked ? 'REPLACEMENT' : 'NOT TAKING'}
                                              </Badge>
                                            </div>
                                        </div>
                                        
                                        {currentSelectedId ? (
                                            <div className="text-sm text-muted-foreground">
                                              {selectedItem?.name} <span className="font-mono text-xs opacity-70">({selectedItem?.id})</span>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-amber-600">
                                              {originalItem
                                                ? `Missing: ${originalItem.name} (${getMissingLabel(originalItem)})`
                                                : `Missing required template part: ${slot.category} (${slot.variant})`}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions Row */}
                                <div className="pl-7 flex flex-wrap gap-2 items-center">
                                    {/* Swap Dropdown */}
                                    <Select 
                                        disabled={slot.category === "Computer"}
                                        value={currentSelectedId || undefined} 
                                        onValueChange={(val) => handleSwap(slot.slotId, val)}
                                    >
                                        <SelectTrigger className="h-8 w-[220px] text-xs">
                                            <SelectValue placeholder="Select equipment" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {isAvailable && originalItem && (
                                              <SelectItem value={originalItem.id}>
                                                Original: {originalItem.name} ({originalItem.id})
                                              </SelectItem>
                                            )}
                                            {replacements.length > 0 ? (
                                              replacements.map(rep => (
                                                  <SelectItem key={rep.id} value={rep.id}>
                                                      {(rep.systemColor || "").trim().toLowerCase() === "spare" ? "Spare first" : "Other bag"}: {rep.name} ({rep.id})
                                                  </SelectItem>
                                              ))
                                            ) : !isAvailable ? (
                                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                                No matching parts available at {checkoutLocation}.
                                              </div>
                                            ) : null}
                                        </SelectContent>
                                    </Select>

                                    {/* Issue Reporting */}
                                    <Input 
                                        className="h-8 flex-1 text-xs" 
                                        placeholder="Report issue with original..."
                                        value={issues[slot.slotId] || ''}
                                        onChange={(e) => setIssues(prev => ({ ...prev, [slot.slotId]: e.target.value }))}
                                    />
                                </div>
                            </div>
                        );
                    })}
                 </div>
               </div>

               <div className="pt-4 border-t border-border space-y-4">
                  <div className="space-y-2">
                    <Label>Tech Name</Label>
                    <Input 
                        placeholder="Enter your name" 
                        value={techName}
                        onChange={(e) => setTechName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Work Order #</Label>
                    <Input 
                        placeholder="Enter WO-XXXX" 
                        className="font-mono text-lg"
                        value={workOrder}
                        onChange={(e) => setWorkOrder(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valve # (Optional)</Label>
                    <Input
                        placeholder="Enter valve number"
                        className="font-mono text-lg"
                        value={valveNumber}
                        onChange={(e) => setValveNumber(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full h-12 text-lg font-bold" 
                    onClick={handleSubmit}
                    disabled={!workOrder || !techName.trim() || !selectedComputerId || unresolvedRequiredSlots.length > 0}
                  >
                    Check Out System
                  </Button>
                  {unresolvedRequiredSlots.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Select replacements for all required missing parts before checkout.
                    </p>
                  )}
               </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SystemCheckInModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const { data: equipment = [] } = useEquipment();
  const checkinByWorkOrder = useCheckinByWorkOrder();
  const [step, setStep] = useState<1 | 2>(1);
  const [workOrder, setWorkOrder] = useState("");
  const [reports, setReports] = useState<Record<string, { isBroken: boolean; notes: string }>>({});

  // Derived state
  const itemsInWO = equipment.filter(e => e.workOrder === workOrder && e.status === 'checked_out');

  const handleLookup = () => {
    if (itemsInWO.length > 0) {
      setStep(2);
    } else {
      // Could show error toast here
      alert("No active checkouts found for this Work Order.");
    }
  };

  const handleSubmit = () => {
    checkinByWorkOrder.mutate({ workOrder, itemReports: reports });
    onClose();
  };

  const toggleBroken = (id: string) => {
    setReports(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        isBroken: !prev[id]?.isBroken
      }
    }));
  };

  const updateNotes = (id: string, notes: string) => {
    setReports(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        isBroken: prev[id]?.isBroken || false,
        notes
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              System Check In
            </h2>
            <p className="text-sm text-muted-foreground">Return equipment and report issues</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 ? (
            <div className="space-y-6 py-8">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">Enter Work Order Number</h3>
                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                    Type the work order number used during checkout to retrieve the equipment list.
                </p>
              </div>

              <div className="max-w-xs mx-auto space-y-4">
                <Input 
                    placeholder="e.g. WO-2024-889" 
                    className="font-mono text-center text-lg h-12 uppercase"
                    value={workOrder}
                    onChange={(e) => setWorkOrder(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    autoFocus
                />
                <Button 
                    className="w-full h-12 text-lg" 
                    onClick={handleLookup}
                    disabled={!workOrder}
                >
                    Find Order
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
               <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Work Order</span>
                    <div className="font-bold text-lg font-mono">{workOrder}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider">Items Found</div>
                    <div className="font-bold text-lg">{itemsInWO.length}</div>
                  </div>
               </div>

               <div className="space-y-4">
                 <Label>Equipment Inspection</Label>
                 <div className="space-y-3">
                    {itemsInWO.map(item => {
                        const isBroken = reports[item.id]?.isBroken;

                        return (
                            <div key={item.id} className={cn(
                                "p-4 rounded-lg border transition-all space-y-3",
                                isBroken ? "border-destructive bg-destructive/5" : "border-border bg-card"
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{item.name}</span>
                                            <Badge variant="outline" className="font-mono text-[10px]">{item.id}</Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">{item.category}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Label htmlFor={`broken-${item.id}`} className={cn("text-xs cursor-pointer", isBroken ? "text-destructive font-bold" : "text-muted-foreground")}>
                                            {isBroken ? "NEEDS REPAIR" : "Good Condition"}
                                        </Label>
                                        <Switch 
                                            id={`broken-${item.id}`}
                                            checked={isBroken}
                                            onCheckedChange={() => toggleBroken(item.id)}
                                            className="data-[state=checked]:bg-destructive"
                                        />
                                    </div>
                                </div>

                                {isBroken && (
                                    <motion.div 
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="pt-2"
                                    >
                                        <Label className="text-xs text-destructive mb-1.5 block flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Issue Description
                                        </Label>
                                        <Input 
                                            className="bg-background"
                                            placeholder="Describe the damage or issue..."
                                            value={reports[item.id]?.notes || ''}
                                            onChange={(e) => updateNotes(item.id, e.target.value)}
                                        />
                                    </motion.div>
                                )}
                            </div>
                        );
                    })}
                 </div>
               </div>

               <div className="pt-4 border-t border-border flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button 
                    className="flex-[2] h-12 text-lg font-bold" 
                    onClick={handleSubmit}
                  >
                    Complete Check In
                  </Button>
               </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AddEquipmentModal({ 
  isOpen, 
  onClose,
  locationOptions,
  systemColorOptions,
  onAddLocation,
}: { 
  isOpen: boolean; 
  onClose: () => void;
  locationOptions: string[];
  systemColorOptions: string[];
  onAddLocation: (value: string) => void;
}) {
  const createEquipment = useCreateEquipment();
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    variant: '',
    systemColor: '',
    location: 'Shop',
    status: 'available',
    dueDate: ''
  });
  const [newLocation, setNewLocation] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!formData.id || !formData.name || !formData.category) {
      toast.error("Please fill in all required fields");
      return;
    }

    let dueDate: Date | undefined;
    const dueDateInput = formData.dueDate.trim();
    if (dueDateInput) {
      const parsed = parseDueDateString(dueDateInput);
      if (!parsed) {
        toast.error("Due Date must be MM/DD/YYYY.");
        return;
      }
      dueDate = parsed;
    }
    
    createEquipment.mutate({
      id: formData.id,
      name: formData.name,
      category: formData.category,
      variant: formData.variant.trim() || undefined,
      systemColor: formData.systemColor || undefined,
      originalSystemColor: formData.systemColor || undefined,
      location: formData.location || "Shop",
      status: 'available',
      dueDate
    }, {
      onSuccess: () => {
        toast.success(`Equipment ${formData.id} added successfully`);
        setFormData({ id: '', name: '', category: '', variant: '', systemColor: '', location: 'Shop', status: 'available', dueDate: '' });
        onClose();
      },
      onError: (error) => {
        toast.error(`Failed to add equipment: ${error.message}`);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Add New Equipment</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Equipment ID <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="e.g. EQ-006" 
                className="font-mono uppercase"
                value={formData.id}
                onChange={(e) => setFormData(prev => ({ ...prev, id: e.target.value }))}
                data-testid="input-add-equipment-id"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Equipment Name <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="e.g. Fluke Thermal Imager" 
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-add-equipment-name"
              />
            </div>

            <div className="space-y-2">
              <Label>Category <span className="text-destructive">*</span></Label>
              <Input 
                placeholder="e.g. Measurement" 
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                data-testid="input-add-equipment-category"
              />
            </div>

            <div className="space-y-2">
              <Label>Variant</Label>
              <Input
                placeholder="e.g. 0-100 PSI"
                value={formData.variant}
                onChange={(e) => setFormData(prev => ({ ...prev, variant: e.target.value }))}
              />
            </div>

             <div className="space-y-2">
              <Label>System Color (Optional)</Label>
             <Select 
                value={formData.systemColor} 
                onValueChange={(val) => setFormData(prev => ({ ...prev, systemColor: val }))}
              >
                  <SelectTrigger>
                      <SelectValue placeholder="Select a system color..." />
                  </SelectTrigger>
                  <SelectContent>
                      {systemColorOptions.map((color) => (
                        <SelectItem key={color} value={color}>
                          {color} System
                        </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={formData.location}
                onValueChange={(val) => setFormData(prev => ({ ...prev, location: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a location..." />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date (MM/DD/YYYY)</Label>
              <Input
                placeholder="MM/DD/YYYY"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Add Location</Label>
              <div className="flex gap-2">
                <Input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Calibration"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!newLocation.trim()) return;
                    onAddLocation(newLocation);
                    setFormData(prev => ({ ...prev, location: newLocation.trim() }));
                    setNewLocation("");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            <Button 
              className="w-full h-12 text-lg font-semibold mt-4" 
              onClick={handleSubmit}
              disabled={!formData.id || !formData.name || !formData.category}
            >
              Add to Inventory
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BrandingModal({
  isOpen,
  onClose,
  value,
  onChange,
  onReset,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: BrandingState;
  onChange: (next: BrandingState) => void;
  onReset: () => void;
}) {
  if (!isOpen) return null;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 256 * 1024) {
      toast.error("Logo images must be 256 KB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      onChange({
        ...value,
        logo: {
          ...value.logo,
          imageSrc: result,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Branding</h2>
              <p className="text-xs text-muted-foreground">Admin - App identity settings</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>App Name</Label>
              <Input
                value={value.appName}
                onChange={(e) => onChange({ ...value, appName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={value.version}
                onChange={(e) => onChange({ ...value, version: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Font Preset</Label>
              <Select
                value={value.fontPreset}
                onValueChange={(fontPreset) =>
                  onChange({ ...value, fontPreset: fontPreset as BrandingState["fontPreset"] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a font pairing" />
                </SelectTrigger>
                <SelectContent>
                  {fontPresetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Logo Text (fallback)</Label>
              <Input
                value={value.logo.text ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    logo: { ...value.logo, text: e.target.value },
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Logo Image</Label>
              <p className="text-xs text-muted-foreground">
                Upload a local image only. Remote image URLs are disabled.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Upload Logo Image</Label>
                <Input type="file" accept="image/*" onChange={handleFileChange} />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    onChange({
                      ...value,
                      logo: { ...value.logo, imageSrc: "" },
                    })
                  }
                >
                  Clear Image
                </Button>
              </div>
            </div>

            {value.logo.imageSrc && (
              <div className="rounded-lg border border-border p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded bg-muted overflow-hidden">
                  <img src={value.logo.imageSrc} alt={value.logo.alt ?? "Logo preview"} className="h-full w-full object-cover" />
                </div>
                <div className="text-xs text-muted-foreground">Logo preview</div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onReset}>
                Reset Defaults
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AdminImportModal({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<InsertEquipment[]>([]);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setRows([]);
    setFileName("");
    setErrors([]);
    setIsImporting(false);
    setImportProgress(null);
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let currentCell = "";
    let currentRow: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((value) => value.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        continue;
      }

      currentCell += char;
    }

    currentRow.push(currentCell.trim());
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow);
    }

    return rows;
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();
    const parsedRows = parseCsvRows(text);

    if (parsedRows.length === 0) {
      setErrors(["The file is empty."]);
      setRows([]);
      return;
    }

    const headerValues = parsedRows[0].map((value) => value.toLowerCase());
    const headerMap = headerValues.reduce<Record<string, number>>((acc, value, index) => {
      acc[value] = index;
      return acc;
    }, {});
    const systemColorIndex =
      headerMap.systemcolor ?? headerMap["system_color"] ?? headerMap["system color"];
    const variantIndex = headerMap.variant ?? headerMap.spec ?? headerMap.type;
    const dueDateIndex =
      headerMap["due date"] ?? headerMap["duedate"] ?? headerMap["due_date"];
    const locationIndex = headerMap.location ?? headerMap["location"];

    const hasHeader = ["id", "name", "category"].every((key) => key in headerMap);
    const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;
    const nextErrors: string[] = [];
    const nextRows: InsertEquipment[] = [];

    dataRows.forEach((values, index) => {
      const id = hasHeader ? values[headerMap.id] : values[0];
      const name = hasHeader ? values[headerMap.name] : values[1];
      const category = hasHeader ? values[headerMap.category] : values[2];
      const variant = hasHeader ? values[variantIndex ?? -1] : values[3];
      const systemColor = hasHeader ? values[systemColorIndex ?? -1] : values[4];
      const location = hasHeader ? values[locationIndex ?? -1] : values[5];
      const dueDateRaw = hasHeader ? values[dueDateIndex ?? -1] : values[6];
      const dueDateTrimmed = dueDateRaw?.trim() ?? "";

      if (!id || !name || !category) {
        nextErrors.push(`Row ${index + 1}: missing required fields (id, name, category).`);
        return;
      }

      let dueDate: Date | undefined;
      if (dueDateTrimmed) {
        const parsed = parseDueDateString(dueDateTrimmed);
        if (!parsed) {
          nextErrors.push(`Row ${index + 1}: invalid Due Date (use MM/DD/YYYY).`);
          return;
        }
        dueDate = parsed;
      }

      nextRows.push({
        id: id.trim(),
        name: name.trim(),
        category: category.trim(),
        variant: variant?.trim() || undefined,
        systemColor: systemColor?.trim() || undefined,
        originalSystemColor: systemColor?.trim() || undefined,
        location: location?.trim() || "Shop",
        dueDate,
        status: "available"
      });
    });

    setErrors(nextErrors);
    setRows(nextRows);
  };

  const handleImport = async () => {
    if (!rows.length) {
      toast.error("Add at least one valid row before importing.");
      return;
    }

    setIsImporting(true);
    setImportProgress({ completed: 0, total: rows.length });
    const importErrors: string[] = [];
    let successCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        await api.equipment.create(row);
        successCount += 1;
      } catch (error) {
        importErrors.push(`${row.id}: ${error instanceof Error ? error.message : "Failed to create"}`);
      }
      setImportProgress({ completed: index + 1, total: rows.length });
    }

    if (successCount > 0) {
      toast.success(`Imported ${successCount} item(s).`);
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    }
    if (importErrors.length > 0) {
      toast.error(`Failed to import ${importErrors.length} item(s).`);
    }

    setErrors(importErrors);
    setIsImporting(false);
    if (importErrors.length === 0) {
      setImportProgress(null);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">CSV Import</h2>
                <p className="text-xs text-muted-foreground">Admin - Bulk Equipment Add</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Upload a CSV file with columns: id, name, category, variant (optional), systemColor (optional), location (optional), Due Date (optional, MM/DD/YYYY).</p>
            <p className="font-mono text-xs text-foreground/70">id,name,category,variant,systemColor,location,Due Date</p>
          </div>

          <div className="space-y-3">
            <Input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">Loaded: {fileName}</div>
            )}
            {rows.length > 0 && (
              <div className="text-sm text-foreground">Ready to import {rows.length} item(s).</div>
            )}
            {isImporting && importProgress && (
              <div className="text-xs text-muted-foreground">
                Importing {importProgress.completed} of {importProgress.total} item(s)...
              </div>
            )}
            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                {errors.map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleImport} disabled={isImporting}>
              {isImporting ? "Importing..." : "Import"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function BulkEditModal({
  isOpen,
  onClose,
  locationOptions,
  systemColorOptions,
  onApply,
  onDelete,
  selectedCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  locationOptions: string[];
  systemColorOptions: string[];
  onApply: (changes: { location?: string; systemColor?: string; status?: string }) => void;
  onDelete: () => void;
  selectedCount: number;
}) {
  const [location, setLocation] = useState("");
  const [systemColor, setSystemColor] = useState("");
  const [status, setStatus] = useState("");

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({
      location: location || undefined,
      systemColor: systemColor || undefined,
      status: status || undefined,
    });
    setLocation("");
    setSystemColor("");
    setStatus("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Bulk Edit</h2>
              <p className="text-xs text-muted-foreground">{selectedCount} selected</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Leave unchanged" />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>System Color</Label>
              <Select value={systemColor} onValueChange={setSystemColor}>
                <SelectTrigger>
                  <SelectValue placeholder="Leave unchanged" />
                </SelectTrigger>
                <SelectContent>
                  {systemColorOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Leave unchanged" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="checked_out">Checked Out</SelectItem>
                  <SelectItem value="broken">Broken</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleApply}>
                Apply Changes
              </Button>
            </div>

            <div className="pt-2 border-t border-border">
              <Button variant="destructive" className="w-full" onClick={onDelete}>
                Delete Selected
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SwapModal({
  isOpen,
  onClose,
  brokenItem,
  replacementOptions,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  brokenItem: Equipment | null;
  replacementOptions: Equipment[];
  onConfirm: (replacement: Equipment, reason: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");

  if (!isOpen || !brokenItem) return null;

  useEffect(() => {
    setSelectedId("");
    setReason("");
  }, [brokenItem?.id, isOpen]);

  const selected = replacementOptions.find((item) => item.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Swap Component</h2>
              <p className="text-xs text-muted-foreground">
                {brokenItem.id} ({brokenItem.systemColor}) - {brokenItem.category}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Replacement Component</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select replacement..." />
              </SelectTrigger>
              <SelectContent>
                {replacementOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.id} - {option.systemColor ?? "Unassigned"} - {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason for swap</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Encoder failed in the field; swapped to keep system running."
              className="min-h-[96px]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => selected && onConfirm(selected, reason.trim())}
              disabled={!selected || reason.trim().length === 0}
            >
              Confirm Swap
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function TransferSystemModal({
  isOpen,
  onClose,
  equipment,
  computerColors,
  bagColors,
  locationOptions,
  onAddLocation,
  onTransfer,
}: {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment[];
  computerColors: string[];
  bagColors: string[];
  locationOptions: string[];
  onAddLocation: (value: string) => void;
  onTransfer: (itemIds: string[], location: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedComputerColor, setSelectedComputerColor] = useState("");
  const [selectedBagColor, setSelectedBagColor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSelectedComputerColor("");
    setSelectedBagColor("");
    setSelectedLocation("");
    setNewLocation("");
  }, [isOpen]);

  const isTransferable = (item: Equipment) =>
    item.status === "available" && !isRepairLocation(item.location);

  const getMissingLabel = (item: Equipment) => {
    const repairLabel = getRepairLocationLabel(item.location);
    if (repairLabel) return repairLabel;
    if (item.status === "broken") return "broken";
    if (item.status === "checked_out") return "checked out";
    if (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor) return `temporarily assigned to ${item.temporarySystemColor}`;
    if ((item.location ?? "Shop") !== "Shop") return item.location ?? "Shop";
    return "missing";
  };

  const selectedComputer = equipment.find(
    (item) =>
      item.category === "Computer" &&
      item.systemColor === selectedComputerColor &&
      isTransferable(item)
  );
  const bagItems = equipment.filter(
    (item) =>
      item.category !== "Computer" &&
      (item.temporarySystemColor || item.systemColor) === selectedBagColor
  );
  const missingBagItems = bagItems.filter((item) => !isTransferable(item));
  const transferItems = [
    ...(selectedComputer ? [selectedComputer] : []),
    ...bagItems.filter(isTransferable),
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Transfer System</h2>
              <p className="text-xs text-muted-foreground">Move a system to a new location</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {step === 1 ? (
            <div className="space-y-4">
              <Label>Choose Computer Color</Label>
              <div className="grid grid-cols-2 gap-3">
                {computerColors.map((color) => {
                  const hasAvailable = equipment.some(
                    (item) =>
                      item.category === "Computer" &&
                      item.systemColor === color &&
                      isTransferable(item)
                  );
                  return (
                    <Button
                      key={color}
                      variant="outline"
                      className={cn(
                        "h-16 text-base font-semibold border-2 whitespace-normal break-words",
                        hasAvailable ? "hover:border-primary hover:bg-primary/5" : "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => {
                        if (!hasAvailable) return;
                        setSelectedComputerColor(color);
                        setStep(2);
                      }}
                      disabled={!hasAvailable}
                    >
                      <span className="whitespace-normal break-words">{color} Computer</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : step === 2 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Computer</span>
                  <div className="font-bold text-lg text-primary">{selectedComputerColor}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                  Change
                </Button>
              </div>
              <div className="space-y-4">
                <Label>Select Bag Color</Label>
                <div className="grid grid-cols-2 gap-3">
                  {bagColors.map((color) => {
                    const itemsForBag = equipment.filter(
                      (item) =>
                        item.category !== "Computer" &&
                        (item.temporarySystemColor || item.systemColor) === color
                    );
                    const uniqueLocations = Array.from(
                      new Set(itemsForBag.map((item) => item.location || "Shop"))
                    );
                    const bagLocation =
                      uniqueLocations.length === 1 ? uniqueLocations[0] : "Mixed";
                    const missingItems = itemsForBag.filter((item) => !isTransferable(item));
                    return (
                      <Button
                        key={color}
                        variant="outline"
                        className="h-20 text-left border-2 flex flex-col items-start justify-center gap-1 whitespace-normal break-words"
                        onClick={() => {
                          setSelectedBagColor(color);
                          setStep(3);
                        }}
                        disabled={itemsForBag.length === 0}
                      >
                        <span className="text-base font-semibold whitespace-normal break-words">{color} Bag</span>
                        <span className="text-xs text-muted-foreground whitespace-normal break-words">
                          Location: {bagLocation}
                        </span>
                        {missingItems.length > 0 ? (
                          <span className="text-xs text-muted-foreground whitespace-normal break-words">
                            Missing {missingItems.length}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-600">Complete</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Transfer</span>
                  <div className="font-bold text-lg text-primary">{selectedComputerColor} Computer</div>
                  <div className="text-xs text-muted-foreground">{selectedBagColor} Bag</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  Change
                </Button>
              </div>

              {missingBagItems.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground break-words whitespace-normal">
                  Missing from bag: {missingBagItems.map((item) => `${item.name} (${getMissingLabel(item)})`).join(", ")}
                </div>
              )}

              <div className="space-y-2">
                <Label>New Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locationOptions.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Add Location</Label>
                <div className="flex gap-2">
                  <Input
                    value={newLocation}
                    onChange={(event) => setNewLocation(event.target.value)}
                    placeholder="e.g. Containment Unit 1"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (!newLocation.trim()) return;
                      onAddLocation(newLocation);
                      setSelectedLocation(newLocation.trim());
                      setNewLocation("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => onTransfer(transferItems.map((item) => item.id), selectedLocation)}
                  disabled={!selectedLocation || transferItems.length === 0}
                >
                  Transfer
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function StageSystemModal({
  isOpen,
  onClose,
  systems,
  initialSystemColor,
  onStage,
}: {
  isOpen: boolean;
  onClose: () => void;
  systems: Array<{
    color: string;
    summary: string;
    missingLabels: string[];
  }>;
  initialSystemColor?: string | null;
  onStage: (params: {
    systemColor: string;
    stagingLocation: string;
    stagedBy: string;
    valveNumber?: string;
    notes?: string;
    missingItems: StagedSystemMissingItem[];
    targetDate?: string;
  }) => Promise<void>;
}) {
  const [systemColor, setSystemColor] = useState("");
  const [stagingLocation, setStagingLocation] = useState("");
  const [stagedBy, setStagedBy] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("plantpouch-tech-name") ?? ""
  );
  const [valveNumber, setValveNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [missingSummary, setMissingSummary] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSystemColor(initialSystemColor ?? "");
    setStagingLocation("");
    setValveNumber("");
    setNotes("");
    setMissingSummary("");
    setTargetDate("");
    setIsSubmitting(false);
  }, [initialSystemColor, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("plantpouch-tech-name", stagedBy);
  }, [stagedBy]);

  if (!isOpen) return null;

  const selectedSystem = systems.find((system) => system.color === systemColor);

  const handleSubmit = async () => {
    if (!systemColor || !stagingLocation.trim() || !stagedBy.trim()) {
      toast.error("System, staging location, and tech name are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const missingItems = missingSummary
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ category: value, variant: null, notes: null }));

      await onStage({
        systemColor,
        stagingLocation: stagingLocation.trim(),
        stagedBy: stagedBy.trim(),
        valveNumber: valveNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        missingItems,
        targetDate: targetDate.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain p-4 sm:flex sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative my-6 w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden sm:my-0"
      >
        <div className="max-h-[calc(100dvh-3rem)] overflow-y-auto p-6 space-y-6 sm:max-h-[90vh]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Stage System</h2>
              <p className="text-xs text-muted-foreground">Mark a system ready for upcoming work</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-3">
            <Label>Select System</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {systems.map((system) => (
                <button
                  key={system.color}
                  type="button"
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    systemColor === system.color
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-muted/20 hover:border-primary/40"
                  )}
                  onClick={() => setSystemColor(system.color)}
                >
                  <div className="font-semibold">{system.color} System</div>
                  <div className="text-xs text-muted-foreground">{system.summary}</div>
                </button>
              ))}
            </div>
            {selectedSystem && selectedSystem.missingLabels.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                Current gaps: {selectedSystem.missingLabels.join(", ")}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Staged At *</Label>
              <Input value={stagingLocation} onChange={(event) => setStagingLocation(event.target.value)} placeholder="e.g. Scaffold at ED804" />
            </div>
            <div className="space-y-2">
              <Label>Staged By *</Label>
              <Input value={stagedBy} onChange={(event) => setStagedBy(event.target.value)} placeholder="Tech name" />
            </div>
            <div className="space-y-2">
              <Label>Valve / Site</Label>
              <Input value={valveNumber} onChange={(event) => setValveNumber(event.target.value)} placeholder="e.g. ED804" />
            </div>
            <div className="space-y-2">
              <Label>Target Date</Label>
              <Input value={targetDate} onChange={(event) => setTargetDate(event.target.value)} placeholder="YYYY-MM-DD" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Missing / Needed Items</Label>
            <Input
              value={missingSummary}
              onChange={(event) => setMissingSummary(event.target.value)}
              placeholder="Comma separated, e.g. Encoder, 0-100 PSI transducer"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Needs batteries before morning shift."
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Staging..." : "Stage System"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SystemConfigModal({
  isOpen,
  onClose,
  systemColor,
  initialRequirements,
  equipment,
  initialAssignedItemIds,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  systemColor: string;
  initialRequirements: SystemRequirement[];
  equipment: Equipment[];
  initialAssignedItemIds: string[];
  onSave: (requirements: SystemRequirement[], assignedItemIds: string[]) => Promise<void>;
}) {
  const [requirements, setRequirements] = useState<SystemRequirement[]>(initialRequirements);
  const [assignedItemIds, setAssignedItemIds] = useState<string[]>(initialAssignedItemIds);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRequirements(initialRequirements);
    setAssignedItemIds(initialAssignedItemIds);
    setIsSubmitting(false);
  }, [initialAssignedItemIds, initialRequirements, isOpen]);

  if (!isOpen) return null;

  const updateRequirement = (id: string, updates: Partial<SystemRequirement>) => {
    setRequirements((prev) =>
      prev.map((requirement) => (requirement.id === id ? { ...requirement, ...updates } : requirement))
    );
  };

  const addRequirement = () => {
    const id = `${Date.now()}`;
    setRequirements((prev) => [
      ...prev,
      { id, category: "", variant: "Standard", quantity: 1 },
    ]);
  };

  const toggleAssignedItem = (id: string) => {
    setAssignedItemIds((prev) =>
      prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
    );
  };

  const requirementKeys = new Set(
    requirements
      .map((requirement) =>
        requirement.category.trim() ? getRequirementKey(requirement.category, requirement.variant) : ""
      )
      .filter(Boolean)
  );

  const assignedItems = assignedItemIds
    .map((id) => equipment.find((item) => item.id === id))
    .filter((item): item is Equipment => !!item);

  const candidateItems = equipment
    .filter((item) => {
      const isAssigned = assignedItemIds.includes(item.id);
      if (isAssigned) return true;
      if (item.category === "Computer") return false;
      if (item.status !== "available") return false;
      if (item.temporarySystemColor) return false;
      if (isRepairLocation(item.location)) return false;
      if (requirementKeys.size === 0) return true;
      return requirementKeys.has(getRequirementKey(item.category, item.variant));
    })
    .sort((a, b) => {
      const aAssigned = assignedItemIds.includes(a.id) ? 1 : 0;
      const bAssigned = assignedItemIds.includes(b.id) ? 1 : 0;
      if (aAssigned !== bAssigned) return bAssigned - aAssigned;
      const aMatches = requirementKeys.has(getRequirementKey(a.category, a.variant)) ? 1 : 0;
      const bMatches = requirementKeys.has(getRequirementKey(b.category, b.variant)) ? 1 : 0;
      if (aMatches !== bMatches) return bMatches - aMatches;
      return a.category.localeCompare(b.category) || getVariantLabel(a.variant).localeCompare(getVariantLabel(b.variant)) || a.id.localeCompare(b.id);
    });

  const loadRequirementsFromAssigned = () => {
    if (!assignedItems.length) {
      toast.error("Select at least one initial component first.");
      return;
    }
    setRequirements(inferRequirementsFromItems(assignedItems));
  };

  const handleSave = async () => {
    const cleaned = requirements
      .map((requirement) => ({
        ...requirement,
        category: requirement.category.trim(),
        variant: getVariantLabel(requirement.variant),
        quantity: Number(requirement.quantity) || 0,
      }))
      .filter((requirement) => requirement.category && requirement.quantity > 0);

    const finalRequirements = cleaned.length > 0 ? cleaned : inferRequirementsFromItems(assignedItems);

    if (!finalRequirements.length) {
      toast.error("Add at least one requirement or select initial components.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(finalRequirements, assignedItemIds);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain p-4 sm:flex sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative my-6 w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden sm:my-0"
      >
        <div className="max-h-[calc(100dvh-3rem)] overflow-y-auto p-6 space-y-6 sm:max-h-[90vh]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{systemColor} System Template</h2>
              <p className="text-xs text-muted-foreground">Set the basic bag requirements, then choose the actual starting components for this bag.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Basic Requirements</div>
                <div className="text-xs text-muted-foreground">These define what a complete bag should contain.</div>
              </div>
              <Button variant="outline" size="sm" onClick={loadRequirementsFromAssigned}>
                Use Selected Components
              </Button>
            </div>
            {requirements.map((requirement) => (
              <div key={requirement.id} className="grid gap-3 rounded-md border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1.4fr_1.4fr_120px_auto]">
                <Input
                  value={requirement.category}
                  onChange={(event) => updateRequirement(requirement.id, { category: event.target.value })}
                  placeholder="Category"
                />
                <Input
                  value={requirement.variant}
                  onChange={(event) => updateRequirement(requirement.id, { variant: event.target.value })}
                  placeholder="Variant"
                />
                <Input
                  type="number"
                  min={1}
                  value={String(requirement.quantity)}
                  onChange={(event) => updateRequirement(requirement.id, { quantity: Number(event.target.value) })}
                  placeholder="Qty"
                />
                <Button
                  variant="outline"
                  onClick={() => setRequirements((prev) => prev.filter((entry) => entry.id !== requirement.id))}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold">Initial Bag Components</div>
              <div className="text-xs text-muted-foreground">Pick the real parts that should belong to the {systemColor} bag by default.</div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/10 p-3">
              {assignedItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No initial components selected yet.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleAssignedItem(item.id)}
                      className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs hover:border-primary/40"
                    >
                      {item.category} · {getVariantLabel(item.variant)} · {item.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-3">
              {candidateItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No available components match these requirements right now.</div>
              ) : (
                candidateItems.map((item) => {
                  const isSelected = assignedItemIds.includes(item.id);
                  const homeColor = item.systemColor || "Unassigned";
                  const isDifferentHome = !!item.systemColor && item.systemColor !== systemColor;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleAssignedItem(item.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border/60 bg-background hover:border-primary/40"
                      )}
                    >
                      <Checkbox checked={isSelected} className="mt-0.5 pointer-events-none" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.category}</span>
                          <span className="text-xs text-muted-foreground">{getVariantLabel(item.variant)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Location: {item.location || "Shop"}</span>
                          <span>Home bag: {homeColor}</span>
                          {isDifferentHome && <Badge variant="secondary">Moves from {item.systemColor}</Badge>}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={addRequirement}>
              Add Requirement
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Template"}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ResolveBorrowedModal({
  isOpen,
  onClose,
  borrowedItem,
  onResolve,
}: {
  isOpen: boolean;
  onClose: () => void;
  borrowedItem: Equipment | null;
  onResolve: (params: {
    borrowedId: string;
    action: "return_home" | "assign_permanent" | "move_to_spares" | "set_custom_location";
    destinationLocation?: string;
  }) => Promise<void>;
}) {
  const [action, setAction] = useState<"return_home" | "assign_permanent" | "move_to_spares" | "set_custom_location">("return_home");
  const [destinationLocation, setDestinationLocation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAction("return_home");
    setDestinationLocation("");
    setIsSubmitting(false);
  }, [isOpen, borrowedItem?.id]);

  if (!isOpen || !borrowedItem) return null;

  const needsLocation = action === "set_custom_location";

  const handleSubmit = async () => {
    if (needsLocation && !destinationLocation.trim()) {
      toast.error("Enter a destination location.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onResolve({
        borrowedId: borrowedItem.id,
        action,
        destinationLocation: destinationLocation.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain p-4 sm:flex sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        className="relative my-6 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden sm:my-0"
      >
        <div className="max-h-[calc(100dvh-3rem)] overflow-y-auto p-6 space-y-6 sm:max-h-[90vh]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Resolve Temporary Assignment</h2>
              <p className="text-xs text-muted-foreground">
                {borrowedItem.id} in {borrowedItem.temporarySystemColor ?? borrowedItem.systemColor ?? "system"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(value) => setAction(value as typeof action)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="return_home">Return to original system</SelectItem>
                <SelectItem value="assign_permanent">Assign permanently to current system</SelectItem>
                <SelectItem value="move_to_spares">Move to spares</SelectItem>
                <SelectItem value="set_custom_location">Set custom location</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsLocation && (
            <div className="space-y-2">
              <Label>Destination Location</Label>
              <Input
                value={destinationLocation}
                onChange={(event) => setDestinationLocation(event.target.value)}
                placeholder="e.g. Bench 2"
              />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Apply"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ReturnsModal({
  isOpen,
  onClose,
  items,
  onReturn,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: Equipment[];
  onReturn: (itemIds: string[], dueDate?: Date | null) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [useNewDueDate, setUseNewDueDate] = useState(false);
  const [dueDateInput, setDueDateInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sentItems = items.filter((item) => getRepairLocationType(item.location) === "sent");
  const allSelected = sentItems.length > 0 && selectedIds.length === sentItems.length;

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setUseNewDueDate(false);
    setDueDateInput("");
    setIsSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(sentItems.map((item) => item.id));
  };

  const handleSubmit = async () => {
    if (!selectedIds.length) {
      toast.error("Select at least one item to return.");
      return;
    }
    let dueDate: Date | null | undefined;
    if (useNewDueDate) {
      const parsed = parseDueDateString(dueDateInput);
      if (!parsed) {
        toast.error("Due Date must be MM/DD/YYYY.");
        return;
      }
      dueDate = parsed;
    }

    setIsSubmitting(true);
    try {
      await onReturn(selectedIds, dueDate);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Returns</h2>
              <p className="text-xs text-muted-foreground">Select items returned from repair</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {sentItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items are currently sent for repairs.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  className="flex items-center gap-2"
                  onClick={handleSelectAll}
                >
                  <Checkbox checked={allSelected} />
                  <span>Select all</span>
                </button>
                <span>{selectedIds.length} selected</span>
              </div>
              <div className="max-h-64 overflow-auto space-y-2">
                {sentItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                  >
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono">{item.id}</div>
                      <div className="text-muted-foreground truncate">{item.name}</div>
                    </div>
                    {item.systemColor && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.systemColor} Sys
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>New Due Date?</Label>
              <Switch checked={useNewDueDate} onCheckedChange={setUseNewDueDate} />
            </div>
            {useNewDueDate && (
              <Input
                placeholder="MM/DD/YYYY"
                value={dueDateInput}
                onChange={(event) => setDueDateInput(event.target.value)}
              />
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting || sentItems.length === 0}>
              {isSubmitting ? "Returning..." : "Return Selected"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function DueDatesModal({
  isOpen,
  onClose,
  categories,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onApply: (category: string, amount: number, unit: "months" | "years") => Promise<void>;
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("6");
  const [unit, setUnit] = useState<"months" | "years">("months");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCategory("");
    setAmount("6");
    setUnit("months");
    setIsSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const trimmedCategory = category.trim();
    const parsedAmount = Number(amount);
    if (!trimmedCategory) {
      toast.error("Select a category.");
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("Enter a valid time amount.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onApply(trimmedCategory, parsedAmount, unit);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Due Dates</h2>
              <p className="text-xs text-muted-foreground">Apply a due date to repair items by category</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Time Until Due</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Select value={unit} onValueChange={(value) => setUnit(value as "months" | "years")}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Applying..." : "Apply"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ActivityLogModal({
  isOpen,
  onClose,
  isLoading,
  entries,
}: {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  entries: Array<{
    id: string;
    equipmentId: string;
    action: string;
    timestamp: string;
    details?: string | null;
    workOrder?: string | null;
  }>;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Recent Activity</h2>
              <p className="text-xs text-muted-foreground">Last 5 check in/out events</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading activity...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No recent activity.</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const message = entry.details || entry.action;
                const workOrder = entry.workOrder ? `WO ${entry.workOrder}` : "";
                return (
                  <div key={entry.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                    <div className="font-medium">{message}</div>
                    <div className="text-muted-foreground">
                      {workOrder ? `${workOrder} · ` : ""}
                      {format(new Date(entry.timestamp), "HH:mm dd/MM")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default function Home({ mode = "admin" }: { mode?: "admin" | "tech" }) {
  const { data: equipment = [], isLoading } = useEquipment();
  const { data: systemConfigs = [] } = useSystemConfigs();
  const { data: stagedSystems = [] } = useStagedSystems();
  const adminEnabled = mode === "admin";
  const updateEquipment = useUpdateEquipment();
  const saveSystemConfig = useSaveSystemConfig();
  const saveStagedSystem = useSaveStagedSystem();
  const clearStagedSystem = useClearStagedSystem();
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSystemCheckoutOpen, setIsSystemCheckoutOpen] = useState(false);
  const [checkoutPreset, setCheckoutPreset] = useState<{ systemColor: string; valveNumber?: string | null } | null>(null);
  const [isSystemCheckInOpen, setIsSystemCheckInOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBrandingOpen, setIsBrandingOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(adminEnabled);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [brandingState, setBrandingState] = useState<BrandingState>(() => loadBrandingFromStorage());
  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const brandingDirtyRef = useRef(false);
  const canManageEquipment = adminEnabled && isAdminMode;
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [inventoryColorFilter, setInventoryColorFilter] = useState("All");
  const [bagPreviewColor, setBagPreviewColor] = useState("none");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<Equipment | null>(null);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swapContext, setSwapContext] = useState<"broken" | "checked_out">("broken");
  const [borrowedToResolve, setBorrowedToResolve] = useState<Equipment | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isStageOpen, setIsStageOpen] = useState(false);
  const [stageInitialColor, setStageInitialColor] = useState<string | null>(null);
  const [templateColor, setTemplateColor] = useState<string | null>(null);
  const [isReturnsOpen, setIsReturnsOpen] = useState(false);
  const [isDueDatesOpen, setIsDueDatesOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [recentHistory, setRecentHistory] = useState<Array<{
    id: string;
    equipmentId: string;
    action: string;
    timestamp: string;
    details?: string | null;
    workOrder?: string | null;
  }>>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState("Shop");
  const [customLocations, setCustomLocations] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("plantpouch-locations");
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  
  const selectedEquipment = equipment.find(e => e.id === selectedEquipmentId) || null;
  
  const stats = {
    total: equipment.length,
    out: equipment.filter(e => e.status === 'checked_out').length,
    broken: equipment.filter((item) => isRepairLocation(item.location)).length,
  };

  const locationOptions = Array.from(
    new Set([
      "Shop",
      "Sent for Repairs",
      "Waiting on Repairs",
      "Repairs",
      ...equipment.map((item) => item.location || "Shop"),
      ...customLocations,
    ])
  );
  const systemColorOptions = Array.from(
    new Set(
      equipment
        .flatMap((item) => [item.systemColor, item.temporarySystemColor])
        .filter((color): color is string => !!color && color.trim().length > 0)
    )
  );
  const categoryOptions = Array.from(
    new Set(equipment.map((item) => item.category).filter((category) => category && category.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b));
  const bagColorOptions = Array.from(
    new Set(
      equipment
        .filter((item) => item.category !== "Computer" && item.systemColor)
        .map((item) => item.systemColor as string)
    )
  );
  const computerColorOptions = Array.from(
    new Set(
      equipment
        .filter((item) => item.category === "Computer" && item.systemColor)
        .map((item) => item.systemColor as string)
    )
  );
  const baseSystemColors = Array.from(
    new Set(equipment.map((item) => item.systemColor).filter((color): color is string => !!color))
  );
  const systemLocationSummary = baseSystemColors.map((color) => {
    const items = equipment.filter((item) => item.systemColor === color);
    const uniqueLocations = Array.from(
      new Set(items.map((item) => item.location || "Shop"))
    );
    return {
      color,
      location: uniqueLocations.length === 1 ? uniqueLocations[0] : "Mixed",
    };
  });
  const systemConfigMap = new Map(systemConfigs.map((config) => [config.systemColor, config]));
  const stagedSystemMap = new Map(stagedSystems.map((staged) => [staged.systemColor, staged]));

  const checkedOutGroups = Object.values(
    equipment
      .filter((item) => item.status === "checked_out")
      .reduce((acc, item) => {
        const tech = item.checkedOutBy || "Unknown tech";
        const workOrder = item.workOrder || "-";
        const effectiveColor = item.temporarySystemColor || item.systemColor;
        const valveNumber = extractValveNumber(item.notes);
        const key = effectiveColor
          ? `system:${effectiveColor}:${workOrder}:${tech}:${valveNumber ?? "-"}`
          : `item:${item.id}`;

        if (!acc[key]) {
          acc[key] = {
            key,
            systemColor: effectiveColor || null,
            tech,
            workOrder,
            valveNumber,
            items: [],
          };
        }
        if (!acc[key].valveNumber && valveNumber) {
          acc[key].valveNumber = valveNumber;
        }
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { key: string; systemColor: string | null; tech: string; workOrder: string; valveNumber: string | null; items: Equipment[] }>)
  )
  .map((group) => ({ ...group, items: sortEquipmentById(group.items) }))
  .sort((a, b) => {
    const aTime = Math.max(...a.items.map((item) => item.checkedOutAt ? new Date(item.checkedOutAt).getTime() : 0));
    const bTime = Math.max(...b.items.map((item) => item.checkedOutAt ? new Date(item.checkedOutAt).getTime() : 0));
    return bTime - aTime;
  });

  const getLocation = (item: Equipment) => item.location || "Shop";

  const systemsByColor = Object.values(
    equipment
      .filter((item) => item.systemColor)
      .reduce((acc, item) => {
        const key = item.systemColor as string;
        if (!acc[key]) {
          acc[key] = { color: key, items: [] as Equipment[] };
        }
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { color: string; items: Equipment[] }>)
  );

  const activeComponentsForSystem = (color: string) =>
    sortEquipmentById(equipment).filter(
      (item) =>
        (item.temporarySystemColor || item.systemColor) === color &&
        item.status === "available" &&
        !isRepairLocation(item.location)
    );


  const repairSystems = systemsByColor.filter((system) =>
    system.items.some((item) => getRepairLocationType(item.location) === "sent")
  );
  const waitingSystems = systemsByColor.filter((system) =>
    system.items.some((item) => getRepairLocationType(item.location) === "waiting")
  );

  const getReplacementLabel = (item: Equipment) => {
    if (!item.replacementId) return "";
    const replacement = equipment.find((entry) => entry.id === item.replacementId);
    if (!replacement) return item.replacementId;
    const color = replacement.originalSystemColor || replacement.systemColor || "Unassigned";
    return `${replacement.id} (${color})`;
  };

  const systemStatuses = systemsByColor.map((system) => {
    const config = systemConfigMap.get(system.color);
    const requirements =
      config && config.requirements.length > 0
        ? config.requirements
        : inferRequirementsFromItems(system.items);
    const availableItems = activeComponentsForSystem(system.color);
    const availableByRequirement = availableItems.reduce((acc, item) => {
      const key = getRequirementKey(item.category, item.variant);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const missingRequirements = requirements
      .map((requirement) => {
        const present = availableByRequirement[getRequirementKey(requirement.category, requirement.variant)] ?? 0;
        const missing = Math.max(requirement.quantity - present, 0);
        return missing > 0 ? { ...requirement, missing } : null;
      })
      .filter((entry): entry is SystemRequirement & { missing: number } => !!entry);
    const expectedCount = requirements.reduce((sum, requirement) => sum + requirement.quantity, 0);
    const effectiveAvailableCount = expectedCount - missingRequirements.reduce((sum, req) => sum + req.missing, 0);
    return {
      color: system.color,
      config,
      requirements,
      expectedCount,
      availableItems,
      effectiveAvailableCount,
      missingRequirements,
      staged: stagedSystemMap.get(system.color) ?? null,
      completeness: missingRequirements.length === 0 ? "Complete" : `Missing ${missingRequirements.reduce((sum, req) => sum + req.missing, 0)}`,
    };
  });

  const groupItemsBySystem = (items: Equipment[]) =>
    Object.values(
      sortEquipmentById(items).reduce((acc, item) => {
        const key = item.temporarySystemColor || item.systemColor || "Unassigned";
        if (!acc[key]) {
          acc[key] = { color: key, items: [] as Equipment[] };
        }
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { color: string; items: Equipment[] }>)
    ).sort((a, b) => a.color.localeCompare(b.color, undefined, { numeric: true, sensitivity: "base" }));

  const goodSystemItems = systemStatuses.map((system) => ({
    color: system.color,
    items: system.availableItems,
    missingRequirements: system.missingRequirements,
    expectedCount: system.expectedCount,
    effectiveAvailableCount: system.effectiveAvailableCount,
    requirements: system.requirements,
    staged: system.staged,
    completeness: system.completeness,
  }));
  const availableSystemItems = goodSystemItems.filter((system) => !system.staged);
  const stagedSystemItems = goodSystemItems.filter((system) => !!system.staged);
  const repairItems = groupItemsBySystem(
    equipment.filter((item) => getRepairLocationType(item.location) === "sent")
  );
  const waitingItems = groupItemsBySystem(
    equipment.filter((item) => getRepairLocationType(item.location) === "waiting")
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEquipment = equipment.filter((item) => {
    if (!normalizedSearch) return true;
    return [
      item.id,
      item.name,
      item.category,
      item.systemColor ?? "",
      item.temporarySystemColor ?? "",
      item.originalSystemColor ?? "",
      item.location ?? "",
      item.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const getReplacementCandidates = (target: Equipment) =>
    equipment.filter((item) => {
      if (item.id === target.id) return false;
      if (item.status !== "available") return false;
      if (item.temporarySystemColor) return false;
      if (getLocation(item) !== "Shop") return false;
      return item.category === target.category;
    });

  const swapCandidates = swapTarget
    ? equipment.filter((item) => {
        if (item.id === swapTarget.id) return false;
        if (item.status !== "available") return false;
        if (item.temporarySystemColor) return false;
        if (getLocation(item) !== "Shop") return false;
        return item.category === swapTarget.category;
      })
    : [];

  useEffect(() => {
    let active = true;
    api.branding
      .get()
      .then((overrides) => {
        if (!active) return;
        if (!brandingDirtyRef.current) {
          const nextBranding = mergeBranding(overrides);
          setBrandingState(nextBranding);
          saveBrandingToStorage(nextBranding);
        }
        setBrandingLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setBrandingLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!brandingLoaded) return;
    const timeout = setTimeout(() => {
      api.branding.save(brandingState).catch((error) => {
        const message = error instanceof Error ? error.message : "Failed to save branding.";
        toast.error(message);
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [brandingLoaded, brandingState]);

  useEffect(() => {
    applyBrandingToDocument(brandingState);
    saveBrandingToStorage(brandingState);
  }, [brandingState]);

  useEffect(() => {
    try {
      localStorage.setItem("plantpouch-locations", JSON.stringify(customLocations));
    } catch {
      // Ignore localStorage errors.
    }
  }, [customLocations]);

  useEffect(() => {
    if (!isActivityOpen) return;
    let active = true;
    setIsHistoryLoading(true);
    api.equipment
      .getRecentHistory(10)
      .then((entries) => {
        if (!active) return;
        const filtered = entries.filter((entry) =>
          entry.action === "system_check_in" || entry.action === "system_check_out"
        );
        setRecentHistory(filtered.slice(0, 5));
      })
      .catch(() => {
        if (!active) return;
        toast.error("Failed to load activity log.");
      })
      .finally(() => {
        if (!active) return;
        setIsHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isActivityOpen]);

  const handleAddLocation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCustomLocations((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const handleRemoveLocation = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const affectedItems = equipment.filter(
      (item) => (item.location ?? "Shop") === trimmed
    );
    try {
      if (affectedItems.length > 0) {
        await Promise.all(
          affectedItems.map((item) =>
            api.equipment.update(item.id, { location: "Shop" })
          )
        );
      }
      setCustomLocations((prev) => prev.filter((location) => location !== trimmed));
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`${trimmed} removed. ${affectedItems.length} item(s) moved to Shop.`);
      if (locationFilter === trimmed) {
        setLocationFilter("Shop");
      }
    } catch {
      toast.error("Failed to remove location.");
    }
  };

  const handleTransferSystem = async (itemIds: string[], location: string) => {
    if (!itemIds.length || !location) return;
    try {
      await Promise.all(
        itemIds.map((id) =>
          api.equipment.update(id, { location })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`Transferred ${itemIds.length} item(s) to ${location}.`);
      setIsTransferOpen(false);
    } catch {
      toast.error("Failed to transfer system.");
    }
  };

  const handleStageSystem = async (params: {
    systemColor: string;
    stagingLocation: string;
    stagedBy: string;
    valveNumber?: string;
    notes?: string;
    missingItems: StagedSystemMissingItem[];
    targetDate?: string;
  }) => {
    try {
      await saveStagedSystem.mutateAsync({
        systemColor: params.systemColor,
        data: {
          systemColor: params.systemColor,
          stagingLocation: params.stagingLocation,
          stagedBy: params.stagedBy,
          valveNumber: params.valveNumber,
          notes: params.notes,
          missingItems: params.missingItems,
          targetDate: params.targetDate ? new Date(params.targetDate) : undefined,
          sourceWorkOrder: null,
        },
      });
      toast.success(`${params.systemColor} system staged.`);
      setIsStageOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stage system.");
    }
  };

  const handleClearStaging = async (systemColor: string) => {
    try {
      await clearStagedSystem.mutateAsync(systemColor);
      toast.success(`${systemColor} staging cleared.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear staging.");
    }
  };

  const handleCleanupStaleCheckoutNotes = async () => {
    try {
      const result = await api.equipment.cleanupStaleCheckoutNotes();
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["staged-systems"] });
      toast.success(
        result.updatedCount > 0
          ? `Cleaned up ${result.updatedCount} stale checkout note${result.updatedCount === 1 ? "" : "s"}.`
          : "No stale checkout notes found."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clean stale checkout notes.");
    }
  };

  const handleSaveSystemTemplate = async (
    systemColor: string,
    requirements: SystemRequirement[],
    assignedItemIds: string[]
  ) => {
    try {
      await saveSystemConfig.mutateAsync({
        systemColor,
        data: {
          systemColor,
          displayName: `${systemColor} System`,
          requirements,
        },
      });

      const currentAssignedIds = equipment
        .filter(
          (item) =>
            item.category !== "Computer" &&
            item.systemColor === systemColor &&
            item.status === "available" &&
            !isRepairLocation(item.location)
        )
        .map((item) => item.id);

      const nextAssignedSet = new Set(assignedItemIds);
      const idsToRemove = currentAssignedIds.filter((id) => !nextAssignedSet.has(id));
      const idsToAdd = assignedItemIds.filter((id) => !currentAssignedIds.includes(id));

      await Promise.all([
        ...idsToRemove.map((id) =>
          updateEquipment.mutateAsync({
            id,
            data: {
              systemColor: null,
              originalSystemColor: null,
            },
          })
        ),
        ...idsToAdd.map((id) =>
          updateEquipment.mutateAsync({
            id,
            data: {
              systemColor,
              originalSystemColor: systemColor,
              temporarySystemColor: null,
              swappedFromId: null,
            },
          })
        ),
      ]);

      toast.success(`${systemColor} template saved.`);
      setTemplateColor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save system template.");
    }
  };

  const stageableSystems = systemStatuses.map((system) => ({
    color: system.color,
    summary: system.completeness,
    missingLabels: system.missingRequirements.map(
      (requirement) => `${requirement.missing} x ${requirement.variant} ${requirement.category}`
    ),
  }));

  const systemsAtLocation = systemLocationSummary.filter(
    (system) => system.location === locationFilter
  );

  const isBagItemAvailable = (item: Equipment) =>
    item.status === "available" &&
    !isRepairLocation(item.location) &&
    !item.temporarySystemColor;

  const getBagItemStatus = (item: Equipment) => {
    const repairLabel = getRepairLocationLabel(item.location);
    if (repairLabel) return repairLabel;
    if (item.status === "broken") return "Broken";
    if (item.status === "checked_out") return "Checked out";
    if (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor) return `Temporarily assigned to ${item.temporarySystemColor}`;
    if ((item.location ?? "Shop") !== "Shop") return item.location ?? "Shop";
    return "Missing";
  };

  const bagPreviewItems = bagPreviewColor !== "none"
    ? sortEquipmentById(equipment).filter(
        (item) => item.category !== "Computer" && item.systemColor === bagPreviewColor
      )
    : [];

  const inventorySource = canManageEquipment ? filteredEquipment : equipment;
  const inventoryFiltered = inventorySource.filter((item) => {
    if (inventoryColorFilter === "All") return true;
    if (inventoryColorFilter === "Needs Cal") {
      const status = getDueDateStatus(item.dueDate);
      return status === "yellow" || status === "red";
    }
    const effectiveColor = item.temporarySystemColor || item.systemColor || "Unassigned";
    return effectiveColor === inventoryColorFilter;
  });
  const inventoryGrouped = Object.entries(
    sortEquipmentById(inventoryFiltered).reduce((acc, item) => {
      const key = item.temporarySystemColor || item.systemColor || "Unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, Equipment[]>)
  ).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = (ids: string[]) => {
    setSelectedIds(ids);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkApply = async (changes: { location?: string; systemColor?: string; status?: string }) => {
    if (!selectedIds.length) return;
    const payload = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined && value !== "")
    );
    if (Object.keys(payload).length === 0) {
      toast.error("Choose at least one field to update.");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) =>
          api.equipment.update(id, payload)
        )
      );
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`Updated ${selectedIds.length} item(s).`);
      clearSelection();
    } catch {
      toast.error("Bulk update failed.");
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    const confirmed = window.confirm(`Delete ${selectedIds.length} item(s)? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await Promise.all(selectedIds.map((id) => api.equipment.delete(id)));
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`Deleted ${selectedIds.length} item(s).`);
      clearSelection();
    } catch {
      toast.error("Bulk delete failed.");
    }
  };

  const handleSendToRepairs = (item: Equipment) => {
    updateEquipment.mutate(
      {
        id: item.id,
        data: {
          location: "Sent for Repairs",
        },
      },
      {
        onSuccess: () => {
          toast.success(`${item.id} sent for repairs.`);
        },
        onError: (error) => {
          toast.error(`Failed to update ${item.id}: ${error.message}`);
        },
      }
    );
  };

  const handleAssignReplacement = async (
    brokenItem: Equipment,
    replacementItem: Equipment,
    context: "broken" | "checked_out",
    reason: string
  ) => {
    try {
      await api.equipment.swap({
        brokenId: brokenItem.id,
        replacementId: replacementItem.id,
        context,
        reason,
      });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`${replacementItem.id} swapped into ${brokenItem.systemColor} system.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to swap equipment";
      toast.error(message);
    }
  };

  const handleBulkReturnFromRepairs = async (itemIds: string[], dueDate?: Date | null) => {
    if (!itemIds.length) return;
    try {
      await Promise.all(
        itemIds.map(async (id) => {
          const item = equipment.find((entry) => entry.id === id);
          if (!item) return;
          const payload: Partial<InsertEquipment> = {
            status: "available",
            location: "Shop",
            workOrder: null,
            checkedOutBy: null,
            checkedOutAt: null,
            replacementId: null,
          };
          if (typeof dueDate !== "undefined") {
            payload.dueDate = dueDate;
          }
          await api.equipment.update(id, payload);
          if (item.replacementId) {
            await api.equipment.update(item.replacementId, {
              temporarySystemColor: null,
              swappedFromId: null,
              status: "available",
              workOrder: null,
              checkedOutBy: null,
              checkedOutAt: null,
            });
          }
        })
      );
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`Returned ${itemIds.length} item(s) to Shop.`);
    } catch {
      toast.error("Failed to return items.");
    }
  };

  const handleApplyDueDates = async (category: string, amount: number, unit: "months" | "years") => {
    const repairItemsForCategory = equipment.filter(
      (item) => item.category === category && isRepairLocation(item.location)
    );
    if (repairItemsForCategory.length === 0) {
      toast.error("No repair items found for that category.");
      return;
    }
    const monthsToAdd = unit === "years" ? amount * 12 : amount;
    const newDueDate = addMonths(new Date(), monthsToAdd);
    try {
      await Promise.all(
        repairItemsForCategory.map((item) =>
          api.equipment.update(item.id, { dueDate: newDueDate })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`Applied due dates to ${repairItemsForCategory.length} item(s).`);
    } catch {
      toast.error("Failed to apply due dates.");
    }
  };

  const handleExportCsv = () => {
    const headers = [
      "id",
      "name",
      "category",
      "variant",
      "systemColor",
      "location",
      "Due Date",
      "status",
      "workOrder",
      "checkedOutBy",
      "checkedOutAt",
      "notes",
    ];
    const rows = equipment.map((item) => [
      item.id,
      item.name,
      item.category,
      item.variant ?? "",
      item.systemColor ?? "",
      item.location ?? "Shop",
      formatDueDateValue(item.dueDate),
      item.status,
      item.workOrder ?? "",
      item.checkedOutBy ?? "",
      item.checkedOutAt ? format(new Date(item.checkedOutAt), "MM/dd/yyyy") : "",
      item.notes ?? "",
    ]);
    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map((value) => csvEscape(String(value))).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const nowLabel = format(new Date(), "yyyyMMdd-HHmm");
    const filename = `plantpouch-export-${nowLabel}.csv`;
    const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${equipment.length} item(s) to ${filename}.`);
};

  const handleReturnBorrowed = async (borrowedItem: Equipment) => {
    try {
      await api.equipment.resolveSwap({
        borrowedId: borrowedItem.id,
        action: "return_home",
      });
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["staged-systems"] });
      toast.success(`${borrowedItem.id} returned to its original system.`);
    } catch {
      toast.error("Failed to clear temporary assignment.");
    }
  };

  const handleResolveBorrowed = async (params: {
    borrowedId: string;
    action: "return_home" | "assign_permanent" | "move_to_spares" | "set_custom_location";
    destinationLocation?: string;
  }) => {
    try {
      await api.equipment.resolveSwap(params);
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      queryClient.invalidateQueries({ queryKey: ["staged-systems"] });
      setBorrowedToResolve(null);
      toast.success("Temporary assignment updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve temporary assignment.");
    }
  };

  const handleResetBranding = () => {
    setBrandingState(branding);
  };

  useEffect(() => {
    if (isBulkEditOpen && selectedIds.length === 0) {
      setIsBulkEditOpen(false);
    }
  }, [isBulkEditOpen, selectedIds.length]);
  
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded flex items-center justify-center text-xl overflow-hidden",
                    brandingState.logo.imageSrc
                      ? "bg-transparent shadow-none"
                      : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  )}
                  aria-label={`${brandingState.appName} logo`}
                >
                  {brandingState.logo.imageSrc ? (
                    <img
                      src={brandingState.logo.imageSrc}
                      alt={brandingState.logo.alt ?? `${brandingState.appName} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-bold">{brandingState.logo.text ?? "PP"}</span>
                  )}
                </div>
                <div>
                  <h1 className="font-bold leading-none tracking-tight">{brandingState.appName}</h1>
                  <span className="text-xs text-muted-foreground font-mono">v{brandingState.version}</span>
                </div>
            </div>
            
            <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setIsActivityOpen(true)}
                  data-testid="button-activity-log"
                >
                  <History className="w-5 h-5" />
                </Button>
                {canManageEquipment && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                    onClick={() => setIsImportModalOpen(true)}
                    data-testid="button-csv-import"
                  >
                    <Upload className="w-5 h-5" />
                  </Button>
                )}
                {adminEnabled && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={handleExportCsv}
                    data-testid="button-export-csv"
                  >
                    <Download className="w-5 h-5" />
                  </Button>
                )}
                {canManageEquipment && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                    onClick={() => setIsBrandingOpen(true)}
                    data-testid="button-branding"
                  >
                    <Image className="w-5 h-5" />
                  </Button>
                )}
                {canManageEquipment && (
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => setIsAddModalOpen(true)} data-testid="button-add-equipment">
                     <Plus className="w-5 h-5" />
                  </Button>
                )}
                {adminEnabled && (
                  <Button 
                    variant={isAdminMode ? "default" : "outline"}
                    size="icon" 
                    className={cn("shrink-0", isAdminMode && "bg-amber-500 hover:bg-amber-600")}
                    onClick={() => setIsAdminMode(!isAdminMode)}
                    data-testid="button-toggle-admin"
                  >
                     <Settings className="w-5 h-5" />
                  </Button>
                )}
            </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-3 text-center shadow-sm">
                <span className="block text-3xl font-bold font-mono text-blue-500">{stats.out}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Active</span>
            </div>
            <div className="bg-card border border-border rounded-lg p-3 text-center shadow-sm">
                <span className="block text-3xl font-bold font-mono text-destructive">{stats.broken}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Repairs</span>
            </div>
             <div className="bg-card border border-border rounded-lg p-3 text-center shadow-sm">
                <span className="block text-3xl font-bold font-mono">{stats.total}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</span>
            </div>
        </div>

        {canManageEquipment && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Locations</h2>
                <p className="text-xs text-muted-foreground">Manage staging areas for systems</p>
              </div>
              <Button size="sm" onClick={() => setIsTransferOpen(true)}>
                Transfer Location
              </Button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <Label className="text-xs uppercase text-muted-foreground">Systems at location</Label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locationOptions.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                {systemsAtLocation.length === 0 ? (
                  <div className="text-xs text-muted-foreground pt-6">No systems assigned.</div>
                ) : (
                  <div className="pt-6 space-y-1 text-xs">
                    {systemsAtLocation.map((system) => (
                      <div key={system.color} className="font-medium">
                        {system.color} System
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {locationOptions.map((location) => {
                const count = equipment.filter(
                  (item) => (item.location ?? "Shop") === location
                ).length;
                const systemCount = new Set(
                  equipment
                    .filter((item) => (item.location ?? "Shop") === location)
                    .map((item) => item.systemColor)
                    .filter(Boolean)
                ).size;
                const isCustom = customLocations.includes(location);
                return (
                  <div key={location} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-semibold">{location}</span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>
                        {systemCount} systems • {count} items
                      </span>
                      {isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleRemoveLocation(location)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Checked Out</h2>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Live</span>
            </div>

            {checkedOutGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground">No active checkouts.</div>
            ) : (
              <div className="space-y-2">
                {checkedOutGroups.map((group) => {
                  const sample = group.items[0];
                  const valveSuffix = group.valveNumber ? ` (Valve # ${group.valveNumber})` : "";
                  const label = group.systemColor
                    ? `${group.systemColor} system checked out by ${group.tech} at WO ${group.workOrder}${valveSuffix}`
                    : `${sample?.id} checked out by ${group.tech} at WO ${group.workOrder}${valveSuffix}`;
                  const latestCheckedOutAt = group.items.reduce<number | null>((latest, item) => {
                    if (!item.checkedOutAt) return latest;
                    const timestamp = new Date(item.checkedOutAt).getTime();
                    if (Number.isNaN(timestamp)) return latest;
                    return latest === null || timestamp > latest ? timestamp : latest;
                  }, null);
                  const time = latestCheckedOutAt
                    ? format(new Date(latestCheckedOutAt), "HH:mm dd/MM")
                    : "-";

                  const checkedKey = `checked-${group.key}`;
                  const isExpanded = expandedPanels[checkedKey] ?? false;
                  return (
                    <div key={group.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <div className="text-sm font-medium">{label}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {group.items.length > 1 && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {group.items.length} items
                          </Badge>
                        )}
                        <span>{time}</span>
                        {group.systemColor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setStageInitialColor(group.systemColor);
                              setIsStageOpen(true);
                            }}
                          >
                            Stage
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExpandedPanels((prev) => ({
                              ...prev,
                              [checkedKey]: !isExpanded,
                            }));
                          }}
                        >
                          {isExpanded ? "Hide" : "View"}
                        </Button>
                      </div>
                      {isExpanded && (
                        <div className="w-full mt-2 space-y-2">
                          {group.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2 py-1 text-xs">
                              <span className="font-mono">{item.id}</span>
                              <span className="flex-1 text-muted-foreground truncate">{item.name}</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => {
                                  setSwapTarget(item);
                                  setSwapContext("checked_out");
                                  setIsSwapOpen(true);
                                }}
                              >
                                Swap
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <Tabs defaultValue="good">
            <TabsList className="flex w-full flex-nowrap gap-2 overflow-x-auto py-1">
              <TabsTrigger value="good">Ready ({availableSystemItems.length})</TabsTrigger>
              <TabsTrigger value="staged">Staged ({stagedSystemItems.length})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({repairSystems.length})</TabsTrigger>
              <TabsTrigger value="waiting">Waiting ({waitingSystems.length})</TabsTrigger>
              <TabsTrigger value="borrowed">
                Borrowed Components ({equipment.filter((item) => item.swappedFromId || (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor)).length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="good" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Ready Systems</div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManageEquipment && (
                    <Button variant="outline" size="sm" onClick={handleCleanupStaleCheckoutNotes}>
                      Clean Up Notes
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStageInitialColor(null);
                      setIsStageOpen(true);
                    }}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Stage System
                  </Button>
                </div>
              </div>
              {availableSystemItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No systems ready right now.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {availableSystemItems.map((group) => (
                    <Card key={group.color} className="border-border/60">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between text-base">
                          <span>{group.color} System</span>
                          <Badge variant={group.missingRequirements.length === 0 ? "default" : "secondary"}>
                            {group.completeness}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {group.effectiveAvailableCount}/{group.expectedCount} required components available
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1 text-xs">
                          {group.requirements.map((requirement) => (
                            <div key={requirement.id} className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-2 py-1">
                              <span>{requirement.category} · {requirement.variant}</span>
                              <span>x{requirement.quantity}</span>
                            </div>
                          ))}
                        </div>
                        {group.missingRequirements.length > 0 && (
                          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                            Missing: {group.missingRequirements.map((requirement) => `${requirement.missing} x ${requirement.variant} ${requirement.category}`).join(", ")}
                          </div>
                        )}
                        <div className="space-y-1">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setSelectedEquipmentId(item.id)}
                              className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs text-left hover:border-primary/40"
                            >
                              <span className="font-mono">{item.id}</span>
                              <span className="flex-1 truncate px-3 text-muted-foreground">{item.name}</span>
                              <span>{getVariantLabel(item.variant)}</span>
                            </button>
                          ))}
                        </div>
                        {canManageEquipment && (
                          <Button variant="outline" size="sm" onClick={() => setTemplateColor(group.color)}>
                            Edit Template
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="staged" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Upcoming Work</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStageInitialColor(null);
                    setIsStageOpen(true);
                  }}
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Stage System
                </Button>
              </div>
              {stagedSystemItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No staged systems.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {stagedSystemItems.map((group) => {
                    const staged = group.staged as StagedSystem;
                    return (
                      <Card key={group.color} className="border-border/60">
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center justify-between text-base">
                            <span>{group.color} System</span>
                            <Badge variant="secondary">Staged</Badge>
                          </CardTitle>
                          <CardDescription>
                            {staged.stagedBy} staged {group.color} at {staged.stagingLocation}
                            {staged.valveNumber ? ` for ${staged.valveNumber}` : ""}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                          {staged.notes && (
                            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                              {staged.notes}
                            </div>
                          )}
                          {staged.missingItems.length > 0 && (
                            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                              Needs: {staged.missingItems.map((item) => item.variant ? `${item.category} (${item.variant})` : item.category).join(", ")}
                            </div>
                          )}
                          <div className="space-y-1">
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedEquipmentId(item.id)}
                                className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-left hover:border-primary/40"
                              >
                                <span className="font-mono">{item.id}</span>
                                <span className="flex-1 truncate px-3 text-muted-foreground">{item.name}</span>
                                <span>{getVariantLabel(item.variant)}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                setCheckoutPreset({
                                  systemColor: group.color,
                                  valveNumber: staged.valveNumber ?? undefined,
                                });
                                setIsSystemCheckoutOpen(true);
                              }}
                            >
                              <PackageCheck className="mr-2 h-4 w-4" />
                              Check Out
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleClearStaging(group.color)}>
                              Return to Pool
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="sent" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Sent for Repairs</div>
                {canManageEquipment && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsReturnsOpen(true)}
                    disabled={repairItems.length === 0}
                  >
                    Returns
                  </Button>
                )}
              </div>
              {repairSystems.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nothing sent for repairs.</div>
              ) : (
                <div className="space-y-1">
                  {repairSystems.map((system) => (
                    <div key={system.color} className="text-xs font-medium">
                      {system.color} System ({system.items.length})
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                {repairItems.map((group) => (
                  <div key={group.color} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">{group.color} System</div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedEquipmentId(item.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs text-left hover:border-primary/40 hover:bg-muted/30"
                      >
                        <span className="font-mono">{item.id}</span>
                        <span className="flex-1 text-xs text-muted-foreground truncate">{item.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="waiting" className="mt-4 space-y-3">
              <div className="text-sm font-semibold">Waiting on Repairs</div>
              {waitingSystems.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nothing waiting on repairs.</div>
              ) : (
                <div className="space-y-1">
                  {waitingSystems.map((system) => (
                    <div key={system.color} className="text-xs font-medium">
                      {system.color} System ({system.items.length})
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                {waitingItems.map((group) => (
                  <div key={group.color} className="space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">{group.color} System</div>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedEquipmentId(item.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs text-left hover:border-primary/40 hover:bg-muted/30"
                      >
                        <span className="font-mono">{item.id}</span>
                        <span className="flex-1 text-xs text-muted-foreground truncate">{item.name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="borrowed" className="mt-4 space-y-2">
              <div className="text-sm font-semibold">Borrowed components to return</div>
              <div className="text-xs text-muted-foreground">
                Items borrowed during checkout stay here after check-in until they are resolved back to their home bag/location.
              </div>
              {equipment.filter((item) => item.swappedFromId || (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor)).length === 0 ? (
                <div className="text-xs text-muted-foreground">No temporary assignments.</div>
              ) : (
                <div className="space-y-1">
                  {equipment
                    .filter((item) => item.swappedFromId || (item.temporarySystemColor && item.temporarySystemColor !== item.systemColor))
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-xs font-medium">
                        <span>
                          {item.id} temporarily assigned to {item.temporarySystemColor || "system"} from {item.originalSystemColor || item.systemColor || "Unassigned"}
                        </span>
                        {canManageEquipment && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => setBorrowedToResolve(item)}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Action Button */}
        <div className="grid grid-cols-2 gap-4">
          <button 
              onClick={() => {
                setCheckoutPreset(null);
                setIsSystemCheckoutOpen(true);
              }}
              className="py-6 rounded-xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.99] transition-all flex flex-col items-center justify-center gap-2"
          >
              <Box className="w-8 h-8" />
              SYSTEM CHECKOUT
          </button>
          <button 
              onClick={() => setIsSystemCheckInOpen(true)}
              className="py-6 rounded-xl bg-secondary text-secondary-foreground font-bold text-lg shadow-sm hover:brightness-110 active:scale-[0.99] transition-all flex flex-col items-center justify-center gap-2"
          >
              <ClipboardCheck className="w-8 h-8" />
              SYSTEM CHECK IN
          </button>
        </div>
        {/* Equipment List */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Inventory</h2>
                    <p className="text-xs text-muted-foreground">
                      {inventoryFiltered.length} of {inventorySource.length} items shown
                    </p>
                  </div>
                  {canManageEquipment && selectedIds.length > 0 && (
                    <Badge variant="outline" className="w-fit text-xs">
                      {selectedIds.length} selected
                    </Badge>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_180px]">
                    {canManageEquipment && (
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Search equipment ID, name, category..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                    )}
                    <Select value={inventoryColorFilter} onValueChange={setInventoryColorFilter}>
                      <SelectTrigger className="w-full text-xs overflow-hidden">
                        <SelectValue placeholder="Filter by system" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Systems</SelectItem>
                        <SelectItem value="Needs Cal">Needs Cal</SelectItem>
                        {systemColorOptions.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color} System
                          </SelectItem>
                        ))}
                        <SelectItem value="Unassigned">Unassigned</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bagPreviewColor} onValueChange={setBagPreviewColor}>
                      <SelectTrigger className="w-full text-xs overflow-hidden">
                        <SelectValue placeholder="Color bags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No bag selected</SelectItem>
                        {bagColorOptions.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color} Bag
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  {canManageEquipment && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={() => selectAllFiltered(inventoryFiltered.map((item) => item.id))}
                        disabled={inventoryFiltered.length === 0}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={clearSelection}
                        disabled={selectedIds.length === 0}
                      >
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={() => setIsBulkEditOpen(true)}
                        disabled={selectedIds.length === 0}
                      >
                        Bulk Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={() => setIsDueDatesOpen(true)}
                      >
                        Due Dates
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 text-xs sm:flex-none"
                        onClick={handleExportCsv}
                      >
                        Export CSV
                      </Button>
                    </>
                  )}
                  </div>
                </div>
            </div>

            {bagPreviewColor !== "none" && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{bagPreviewColor} Bag Contents</span>
                  <span className="text-muted-foreground">{bagPreviewItems.length} items</span>
                </div>
                {bagPreviewItems.length === 0 ? (
                  <div className="text-muted-foreground">No items found for this bag.</div>
                ) : (
                  <div className="grid gap-2">
                    {bagPreviewItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2">
                        <span className="font-mono">{item.id}</span>
                        <span className="flex-1 text-muted-foreground truncate">{item.name}</span>
                        <span className={cn("text-[10px] uppercase", isBagItemAvailable(item) ? "text-emerald-500" : "text-amber-600")}>
                          {isBagItemAvailable(item) ? "Available" : getBagItemStatus(item)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-6">
              {inventoryGrouped.length === 0 ? (
                <div className="text-sm text-muted-foreground">No inventory to show.</div>
              ) : (
                inventoryGrouped.map(([color, items]) => (
                  <div key={color} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{color} System</h3>
                      <span className="text-xs text-muted-foreground">{items.length} items</span>
                    </div>
                    <div className="grid gap-3">
                      {items.map((item) => (
                        <EquipmentListItem 
                          key={item.id} 
                          item={item} 
                          onClick={() => setSelectedEquipmentId(item.id)} 
                          selectable={canManageEquipment}
                          selected={selectedIds.includes(item.id)}
                          onToggleSelect={toggleSelect}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {canManageEquipment && isAddModalOpen && (
          <AddEquipmentModal 
            isOpen={isAddModalOpen} 
            onClose={() => setIsAddModalOpen(false)}
            locationOptions={locationOptions}
            systemColorOptions={systemColorOptions}
            onAddLocation={handleAddLocation}
          />
        )}
        {canManageEquipment && isImportModalOpen && (
          <AdminImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
          />
        )}
        {canManageEquipment && isBrandingOpen && (
          <BrandingModal
            isOpen={isBrandingOpen}
            onClose={() => setIsBrandingOpen(false)}
            value={brandingState}
            onChange={(next) => {
              brandingDirtyRef.current = true;
              setBrandingState(next);
            }}
            onReset={handleResetBranding}
          />
        )}
        {isSystemCheckoutOpen && (
          <SystemCheckoutModal
            isOpen={isSystemCheckoutOpen}
            onClose={() => {
              setIsSystemCheckoutOpen(false);
              setCheckoutPreset(null);
            }}
            initialSystemColor={checkoutPreset?.systemColor}
            initialValveNumber={checkoutPreset?.valveNumber}
          />
        )}
        {isSystemCheckInOpen && (
          <SystemCheckInModal
            isOpen={isSystemCheckInOpen}
            onClose={() => setIsSystemCheckInOpen(false)}
          />
        )}
        {isTransferOpen && (
          <TransferSystemModal
            isOpen={isTransferOpen}
            onClose={() => setIsTransferOpen(false)}
            equipment={equipment}
            computerColors={computerColorOptions}
            bagColors={bagColorOptions}
            locationOptions={locationOptions}
            onAddLocation={handleAddLocation}
            onTransfer={handleTransferSystem}
          />
        )}
        {isStageOpen && (
          <StageSystemModal
            isOpen={isStageOpen}
            onClose={() => {
              setIsStageOpen(false);
              setStageInitialColor(null);
            }}
            systems={stageableSystems}
            initialSystemColor={stageInitialColor}
            onStage={handleStageSystem}
          />
        )}
        {templateColor && (
          <SystemConfigModal
            isOpen={!!templateColor}
            onClose={() => setTemplateColor(null)}
            systemColor={templateColor}
            initialRequirements={
              systemConfigMap.get(templateColor)?.requirements.length
                ? systemConfigMap.get(templateColor)!.requirements
                : inferRequirementsFromItems(
                    equipment.filter(
                      (item) => item.category !== "Computer" && item.systemColor === templateColor
                    )
                  )
            }
            equipment={equipment}
            initialAssignedItemIds={
              equipment
                .filter(
                  (item) =>
                    item.category !== "Computer" &&
                    item.systemColor === templateColor &&
                    item.status === "available" &&
                    !item.temporarySystemColor &&
                    !isRepairLocation(item.location)
                )
                .map((item) => item.id)
            }
            onSave={(requirements, assignedItemIds) =>
              handleSaveSystemTemplate(templateColor, requirements, assignedItemIds)
            }
          />
        )}
        {isReturnsOpen && (
          <ReturnsModal
            isOpen={isReturnsOpen}
            onClose={() => setIsReturnsOpen(false)}
            items={equipment}
            onReturn={handleBulkReturnFromRepairs}
          />
        )}
        {isDueDatesOpen && (
          <DueDatesModal
            isOpen={isDueDatesOpen}
            onClose={() => setIsDueDatesOpen(false)}
            categories={categoryOptions}
            onApply={handleApplyDueDates}
          />
        )}
        {isActivityOpen && (
          <ActivityLogModal
            isOpen={isActivityOpen}
            onClose={() => setIsActivityOpen(false)}
            isLoading={isHistoryLoading}
            entries={recentHistory}
          />
        )}
        {isBulkEditOpen && (
          <BulkEditModal
            isOpen={isBulkEditOpen}
            onClose={() => setIsBulkEditOpen(false)}
            locationOptions={locationOptions}
            systemColorOptions={systemColorOptions}
            selectedCount={selectedIds.length}
            onApply={handleBulkApply}
            onDelete={handleBulkDelete}
          />
        )}
        {isSwapOpen && (
          <SwapModal
            isOpen={isSwapOpen}
            onClose={() => setIsSwapOpen(false)}
            brokenItem={swapTarget}
            replacementOptions={swapCandidates}
            onConfirm={(replacement, reason) => {
              if (!swapTarget) return;
              handleAssignReplacement(swapTarget, replacement, swapContext, reason);
              setIsSwapOpen(false);
            }}
          />
        )}
        {borrowedToResolve && (
          <ResolveBorrowedModal
            isOpen={!!borrowedToResolve}
            onClose={() => setBorrowedToResolve(null)}
            borrowedItem={borrowedToResolve}
            onResolve={handleResolveBorrowed}
          />
        )}
        {selectedEquipmentId && (
            <ActionModal 
                equipment={selectedEquipment || null} 
                isOpen={!!selectedEquipmentId} 
                onClose={() => setSelectedEquipmentId(null)}
                canManageEquipment={canManageEquipment}
                allEquipment={equipment}
                locationOptions={locationOptions}
                systemColorOptions={systemColorOptions}
                onAddLocation={handleAddLocation}
                onAssignReplacement={handleAssignReplacement}
                replacementCandidates={selectedEquipment ? getReplacementCandidates(selectedEquipment) : []}
                onIdUpdated={(newId) => setSelectedEquipmentId(newId)}
                onReturnBorrowed={handleReturnBorrowed}
            />
        )}
      </AnimatePresence>
    </div>
  );
}
