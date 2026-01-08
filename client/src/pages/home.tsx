import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Equipment, InsertEquipment } from "@shared/schema";
import { useEquipment, useCreateEquipment, useCheckoutSystem, useCheckinByWorkOrder, useCheckout, useCheckin } from "@/lib/hooks";
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
  CheckCircle2, 
  Clock, 
  Wrench, 
  ArrowRightLeft,
  History,
  X,
  Plus,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Box,
  ClipboardCheck,
  Download,
  ScanBarcode,
  Settings,
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

function EquipmentListItem({ item, onClick }: { item: Equipment; onClick: () => void }) {
  const isBroken = item.status === 'broken';
function EquipmentListItem({ item, onClick }: { item: Equipment; onClick: () =>
                 <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-primary/20 text-primary">
                    {item.systemColor} Sys
                 </Badge>
            )}
          </div>
          <h3 className={cn("font-semibold text-lg transition-colors", isBroken ? "text-destructive" : "text-foreground group-hover:text-primary")}>
            {item.name}
          </h3>
          <p className="text-sm text-muted-foreground">{item.category}</p>
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
    const targetId = manualId || (equipment.length > 0 ? equipment[Math.floor(Math.random() * equipment.length)].id : '');
    if (targetId) onScan(targetId);
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
        const { BrowserMultiFormatReader, NotFoundException } = await import("@zxing/browser");
        const codeReader = new BrowserMultiFormatReader();
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, error) => {
            if (result) {
              stopScanner();
              onScan(parseScanValue(result.getText()));
              return;
            }
            if (error && !(error instanceof NotFoundException)) {
              setScanError("Unable to read a QR code. Try better lighting or manual entry.");
            }
          }
        );
        zxingControlsRef.current = controls;
        setIsScanning(true);
        return;
      } catch {
        // Fall back to BarcodeDetector if ZXing isn't available.
      }

      if (!("BarcodeDetector" in window)) {
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

      const detector = new BarcodeDetector({ formats: ["qr_code"] });
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
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/30 flex items-center justify-center" onClick={handleSimulatedScan}>
            <div className="absolute inset-0 border-[40px] border-black/50 z-10"></div>
            <div className="w-64 h-64 border-2 border-primary animate-pulse z-20 relative">
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden border-2 border-primary/30 flex items-center justify-center">
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
            <div className="absolute inset-0 flex items-center justify-center opacity-50 pointer-events-none">
                <span className="text-muted-foreground text-xs animate-bounce">Tap to simulate scan</span>
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
              <Button onClick={handleSimulatedScan}>
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

function ActionModal({ 
  equipment, 
  isOpen, 
  onClose 
}: { 
  equipment: Equipment | null; 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const checkout = useCheckout();
  const checkin = useCheckin();
  const [step, setStep] = useState<'details' | 'process'>('details');
  
  // Checkout State
  const [workOrder, setWorkOrder] = useState("");
  
  // Checkin State
  const [notes, setNotes] = useState("");
  const [isBroken, setIsBroken] = useState(false);

  if (!isOpen || !equipment) return null;

  const qrPayload = JSON.stringify({
    id: equipment.id,
    name: equipment.name,
    category: equipment.category,
    systemColor: equipment.systemColor
  });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`;

  const isCheckingOut = equipment.status === 'available';
  const isBrokenState = equipment.status === 'broken';

  const handleSubmit = () => {
    if (isCheckingOut) {
      checkout.mutate({ id: equipment.id, workOrder, techName: "Tech #01" });
    } else {
      checkin.mutate({ id: equipment.id, notes, isBroken });
    }
    onClose();
    // Reset state
    setWorkOrder("");
    setNotes("");
    setIsBroken(false);
    setStep('details');
  };

  const handleCopyQr = async () => {
    try {
      await navigator.clipboard.writeText(qrPayload);
      toast.success("QR payload copied to clipboard.");
    } catch {
      toast.error("Failed to copy QR payload.");
    }
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
function ActionModal({
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
                                <Label>Work Order #</Label>
                                <Input 
                                    placeholder="Enter WO-XXXX" 
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea placeholder="Enter any notes about this checkout" />
                            </div>
                            <Button className="w-full" onClick={() => {
                                checkout.mutate({ id: equipment.id, workOrder: "WO-XXXX", notes: "Checked out for maintenance" });
                                onClose();
                            }}>
                                Check Out
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Work Order #</Label>
                                <Input 
                                    placeholder="Enter WO-XXXX" 
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea placeholder="Enter any notes about this checkin" />
                            </div>
                            <Button className="w-full" onClick={() => {
                                checkin.mutate({ id: equipment.id, workOrder: "WO-XXXX", notes: "Returned after maintenance" });
                                onClose();
                            }}>
                                Check In
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* Add Equipment Modal */}
        {isAddingEquipment && (
            <AddEquipmentModal isOpen={isAddingEquipment} onClose={() => setIsAddingEquipment(false)} />
        )}

        {/* Admin Barcode Scanner Modal */}
        {isAdminBarcodeScannerOpen && (
            <AdminBarcodeScannerModal isOpen={isAdminBarcodeScannerOpen} onClose={() => setIsAdminBarcodeScannerOpen(false)} />
        )}
    </>
  );
}

function AdminBarcodeScannerModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const createEquipment = useCreateEquipment();
  const [scannedId, setScannedId] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    systemColor: ''
  });
  const [addedItems, setAddedItems] = useState<string[]>([]);
  const [step, setStep] = useState<'scan' | 'details'>('scan');

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
      createEquipment.mutate({
        id: parsed.id,
        name: parsed.name,
        category: parsed.category,
        systemColor: parsed.systemColor || undefined,
        status: 'available'
      }, {
        onSuccess: () => {
          toast.success(`Equipment ${parsed.id} added successfully`);
          setAddedItems(prev => [...prev, parsed.id]);
          setScannedId("");
          setFormData({ name: '', category: '', systemColor: '' });
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
        systemColor: parsed.systemColor || ''
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
      status: 'available'
    });
    
    setAddedItems(prev => [...prev, scannedId]);
    setScannedId("");
    setFormData({ name: '', category: '', systemColor: '' });
    setManualBarcode("");
    setStep('scan');
  };
function AdminBarcodeScannerModal({
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

      if (!id || !name || !category) {
        nextErrors.push(`Row ${index + 1}: missing required fields (id, name, category).`);
        return;
      }

      nextRows.push({
        id: id.trim(),
        name: name.trim(),
        category: category.trim(),
        systemColor: systemColor?.trim() || undefined,
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
            <p>Upload a CSV file with columns: id, name, category, systemColor (optional).</p>
            <p className="font-mono text-xs text-foreground/70">id,name,category,systemColor</p>
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

export default function Home() {
  const { data: equipment = [], isLoading } = useEquipment();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSystemCheckoutOpen, setIsSystemCheckoutOpen] = useState(false);
  const [isSystemCheckInOpen, setIsSystemCheckInOpen] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  
  const selectedEquipment = equipment.find(e => e.id === selectedEquipmentId) || null;
  
  const stats = {
    total: equipment.length,
    out: equipment.filter(e => e.status === 'checked_out').length,
    broken: equipment.filter(e => e.status === 'broken').length,
  };
  
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
                <div className="w-10 h-10 bg-primary rounded flex items-center justify-center font-bold text-primary-foreground text-xl shadow-lg shadow-primary/20">
                    PP
                </div>
                <div>
                    <h1 className="font-bold leading-none tracking-tight">PlantPouch</h1>
                    <span className="text-xs text-muted-foreground font-mono">v1.0</span>
                </div>
            </div>
            
            <div className="flex gap-2">
                {isAdminMode && (
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
                {isAdminMode && (
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
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => setIsAddModalOpen(true)} data-testid="button-add-equipment">
                   <Plus className="w-5 h-5" />
                </Button>
                <Button 
                  variant={isAdminMode ? "default" : "outline"}
                  size="icon" 
                  className={cn("shrink-0", isAdminMode && "bg-amber-500 hover:bg-amber-600")}
                  onClick={() => setIsAdminMode(!isAdminMode)}
                  data-testid="button-toggle-admin"
                >
                   <Settings className="w-5 h-5" />
                </Button>
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
export default function Home() {

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
        {isAddModalOpen && (
          <AddEquipmentModal 
            isOpen={isAddModalOpen} 
            onClose={() => setIsAddModalOpen(false)} 
          />
        )}
        {isBarcodeScannerOpen && (
          <AdminBarcodeScannerModal
            isOpen={isBarcodeScannerOpen}
            onClose={() => setIsBarcodeScannerOpen(false)}
          />
        )}
        {isImportModalOpen && (
          <AdminImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
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
        {selectedEquipmentId && (
            <ActionModal 
                equipment={selectedEquipment || null} 
                isOpen={!!selectedEquipmentId} 
                onClose={() => setSelectedEquipmentId(null)} 
            />
        )}
      </AnimatePresence>
    </div>
  );
}