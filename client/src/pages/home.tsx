import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Equipment, InsertEquipment } from "@shared/schema";
import {
  useEquipment,
  useCreateEquipment,
  useCheckoutSystem,
  useCheckinByWorkOrder,
  useCheckout,
  useCheckin,
  useUpdateEquipment,
  useDeleteEquipment,
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
  QrCode, 
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
  ScanBarcode,
  Settings,
  Image,
  Upload,
  Check
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { branding } from "@/config/branding";
import { brandingStorageKey, loadBrandingFromStorage, type BrandingState } from "@/lib/branding";
import type { IScannerControls } from "@zxing/browser";

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
          </div>
          <h3 className={cn("font-semibold text-lg transition-colors", isBroken ? "text-destructive" : "text-foreground group-hover:text-primary")}>
            {item.name}
          </h3>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>{item.category}</span>
            <span className="text-xs font-mono">{item.id}</span>
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

function ScannerView({ onScan, onClose }: { onScan: (id: string) => void; onClose: () => void }) {
  const [manualId, setManualId] = useState("");
  const { data: equipment = [] } = useEquipment();
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const barcodeDetectorCtor = (window as Window & {
    BarcodeDetector?: new (options: { formats: string[] }) => {
      detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;

  const stopScanner = () => {
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  };

  const handleSimulatedScan = () => {
    // Pick a random equipment ID for demo purposes if empty, or try to match input
    const targetId = manualId || (equipment.length > 0 ? equipment[Math.floor(Math.random() * equipment.length)].id : "");
    if (targetId) onScan(targetId);
  };

  useEffect(() => {
    return () => stopScanner();
  }, []);

  const parseScanValue = (value: string) => {
    try {
      const parsed = JSON.parse(value) as { id?: string };
      if (parsed?.id) {
        return parsed.id;
      }
    } catch {
      // Not JSON, fall back to raw string
    }
    return value;
  };

  const startScanner = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("Camera access isn't available in this browser. Use manual entry below.");
      return;
    }
    if (!window.isSecureContext) {
      setScanError("Camera access requires HTTPS or localhost. Use a secure URL or manual entry.");
      return;
    }
    if (!videoRef.current) {
      setScanError("Camera preview isn't ready. Please try again.");
      return;
    }

    stopScanner();
    setIsStarting(true);
    setScanError(null);

    try {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const codeReader = new BrowserMultiFormatReader();
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result: { getText: () => string } | undefined, error: unknown) => {
            if (result) {
              stopScanner();
              onScan(parseScanValue(result.getText()));
              return;
            }
            if (error instanceof Error && error.name !== "NotFoundException") {
              setScanError("Unable to read a QR code. Try better lighting or manual entry.");
            }
          },
        );
        zxingControlsRef.current = controls;
        setIsScanning(true);
        return;
      } catch {
        // Fall back to BarcodeDetector if ZXing isn't available.
      }

      if (!barcodeDetectorCtor) {
        setScanError("QR scanning isn't supported in this browser. Use manual entry below.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new barcodeDetectorCtor({ formats: ["qr_code"] });
      setIsScanning(true);

      const scanFrame = async () => {
        if (!videoRef.current) return;

        try {
          const barcodes = await detector.detect(videoRef.current);
          const result = barcodes[0]?.rawValue?.trim();
          if (result) {
            stopScanner();
            onScan(parseScanValue(result));
            return;
          }
        } catch {
          setScanError("Unable to read a QR code. Try better lighting or manual entry.");
        }

        animationFrameRef.current = requestAnimationFrame(scanFrame);
      };

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setScanError("Camera access was blocked. Enable permissions or use manual entry.");
      stopScanner();
    } finally {
      setIsStarting(false);
    }
  };

  const handleManualScan = () => {
    const targetId = manualId.trim();
    if (!targetId) {
      setScanError("Enter an equipment ID before identifying.");
      return;
    }
    onScan(targetId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Scan Equipment QR</CardTitle>
          <CardDescription>Align the QR code within the frame</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div
            className="relative aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/30 flex items-center justify-center"
            onClick={handleSimulatedScan}
          >
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
            />
            <div className="absolute inset-0 border-[40px] border-black/50 z-10 pointer-events-none"></div>
            <div className="w-64 h-64 border-2 border-primary animate-pulse z-20 relative pointer-events-none">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary -mt-1 -ml-1"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary -mt-1 -mr-1"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary -mb-1 -ml-1"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary -mb-1 -mr-1"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-80 pointer-events-none">
              <span className="text-muted-foreground text-xs text-center px-4">
                {scanError ? scanError : (isScanning ? "Point the camera at a QR code to scan." : "Camera is off. Tap start below.")}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center">
              <Button onClick={startScanner} disabled={isStarting || isScanning}>
                {isStarting ? "Starting camera..." : (isScanning ? "Camera active" : "Start camera")}
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or enter manually</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter Equipment ID (e.g. EQ-001)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="font-mono uppercase"
              />
              <Button onClick={handleManualScan}>
                Identify
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EditEquipmentModal({
  equipment,
  isOpen,
  onClose,
  locationOptions,
  systemColorOptions,
  onAddLocation,
}: {
  equipment: Equipment;
  isOpen: boolean;
  onClose: () => void;
  locationOptions: string[];
  systemColorOptions: string[];
  onAddLocation: (value: string) => void;
}) {
  const updateEquipment = useUpdateEquipment();
  const [formData, setFormData] = useState({
    name: equipment.name,
    category: equipment.category,
    systemColor: equipment.systemColor ?? "",
    location: equipment.location ?? "Shop",
  });
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      name: equipment.name,
      category: equipment.category,
      systemColor: equipment.systemColor ?? "",
      location: equipment.location ?? "Shop",
    });
  }, [equipment, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!formData.name || !formData.category) {
      toast.error("Name and category are required.");
      return;
    }
    updateEquipment.mutate(
      {
        id: equipment.id,
        data: {
          name: formData.name,
          category: formData.category,
          systemColor: formData.systemColor || undefined,
          location: formData.location || "Shop",
        },
      },
      {
        onSuccess: () => {
          toast.success(`Updated ${equipment.id}.`);
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
                disabled={!formData.name || !formData.category || updateEquipment.isPending}
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
  locationOptions,
  systemColorOptions,
  onAddLocation,
  onAssignReplacement,
  replacementCandidates,
}: { 
  equipment: Equipment | null; 
  isOpen: boolean; 
  onClose: () => void;
  canManageEquipment: boolean;
  locationOptions: string[];
  systemColorOptions: string[];
  onAddLocation: (value: string) => void;
  onAssignReplacement: (brokenItem: Equipment, replacementItem: Equipment) => void;
  replacementCandidates: Equipment[];
}) {
  const checkout = useCheckout();
  const checkin = useCheckin();
  const deleteEquipment = useDeleteEquipment();
  const [isEditing, setIsEditing] = useState(false);
  
  // Checkout State
  const [workOrder, setWorkOrder] = useState("");
  const [techName, setTechName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("plantpouch-tech-name") ?? ""
  );
  
  // Checkin State
  const [notes, setNotes] = useState("");
  const [isBroken, setIsBroken] = useState(false);
  const [replacementId, setReplacementId] = useState("");

  if (!isOpen || !equipment) return null;

  const qrPayload = JSON.stringify({
    id: equipment.id,
    name: equipment.name,
    category: equipment.category,
    systemColor: equipment.systemColor,
  });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`;
  const isCheckingOut = equipment.status === 'available';
  const isBrokenState = equipment.status === 'broken';

  const handleSubmit = () => {
    if (isCheckingOut) {
      if (!techName.trim()) {
        toast.error("Enter your name before checking out.");
        return;
      }
      checkout.mutate({ id: equipment.id, workOrder, techName: techName.trim() });
    } else {
      checkin.mutate(
        { id: equipment.id, notes, isBroken },
        {
          onSuccess: () => {
            if (isBroken && replacementId) {
              const replacementItem = replacementCandidates.find((item) => item.id === replacementId);
              if (replacementItem) {
                onAssignReplacement(equipment, replacementItem, "broken");
              }
            }
          },
        }
      );
    }
    onClose();
    // Reset state
    setWorkOrder("");
    setTechName("");
    setNotes("");
    setIsBroken(false);
    setReplacementId("");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("plantpouch-tech-name", techName);
  }, [techName]);

  const handleCopyQr = async () => {
    try {
      await navigator.clipboard.writeText(qrPayload);
      toast.success("QR payload copied to clipboard.");
    } catch {
      toast.error("Failed to copy QR payload.");
    }
  };

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

                <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => window.open(qrUrl, "_blank", "noopener,noreferrer")}
                    >
                        <QrCode className="w-4 h-4 mr-2" />
                        Open QR Code
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleCopyQr}>
                        <Download className="w-4 h-4 mr-2" />
                        Copy QR Data
                    </Button>
                </div>

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
          />
        )}
    </div>
  );
}

function SystemCheckoutModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const { data: equipment = [] } = useEquipment();
  const checkoutSystem = useCheckoutSystem();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [workOrder, setWorkOrder] = useState("");
  const [techName, setTechName] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("plantpouch-tech-name") ?? ""
  );
  
  // Track which items are selected/verified for checkout
  // Key: Original Item ID, Value: The ID of the item to actually checkout (could be the same, or a replacement)
  const [verifiedItems, setVerifiedItems] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});

  // Get unique system colors
  const systemColors = Array.from(new Set(equipment.map(e => e.systemColor).filter(Boolean))) as string[];
  const systemLocationSummary = systemColors.map((color) => {
    const items = equipment.filter((item) => item.systemColor === color);
    const uniqueLocations = Array.from(
      new Set(items.map((item) => item.location || "Shop"))
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
  
  // Get items for the selected system
  const systemItems = equipment.filter(
    (e) => (e.temporarySystemColor || e.systemColor) === selectedColor
  );

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    // Initialize verified items with the default system items
    const initialVerified: Record<string, string> = {};
    equipment.filter(e => (e.temporarySystemColor || e.systemColor) === color).forEach(e => {
      initialVerified[e.id] = e.id;
    });
    setVerifiedItems(initialVerified);
    setStep(2);
  };

  const handleSwap = (originalId: string, newItemId: string) => {
    setVerifiedItems(prev => ({
      ...prev,
      [originalId]: newItemId
    }));
  };

  const handleSubmit = () => {
    if (!workOrder || !techName.trim()) return;
    
    // Collect all final IDs to checkout
    const finalIds = Object.values(verifiedItems);
    
    checkoutSystem.mutate({ systemColor: selectedColor, equipmentIds: finalIds, workOrder, techName: techName.trim() });
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
              <Label>Select System Color</Label>
              <div className="grid grid-cols-2 gap-3">
                {systemColors.map(color => {
                    // Check if we have items for this color
                    const hasItems = systemColors.includes(color);
                    const hasActiveCheckout = equipment.some(
                      (item) =>
                        (item.temporarySystemColor || item.systemColor) === color &&
                        item.status === "checked_out"
                    );
                    const locationLabel =
                      systemLocationSummary.find((entry) => entry.color === color)?.location ?? "Shop";
                    return (
                        <Button
                            key={color}
                            variant="outline"
                            className={cn(
                                "h-24 text-lg font-semibold border-2 relative overflow-hidden flex flex-col items-start justify-center gap-1",
                                hasItems && !hasActiveCheckout
                                  ? "hover:border-primary hover:bg-primary/5"
                                  : "opacity-50 cursor-not-allowed"
                            )}
                            onClick={() => hasItems && !hasActiveCheckout && handleColorSelect(color)}
                            disabled={!hasItems || hasActiveCheckout}
                        >
                            <div className={cn("absolute inset-y-0 left-0 w-2", colorClassMap[color] ?? "bg-foreground/20")} />
                            <span>{color} System{hasActiveCheckout ? " (Checked Out)" : ""}</span>
                            <span className="text-xs text-muted-foreground">Location: {locationLabel}</span>
                        </Button>
                    );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
               <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">System</span>
                    <div className="font-bold text-lg text-primary">{selectedColor}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>Change</Button>
               </div>

               <div className="space-y-4">
                 <Label>System Verification Checklist</Label>
                 <div className="space-y-3">
                    {systemItems.map(item => {
                        const currentSelectedId = verifiedItems[item.id];
                        const isOriginal = currentSelectedId === item.id && !item.temporarySystemColor;
                        const selectedItem = equipment.find(e => e.id === currentSelectedId);
                        
                        // Find potential replacements (same category, available, not already in this system)
                        const replacements = equipment.filter(e => 
                            e.category === item.category && 
                            e.status === 'available' && 
                            e.id !== item.id &&
                            !e.temporarySystemColor &&
                            (e.location ?? "Shop") === "Shop"
                        );

                        return (
                            <div key={item.id} className="p-4 rounded-lg border border-border bg-card space-y-3">
                                <div className="flex items-start gap-3">
                                    <Checkbox 
                                        checked={true} // Always checked as we are verifying the slot
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <div className="flex justify-between">
                                            <span className="font-medium">{item.category}</span>
                                            <Badge variant={isOriginal ? "outline" : "secondary"} className="font-mono text-[10px]">
                                                {isOriginal ? 'ORIGINAL' : 'REPLACEMENT'}
                                            </Badge>
                                        </div>
                                        
                                        {isOriginal ? (
                                            <div className="text-sm text-muted-foreground">{item.name} <span className="font-mono text-xs opacity-70">({item.id})</span></div>
                                        ) : (
                                            <div className="text-sm text-primary font-medium flex items-center gap-1">
                                                <RefreshCw className="w-3 h-3" />
                                                Swapped: {selectedItem?.name} ({selectedItem?.id})
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Actions Row */}
                                <div className="pl-7 flex flex-wrap gap-2 items-center">
                                    {/* Swap Dropdown */}
                                    <Select 
                                        value={currentSelectedId} 
                                        onValueChange={(val) => handleSwap(item.id, val)}
                                    >
                                        <SelectTrigger className="h-8 w-[200px] text-xs">
                                            <SelectValue placeholder="Select equipment" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={item.id}>
                                                Original: {item.name} ({item.id})
                                            </SelectItem>
                                            {replacements.map(rep => (
                                                <SelectItem key={rep.id} value={rep.id}>
                                                    Available: {rep.name} ({rep.id})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {/* Issue Reporting */}
                                    <Input 
                                        className="h-8 flex-1 text-xs" 
                                        placeholder="Report issue with original..."
                                        value={issues[item.id] || ''}
                                        onChange={(e) => setIssues(prev => ({ ...prev, [item.id]: e.target.value }))}
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
                  <Button 
                    className="w-full h-12 text-lg font-bold" 
                    onClick={handleSubmit}
                    disabled={!workOrder || !techName.trim()}
                  >
                    Check Out System
                  </Button>
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
    systemColor: '',
    location: 'Shop',
    status: 'available'
  });
  const [newLocation, setNewLocation] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!formData.id || !formData.name || !formData.category) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    createEquipment.mutate({
      id: formData.id,
      name: formData.name,
      category: formData.category,
      systemColor: formData.systemColor || undefined,
      originalSystemColor: formData.systemColor || undefined,
      location: formData.location || "Shop",
      status: 'available'
    }, {
      onSuccess: () => {
        toast.success(`Equipment ${formData.id} added successfully`);
        setFormData({ id: '', name: '', category: '', systemColor: '', location: 'Shop', status: 'available' });
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
              <Label>Equipment ID (QR Code) <span className="text-destructive">*</span></Label>
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

function AdminBarcodeScannerModal({ 
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
  const [scannedId, setScannedId] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    systemColor: '',
    location: 'Shop',
  });
  const [addedItems, setAddedItems] = useState<string[]>([]);
  const [step, setStep] = useState<'scan' | 'details'>('scan');
  const [newLocation, setNewLocation] = useState("");

  if (!isOpen) return null;

  const tryParseQrPayload = (payload: string) => {
    try {
      return JSON.parse(payload) as {
        id?: string;
        name?: string;
        category?: string;
        systemColor?: string;
      };
    } catch {
      return null;
    }
  };

  const handleScan = (barcode: string) => {
    const parsed = tryParseQrPayload(barcode);
    if (parsed?.id && parsed?.name && parsed?.category) {
      const parsedId = parsed.id;
      createEquipment.mutate({
        id: parsedId,
        name: parsed.name,
        category: parsed.category,
        systemColor: parsed.systemColor || undefined,
        originalSystemColor: parsed.systemColor || undefined,
        location: formData.location || "Shop",
        status: 'available'
      }, {
        onSuccess: () => {
          toast.success(`Equipment ${parsedId} added successfully`);
          setAddedItems(prev => [...prev, parsedId]);
          setScannedId("");
          setFormData({ name: '', category: '', systemColor: '', location: 'Shop' });
          setManualBarcode("");
          setStep('scan');
        },
        onError: (error) => {
          toast.error(`Failed to add equipment: ${error.message}`);
        }
      });
      return;
    }

    if (parsed?.id) {
      setScannedId(parsed.id);
      setFormData({
        name: parsed.name || '',
        category: parsed.category || '',
        systemColor: parsed.systemColor || '',
        location: formData.location || 'Shop'
      });
      setStep('details');
      return;
    }

    setScannedId(barcode);
    setFormData({ name: '', category: '', systemColor: '' });
    setStep('details');
  };

  const handleSimulatedScan = () => {
    const barcode = manualBarcode || `EQ-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    handleScan(barcode);
  };

  const handleAddEquipment = () => {
    if (!scannedId || !formData.name || !formData.category) return;
    
    createEquipment.mutate({
      id: scannedId,
      name: formData.name,
      category: formData.category,
      systemColor: formData.systemColor || undefined,
      originalSystemColor: formData.systemColor || undefined,
      location: formData.location || "Shop",
      status: 'available'
    });
    
    setAddedItems(prev => [...prev, scannedId]);
    setScannedId("");
    setFormData({ name: '', category: '', systemColor: '', location: 'Shop' });
    setManualBarcode("");
    setStep('scan');
  };

  const handleClose = () => {
    setScannedId("");
    setFormData({ name: '', category: '', systemColor: '', location: 'Shop' });
    setManualBarcode("");
    setAddedItems([]);
    setStep('scan');
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
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <ScanBarcode className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Barcode Import</h2>
                <p className="text-xs text-muted-foreground">Admin - Quick Equipment Add</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} data-testid="button-close-barcode">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {addedItems.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 text-emerald-500 text-sm font-medium mb-2">
                <Check className="w-4 h-4" />
                Added {addedItems.length} item(s)
              </div>
              <div className="flex flex-wrap gap-1">
                {addedItems.map(id => (
                  <Badge key={id} variant="outline" className="text-xs font-mono">
                    {id}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {step === 'scan' && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-amber-500/30 flex items-center justify-center cursor-pointer" onClick={handleSimulatedScan}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-1 bg-amber-500/50 animate-pulse" />
                </div>
                <div className="absolute inset-x-8 top-8 bottom-8 border-2 border-dashed border-amber-500/40 rounded flex items-center justify-center">
                  <ScanBarcode className="w-16 h-16 text-amber-500/30" />
                </div>
                <div className="absolute bottom-4 text-center">
                  <span className="text-amber-500/70 text-xs animate-pulse">Tap to simulate barcode scan</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or enter barcode manually</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Input 
                    placeholder="Enter barcode value..." 
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    className="font-mono uppercase"
                    data-testid="input-manual-barcode"
                  />
                  <Button onClick={handleSimulatedScan} data-testid="button-scan-barcode">
                    Scan
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Scanned Barcode</span>
                <div className="text-2xl font-mono font-bold text-amber-500 mt-1">{scannedId}</div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Equipment Name *</Label>
                  <Input 
                    placeholder="e.g. Fluke 87V Multimeter" 
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-equipment-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Input 
                    placeholder="e.g. Measurement, Analysis, Pressure" 
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    data-testid="input-equipment-category"
                  />
                </div>

                <div className="space-y-2">
                  <Label>System Color (Optional)</Label>
                  <Select 
                    value={formData.systemColor} 
                    onValueChange={(val) => setFormData(prev => ({ ...prev, systemColor: val }))}
                  >
                    <SelectTrigger data-testid="select-system-color">
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
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setStep('scan');
                    setScannedId("");
                    setFormData({ name: '', category: '', systemColor: '', location: 'Shop' });
                  }}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-[2] h-12 text-lg font-semibold"
                  onClick={handleAddEquipment}
                  disabled={!formData.name || !formData.category}
                  data-testid="button-add-and-next"
                >
                  Add & Scan Next
                </Button>
              </div>
            </div>
          )}
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
              <Label>Logo Image URL</Label>
              <Input
                value={value.logo.imageSrc ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    logo: { ...value.logo, imageSrc: e.target.value },
                  })
                }
                placeholder="/logo.png or https://..."
              />
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

  if (!isOpen) return null;

  const resetState = () => {
    setRows([]);
    setFileName("");
    setErrors([]);
    setIsImporting(false);
  };

  const parseCsvRow = (row: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    return values.map((value) => value.replace(/^"|"$/g, ""));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      setErrors(["The file is empty."]);
      setRows([]);
      return;
    }

    const headerValues = parseCsvRow(lines[0]).map((value) => value.toLowerCase());
    const headerMap = headerValues.reduce<Record<string, number>>((acc, value, index) => {
      acc[value] = index;
      return acc;
    }, {});
    const systemColorIndex =
      headerMap.systemcolor ?? headerMap["system_color"] ?? headerMap["system color"];
    const locationIndex = headerMap.location ?? headerMap["location"];

    const hasHeader = ["id", "name", "category"].every((key) => key in headerMap);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const nextErrors: string[] = [];
    const nextRows: InsertEquipment[] = [];

    dataLines.forEach((line, index) => {
      const values = parseCsvRow(line);
      const id = hasHeader ? values[headerMap.id] : values[0];
      const name = hasHeader ? values[headerMap.name] : values[1];
      const category = hasHeader ? values[headerMap.category] : values[2];
      const systemColor = hasHeader ? values[systemColorIndex ?? -1] : values[3];
      const location = hasHeader ? values[locationIndex ?? -1] : values[4];

      if (!id || !name || !category) {
        nextErrors.push(`Row ${index + 1}: missing required fields (id, name, category).`);
        return;
      }

      nextRows.push({
        id: id.trim(),
        name: name.trim(),
        category: category.trim(),
        systemColor: systemColor?.trim() || undefined,
        originalSystemColor: systemColor?.trim() || undefined,
        location: location?.trim() || "Shop",
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
    const importErrors: string[] = [];
    let successCount = 0;

    for (const row of rows) {
      try {
        await api.equipment.create(row);
        successCount += 1;
      } catch (error) {
        importErrors.push(`${row.id}: ${error instanceof Error ? error.message : "Failed to create"}`);
      }
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
            <p>Upload a CSV file with columns: id, name, category, systemColor (optional), location (optional).</p>
            <p className="font-mono text-xs text-foreground/70">id,name,category,systemColor,location</p>
          </div>

          <div className="space-y-3">
            <Input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            {fileName && (
              <div className="text-xs text-muted-foreground">Loaded: {fileName}</div>
            )}
            {rows.length > 0 && (
              <div className="text-sm text-foreground">Ready to import {rows.length} item(s).</div>
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
  systemColors,
  locationOptions,
  onAddLocation,
  onTransfer,
}: {
  isOpen: boolean;
  onClose: () => void;
  systemColors: string[];
  locationOptions: string[];
  onAddLocation: (value: string) => void;
  onTransfer: (color: string, location: string) => void;
}) {
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedColor("");
    setSelectedLocation("");
    setNewLocation("");
  }, [isOpen]);

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

          <div className="space-y-2">
            <Label>System Color</Label>
            <Select value={selectedColor} onValueChange={setSelectedColor}>
              <SelectTrigger>
                <SelectValue placeholder="Select a system..." />
              </SelectTrigger>
              <SelectContent>
                {systemColors.map((color) => (
                  <SelectItem key={color} value={color}>
                    {color} System
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              onClick={() => onTransfer(selectedColor, selectedLocation)}
              disabled={!selectedColor || !selectedLocation}
            >
              Transfer
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Home({ mode = "admin" }: { mode?: "admin" | "tech" }) {
  const { data: equipment = [], isLoading } = useEquipment();
  const adminEnabled = mode === "admin";
  const updateEquipment = useUpdateEquipment();
  const queryClient = useQueryClient();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSystemCheckoutOpen, setIsSystemCheckoutOpen] = useState(false);
  const [isSystemCheckInOpen, setIsSystemCheckInOpen] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBrandingOpen, setIsBrandingOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(adminEnabled);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [brandingState, setBrandingState] = useState<BrandingState>(() => loadBrandingFromStorage());
  const canManageEquipment = adminEnabled && isAdminMode;
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>({
    good: false,
    broken: false,
    repairs: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<Equipment | null>(null);
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swapContext, setSwapContext] = useState<"broken" | "checked_out">("broken");
  const [isTransferOpen, setIsTransferOpen] = useState(false);
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
    broken: equipment.filter(e => e.status === 'broken').length,
  };

  const locationOptions = Array.from(
    new Set([
      "Shop",
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

  const checkedOutGroups = Object.values(
    equipment
      .filter((item) => item.status === "checked_out")
      .reduce((acc, item) => {
        const tech = item.checkedOutBy || "Unknown tech";
        const workOrder = item.workOrder || "-";
        const effectiveColor = item.temporarySystemColor || item.systemColor;
        const key = effectiveColor
          ? `system:${effectiveColor}:${workOrder}:${tech}`
          : `item:${item.id}`;

        if (!acc[key]) {
          acc[key] = {
            key,
            systemColor: effectiveColor || null,
            tech,
            workOrder,
            items: [],
          };
        }
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { key: string; systemColor: string | null; tech: string; workOrder: string; items: Equipment[] }>)
  ).sort((a, b) => {
    const aTime = a.items[0]?.checkedOutAt ? new Date(a.items[0].checkedOutAt).getTime() : 0;
    const bTime = b.items[0]?.checkedOutAt ? new Date(b.items[0].checkedOutAt).getTime() : 0;
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
    equipment.filter(
      (item) =>
        (item.temporarySystemColor || item.systemColor) === color &&
        item.status === "available" &&
        getLocation(item) === "Shop"
    );


  const brokenSystems = systemsByColor.filter((system) =>
    system.items.some((item) => item.status === "broken")
  );

  const repairSystems = systemsByColor.filter((system) =>
    system.items.some((item) => getLocation(item) === "Repairs")
  );

  const getReplacementLabel = (item: Equipment) => {
    if (!item.replacementId) return "";
    const replacement = equipment.find((entry) => entry.id === item.replacementId);
    if (!replacement) return item.replacementId;
    const color = replacement.originalSystemColor || replacement.systemColor || "Unassigned";
    return `${replacement.id} (${color})`;
  };

  const systemStatuses = systemsByColor.map((system) => {
    const availableItems = activeComponentsForSystem(system.color);
    const expectedCount = system.items.length;
    const effectiveAvailableCount = Math.min(availableItems.length, expectedCount);
    const missingItems = system.items.filter(
      (item) => !availableItems.some((available) => available.id === item.id)
    );
    return {
      color: system.color,
      expectedCount,
      availableItems,
      effectiveAvailableCount,
      missingItems,
    };
  });

  const groupItemsBySystem = (items: Equipment[]) =>
    Object.values(
      items.reduce((acc, item) => {
        const key = item.temporarySystemColor || item.systemColor || "Unassigned";
        if (!acc[key]) {
          acc[key] = { color: key, items: [] as Equipment[] };
        }
        acc[key].items.push(item);
        return acc;
      }, {} as Record<string, { color: string; items: Equipment[] }>)
    );

  const goodSystemItems = systemStatuses.map((system) => ({
    color: system.color,
    items: system.availableItems,
    missingItems: system.missingItems,
    expectedCount: system.expectedCount,
    effectiveAvailableCount: system.effectiveAvailableCount,
  }));
  const brokenItems = groupItemsBySystem(
    equipment.filter((item) => item.status === "broken")
  );
  const repairItems = groupItemsBySystem(
    equipment.filter((item) => getLocation(item) === "Repairs")
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
    try {
      localStorage.setItem(brandingStorageKey, JSON.stringify(brandingState));
    } catch {
      // Ignore localStorage errors.
    }
  }, [brandingState]);

  useEffect(() => {
    try {
      localStorage.setItem("plantpouch-locations", JSON.stringify(customLocations));
    } catch {
      // Ignore localStorage errors.
    }
  }, [customLocations]);

  const handleAddLocation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCustomLocations((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  };

  const handleRemoveLocation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCustomLocations((prev) => prev.filter((location) => location !== trimmed));
  };

  const handleTransferSystem = async (color: string, location: string) => {
    if (!color || !location) return;
    const itemsToMove = equipment.filter(
      (item) =>
        item.systemColor === color &&
        item.status !== "checked_out" &&
        (item.location ?? "Shop") !== "Repairs"
    );

    if (itemsToMove.length === 0) {
      toast.error("No available items to move for that system.");
      return;
    }

    try {
      await Promise.all(
        itemsToMove.map((item) =>
          api.equipment.update(item.id, { location })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`${color} system moved to ${location}.`);
      setIsTransferOpen(false);
    } catch {
      toast.error("Failed to transfer system.");
    }
  };

  const systemsAtLocation = systemLocationSummary.filter(
    (system) => system.location === locationFilter
  );

  const togglePanel = (key: string) => {
    setExpandedPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
          location: "Repairs",
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

  const handleReturnFromRepairs = (item: Equipment) => {
    const replacement = item.replacementId
      ? equipment.find((entry) => entry.id === item.replacementId)
      : undefined;

    updateEquipment.mutate(
      {
        id: item.id,
        data: {
          status: "available",
          location: "Shop",
          workOrder: null,
          checkedOutBy: null,
          checkedOutAt: null,
          replacementId: null,
        },
      },
      {
        onSuccess: () => {
          if (!replacement) {
            toast.success(`${item.id} returned to shop.`);
            return;
          }
          updateEquipment.mutate(
            {
              id: replacement.id,
              data: {
                temporarySystemColor: null,
                swappedFromId: null,
                status: "available",
                workOrder: null,
                checkedOutBy: null,
                checkedOutAt: null,
              },
            },
            {
              onSuccess: () => {
                toast.success(`${item.id} returned to shop. ${replacement.id} restored.`);
              },
              onError: (error) => {
                toast.error(`Failed to restore ${replacement.id}: ${error.message}`);
              },
            }
          );
        },
        onError: (error) => {
          toast.error(`Failed to update ${item.id}: ${error.message}`);
        },
      }
    );
  };

  const handleReturnBorrowed = async (borrowedItem: Equipment) => {
    const brokenItem = borrowedItem.swappedFromId
      ? equipment.find((entry) => entry.id === borrowedItem.swappedFromId)
      : undefined;
    try {
      await api.equipment.update(borrowedItem.id, {
        temporarySystemColor: null,
        swappedFromId: null,
        status: "available",
        workOrder: null,
        checkedOutBy: null,
        checkedOutAt: null,
      });
      if (brokenItem) {
        await api.equipment.update(brokenItem.id, {
          replacementId: null,
          status: "available",
          location: "Shop",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success(`${borrowedItem.id} returned to original system.`);
    } catch {
      toast.error("Failed to return borrowed component.");
    }
  };

  const handleResetBranding = () => {
    setBrandingState(branding);
    try {
      localStorage.removeItem(brandingStorageKey);
    } catch {
      // Ignore localStorage errors.
    }
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
                  className="w-10 h-10 rounded flex items-center justify-center bg-primary text-primary-foreground text-xl shadow-lg shadow-primary/20 overflow-hidden"
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
                {canManageEquipment && (
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10" 
                    onClick={() => setIsBarcodeScannerOpen(true)}
                    data-testid="button-barcode-scanner"
                  >
                    <ScanBarcode className="w-5 h-5" />
                  </Button>
                )}
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
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Broken</span>
            </div>
             <div className="bg-card border border-border rounded-lg p-3 text-center shadow-sm">
                <span className="block text-3xl font-bold font-mono">{stats.total}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</span>
            </div>
        </div>

        {canManageEquipment && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <Input
                  placeholder="Search equipment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectAllFiltered(filteredEquipment.map((item) => item.id))}
                  disabled={filteredEquipment.length === 0}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selectedIds.length === 0}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsBulkEditOpen(true)}
                  disabled={selectedIds.length === 0}
                >
                  Bulk Edit ({selectedIds.length})
                </Button>
              </div>
            </div>
          </div>
        )}

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
                  const label = group.systemColor
                    ? `${group.systemColor} system checked out by ${group.tech} at WO ${group.workOrder}`
                    : `${sample?.id} checked out by ${group.tech} at WO ${group.workOrder}`;
                  const time = sample?.checkedOutAt
                    ? format(new Date(sample.checkedOutAt), "HH:mm dd/MM")
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

        {canManageEquipment && (
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Good Systems (Shop)</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {systemStatuses.length}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => togglePanel("good")}>
                    {expandedPanels.good ? "Hide" : "View"}
                  </Button>
                </div>
              </div>
              {systemStatuses.length === 0 ? (
                <div className="text-xs text-muted-foreground">No systems in shop.</div>
              ) : (
                <div className="space-y-1">
                  {systemStatuses.map((system) => {
                    const missingCount = Math.max(system.expectedCount - system.effectiveAvailableCount, 0);
                    return (
                      <div key={system.color} className="text-xs font-medium">
                        {system.color} System ({system.effectiveAvailableCount}/{system.expectedCount})
                        {missingCount > 0 ? ` - missing ${missingCount}` : ""}
                      </div>
                    );
                  })}
                </div>
              )}
              {expandedPanels.good && (
                <div className="mt-3 space-y-2">
                  {goodSystemItems.map((group) => (
                    <div key={group.color} className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">{group.color} System</div>
                      {group.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                          <span className="font-mono">{item.id}</span>
                          <span className="flex-1 text-xs text-muted-foreground px-3 truncate">{item.name}</span>
                          <span className="text-muted-foreground">
                            {item.updatedAt ? format(new Date(item.updatedAt), "HH:mm dd/MM") : "-"}
                          </span>
                        </div>
                      ))}
                      {group.missingItems.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          Missing: {group.missingItems.map((item) => item.id).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Broken Components</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {brokenSystems.length}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => togglePanel("broken")}>
                    {expandedPanels.broken ? "Hide" : "View"}
                  </Button>
                </div>
              </div>
              {brokenSystems.length === 0 ? (
                <div className="text-xs text-muted-foreground">No broken components.</div>
              ) : (
                <div className="space-y-1">
                  {brokenSystems.map((system) => (
                    <div key={system.color} className="text-xs font-medium">
                      {system.color} System ({system.items.length})
                    </div>
                  ))}
                </div>
              )}
              {expandedPanels.broken && (
                <div className="mt-3 space-y-2">
                  {brokenItems.map((group) => (
                    <div key={group.color} className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">{group.color} System</div>
                      {group.items.map((item) => (
                        <div key={item.id} className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono">{item.id}</span>
                            <span className="flex-1 text-xs text-muted-foreground truncate">{item.name}</span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => handleSendToRepairs(item)}
                              >
                                Send to Repairs
                              </Button>
                              {getLocation(item) === "Repairs" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => handleReturnFromRepairs(item)}
                                >
                                  Is it back?
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                              onClick={() => {
                                setSwapTarget(item);
                                setSwapContext("broken");
                                setIsSwapOpen(true);
                              }}
                              >
                                Swap
                              </Button>
                            </div>
                          </div>
                          {item.replacementId && (
                            <div className="text-[10px] text-muted-foreground">
                              Swapped with {getReplacementLabel(item)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sent for Repairs</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {repairSystems.length}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => togglePanel("repairs")}>
                    {expandedPanels.repairs ? "Hide" : "View"}
                  </Button>
                </div>
              </div>
              {repairSystems.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nothing out for repair.</div>
              ) : (
                <div className="space-y-1">
                  {repairSystems.map((system) => (
                    <div key={system.color} className="text-xs font-medium">
                      {system.color} System ({system.items.length})
                    </div>
                  ))}
                </div>
              )}
              {expandedPanels.repairs && (
                <div className="mt-3 space-y-2">
                  {repairItems.map((group) => (
                    <div key={group.color} className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">{group.color} System</div>
                      {group.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                          <span className="font-mono">{item.id}</span>
                          <span className="flex-1 text-xs text-muted-foreground truncate">{item.name}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => handleReturnFromRepairs(item)}
                          >
                            Is it back?
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Borrowed</h3>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {equipment.filter((item) => item.temporarySystemColor).length}
                </Badge>
              </div>
              <div className="space-y-1">
                {equipment.filter((item) => item.temporarySystemColor).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No borrowed components.</div>
                ) : (
                  equipment
                    .filter((item) => item.temporarySystemColor)
                    .map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-xs font-medium">
                        <span>
                          {item.temporarySystemColor} borrowed {item.originalSystemColor || item.systemColor || "Unassigned"} {item.id}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => handleReturnBorrowed(item)}
                        >
                          Return
                        </Button>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="grid grid-cols-2 gap-4">
          <button 
              onClick={() => setIsSystemCheckoutOpen(true)}
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
        
        <button 
            onClick={() => setIsScannerOpen(true)}
            className="w-full py-4 rounded-xl bg-card border border-primary/20 text-foreground font-bold text-base shadow-sm hover:bg-muted/50 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
        >
            <QrCode className="w-5 h-5 text-primary" />
            SINGLE QR SCAN
        </button>

        {/* Equipment List */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Inventory</h2>
                <div className="flex gap-2 text-xs">
                    <span className="px-2 py-1 rounded bg-muted text-muted-foreground font-medium">All Systems</span>
                </div>
            </div>
            
            <div className="grid gap-3">
                {(canManageEquipment ? filteredEquipment : equipment).map(item => (
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
      </main>

      {/* Modals */}
      {isScannerOpen && (
        <ScannerView 
            onScan={(id) => {
                setIsScannerOpen(false);
                setSelectedEquipmentId(id);
            }} 
            onClose={() => setIsScannerOpen(false)} 
        />
      )}

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
        {canManageEquipment && isBarcodeScannerOpen && (
          <AdminBarcodeScannerModal
            isOpen={isBarcodeScannerOpen}
            onClose={() => setIsBarcodeScannerOpen(false)}
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
            onChange={setBrandingState}
            onReset={handleResetBranding}
          />
        )}
        {isSystemCheckoutOpen && (
          <SystemCheckoutModal
            isOpen={isSystemCheckoutOpen}
            onClose={() => setIsSystemCheckoutOpen(false)}
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
            systemColors={baseSystemColors}
            locationOptions={locationOptions}
            onAddLocation={handleAddLocation}
            onTransfer={handleTransferSystem}
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
        {selectedEquipmentId && (
            <ActionModal 
                equipment={selectedEquipment || null} 
                isOpen={!!selectedEquipmentId} 
                onClose={() => setSelectedEquipmentId(null)}
                canManageEquipment={canManageEquipment}
                locationOptions={locationOptions}
                systemColorOptions={systemColorOptions}
                onAddLocation={handleAddLocation}
                onAssignReplacement={handleAssignReplacement}
                replacementCandidates={selectedEquipment ? getReplacementCandidates(selectedEquipment) : []}
            />
        )}
      </AnimatePresence>
    </div>
  );
}
