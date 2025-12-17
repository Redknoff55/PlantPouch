import { useState, useCallback } from "react";
import type { Equipment, System } from "@shared/schema";
import { useEquipment, useCreateEquipment, useCheckoutSystem, useCheckinByWorkOrder, useCheckout, useCheckin, useUpdateEquipment, useDeleteEquipment, useSystems, useCreateSystem, useUpdateSystem, useDeleteSystem } from "@/lib/hooks";
import { toast } from "sonner";
import { BarcodeScanner } from "@/components/BarcodeScanner";
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
  ScanBarcode,
  Settings,
  Check,
  Pencil,
  Trash2,
  Database,
  Palette
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
  const systemColors: Record<string, string> = {
    'Blue': 'border-l-4 border-l-blue-500',
    'Red': 'border-l-4 border-l-red-500',
    'Green': 'border-l-4 border-l-green-500',
    'Yellow': 'border-l-4 border-l-yellow-500',
  };

  return (
    <motion.div
      layoutId={`card-${item.id}`}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border p-4 transition-all cursor-pointer shadow-sm",
        isBroken 
          ? "border-destructive/50 hover:border-destructive bg-destructive/5 shadow-destructive/5" 
          : "border-border hover:border-primary/50 bg-card hover:bg-muted/30",
         item.systemColor && systemColors[item.systemColor]
      )}
    >
      {isBroken && (
        <div className="absolute top-0 right-0 p-1.5 bg-destructive rounded-bl-lg">
          <AlertTriangle className="w-4 h-4 text-destructive-foreground" />
        </div>
      )}
      
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
            <StatusBadge status={item.status} />
            {item.systemColor && (
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
  const [isScanning, setIsScanning] = useState(true);

  const handleScan = useCallback((code: string) => {
    setIsScanning(false);
    onScan(code);
  }, [onScan]);

  const handleManualSubmit = () => {
    if (manualId.trim()) {
      onScan(manualId.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-primary/20 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <QrCode className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Scan Equipment QR</CardTitle>
          <CardDescription>Align the QR code or barcode within the frame</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative rounded-lg overflow-hidden border-2 border-primary/30">
            <BarcodeScanner 
              onScan={handleScan}
              isActive={isScanning}
            />
          </div>
          
          <div className="space-y-4">
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
                data-testid="input-manual-equipment-id"
              />
              <Button onClick={handleManualSubmit} data-testid="button-manual-identify">
                Identify
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={onClose} data-testid="button-cancel-scan">
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
                                    value={workOrder}
                                    onChange={(e) => setWorkOrder(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <Button 
                                className="w-full h-12 text-lg font-semibold" 
                                size="lg"
                                onClick={handleSubmit}
                                disabled={!workOrder}
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
  
  // Track which items are selected/verified for checkout
  // Key: Original Item ID, Value: The ID of the item to actually checkout (could be the same, or a replacement)
  const [verifiedItems, setVerifiedItems] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});

  // Get unique system colors
  const systemColors = Array.from(new Set(equipment.map(e => e.systemColor).filter(Boolean))) as string[];
  
  // Get items for the selected system
  const systemItems = equipment.filter(e => e.systemColor === selectedColor);

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    // Initialize verified items with the default system items
    const initialVerified: Record<string, string> = {};
    equipment.filter(e => e.systemColor === color).forEach(e => {
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
    if (!workOrder) return;
    
    // Collect all final IDs to checkout
    const finalIds = Object.values(verifiedItems);
    
    checkoutSystem.mutate({ systemColor: selectedColor, equipmentIds: finalIds, workOrder, techName: "Tech #01" });
    onClose();
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
                {['Blue', 'Red', 'Yellow', 'Green'].map(color => {
                    // Check if we have items for this color
                    const hasItems = systemColors.includes(color);
                    return (
                        <Button
                            key={color}
                            variant="outline"
                            className={cn(
                                "h-20 text-lg font-semibold border-2 relative overflow-hidden",
                                hasItems ? "hover:border-primary hover:bg-primary/5" : "opacity-50 cursor-not-allowed"
                            )}
                            onClick={() => hasItems && handleColorSelect(color)}
                            disabled={!hasItems}
                        >
                            <div className={cn("absolute inset-y-0 left-0 w-2", {
                                'bg-blue-500': color === 'Blue',
                                'bg-red-500': color === 'Red',
                                'bg-yellow-500': color === 'Yellow',
                                'bg-green-500': color === 'Green',
                            })} />
                            {color} System
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
                        const isOriginal = currentSelectedId === item.id;
                        const selectedItem = equipment.find(e => e.id === currentSelectedId);
                        
                        // Find potential replacements (same category, available, not already in this system)
                        const replacements = equipment.filter(e => 
                            e.category === item.category && 
                            e.status === 'available' && 
                            e.id !== item.id
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
                    disabled={!workOrder}
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
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const createEquipment = useCreateEquipment();
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: '',
    systemColor: '',
    status: 'available'
  });

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
      status: 'available'
    }, {
      onSuccess: () => {
        toast.success(`Equipment ${formData.id} added successfully`);
        setFormData({ id: '', name: '', category: '', systemColor: '', status: 'available' });
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
                      <SelectItem value="Blue">Blue System</SelectItem>
                      <SelectItem value="Red">Red System</SelectItem>
                      <SelectItem value="Green">Green System</SelectItem>
                      <SelectItem value="Yellow">Yellow System</SelectItem>
                  </SelectContent>
              </Select>
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
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const { data: allEquipment = [] } = useEquipment();
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment();
  const [scannedId, setScannedId] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    systemColor: ''
  });
  const [addedItems, setAddedItems] = useState<string[]>([]);
  const [step, setStep] = useState<'scan' | 'details'>('scan');
  const [isExisting, setIsExisting] = useState(false);
  const [existingEquipment, setExistingEquipment] = useState<Equipment | null>(null);

  if (!isOpen) return null;

  const handleScan = useCallback((barcode: string) => {
    const existing = allEquipment.find(e => e.id === barcode);
    
    setScannedId(barcode);
    
    if (existing) {
      setIsExisting(true);
      setExistingEquipment(existing);
      setFormData({
        name: existing.name,
        category: existing.category,
        systemColor: existing.systemColor || ''
      });
    } else {
      setIsExisting(false);
      setExistingEquipment(null);
      setFormData({ name: '', category: '', systemColor: '' });
    }
    
    setStep('details');
  }, [allEquipment]);

  const handleSaveEquipment = () => {
    if (!scannedId || !formData.name || !formData.category) return;
    
    if (isExisting) {
      updateEquipment.mutate({
        id: scannedId,
        name: formData.name,
        category: formData.category,
        systemColor: formData.systemColor || undefined,
      }, {
        onSuccess: () => {
          toast.success(`Updated ${scannedId}`);
          setAddedItems(prev => [...prev, scannedId]);
          resetToScan();
        },
        onError: () => {
          toast.error('Failed to update equipment');
        }
      });
    } else {
      createEquipment.mutate({
        id: scannedId,
        name: formData.name,
        category: formData.category,
        systemColor: formData.systemColor || undefined,
        status: 'available'
      }, {
        onSuccess: () => {
          toast.success(`Added ${scannedId}`);
          setAddedItems(prev => [...prev, scannedId]);
          resetToScan();
        },
        onError: () => {
          toast.error('Failed to add equipment');
        }
      });
    }
  };

  const resetToScan = () => {
    setScannedId("");
    setFormData({ name: '', category: '', systemColor: '' });
    setManualBarcode("");
    setIsExisting(false);
    setExistingEquipment(null);
    setStep('scan');
  };

  const handleClose = () => {
    resetToScan();
    setAddedItems([]);
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
              <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/30">
                <BarcodeScanner 
                  onScan={handleScan}
                  isActive={step === 'scan'}
                />
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
                  <Button onClick={() => manualBarcode && handleScan(manualBarcode)} data-testid="button-scan-barcode">
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-4">
              <div className={cn(
                "rounded-lg p-4 text-center border",
                isExisting 
                  ? "bg-blue-500/10 border-blue-500/20" 
                  : "bg-amber-500/10 border-amber-500/20"
              )}>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {isExisting ? 'Existing Equipment' : 'New Equipment'}
                </span>
                <div className={cn(
                  "text-2xl font-mono font-bold mt-1",
                  isExisting ? "text-blue-500" : "text-amber-500"
                )}>{scannedId}</div>
                {isExisting && existingEquipment && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Status: {existingEquipment.status === 'available' ? 'Available' : 
                             existingEquipment.status === 'checked_out' ? 'Checked Out' : 'Broken'}
                  </div>
                )}
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
                      <SelectItem value="Blue">Blue System</SelectItem>
                      <SelectItem value="Red">Red System</SelectItem>
                      <SelectItem value="Green">Green System</SelectItem>
                      <SelectItem value="Yellow">Yellow System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={resetToScan}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-[2] h-12 text-lg font-semibold"
                  onClick={handleSaveEquipment}
                  disabled={!formData.name || !formData.category}
                  data-testid="button-save-and-next"
                >
                  {isExisting ? 'Update & Scan Next' : 'Add & Scan Next'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function AdminSettingsModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const { data: equipment = [] } = useEquipment();
  const updateEquipment = useUpdateEquipment();
  const deleteEquipment = useDeleteEquipment();
  const [editingItem, setEditingItem] = useState<Equipment | null>(null);
  const [formData, setFormData] = useState({ name: '', category: '', systemColor: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  if (!isOpen) return null;

  const filteredEquipment = equipment.filter(e => 
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (item: Equipment) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      systemColor: item.systemColor || ''
    });
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    
    updateEquipment.mutate({
      id: editingItem.id,
      name: formData.name,
      category: formData.category,
      systemColor: formData.systemColor || undefined
    }, {
      onSuccess: () => {
        toast.success(`Updated ${editingItem.id}`);
        setEditingItem(null);
      },
      onError: () => {
        toast.error('Failed to update equipment');
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteEquipment.mutate(id, {
      onSuccess: () => {
        toast.success(`Deleted ${id}`);
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Failed to delete equipment');
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
        className="relative w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Equipment Manager</h2>
                <p className="text-xs text-muted-foreground">Edit or remove equipment</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-admin-settings">
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          <div className="mt-4">
            <Input 
              placeholder="Search equipment..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
              data-testid="input-search-equipment"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredEquipment.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchTerm ? 'No equipment found' : 'No equipment in inventory'}
            </div>
          ) : (
            filteredEquipment.map(item => (
              <div 
                key={item.id}
                className="bg-background border border-border rounded-lg p-3"
              >
                {editingItem?.id === item.id ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      ID: {item.id}
                    </div>
                    <div className="grid gap-2">
                      <Input 
                        placeholder="Name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        data-testid={`input-edit-name-${item.id}`}
                      />
                      <Input 
                        placeholder="Category"
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                        data-testid={`input-edit-category-${item.id}`}
                      />
                      <Select 
                        value={formData.systemColor} 
                        onValueChange={(val) => setFormData(prev => ({ ...prev, systemColor: val }))}
                      >
                        <SelectTrigger data-testid={`select-edit-color-${item.id}`}>
                          <SelectValue placeholder="System Color (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Color</SelectItem>
                          <SelectItem value="Blue">Blue System</SelectItem>
                          <SelectItem value="Red">Red System</SelectItem>
                          <SelectItem value="Green">Green System</SelectItem>
                          <SelectItem value="Yellow">Yellow System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setEditingItem(null)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={!formData.name || !formData.category}
                        data-testid={`button-save-edit-${item.id}`}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : deleteConfirm === item.id ? (
                  <div className="space-y-3">
                    <div className="text-center">
                      <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                      <p className="text-sm font-medium">Delete {item.name}?</p>
                      <p className="text-xs text-muted-foreground">ID: {item.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleDelete(item.id)}
                        data-testid={`button-confirm-delete-${item.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                        <StatusBadge status={item.status} />
                        {item.systemColor && (
                          <span className={cn(
                            "w-3 h-3 rounded-full",
                            item.systemColor === 'Blue' && 'bg-blue-500',
                            item.systemColor === 'Red' && 'bg-red-500',
                            item.systemColor === 'Green' && 'bg-green-500',
                            item.systemColor === 'Yellow' && 'bg-yellow-500'
                          )} />
                        )}
                      </div>
                      <div className="font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.category}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleEdit(item)}
                        data-testid={`button-edit-${item.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(item.id)}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">
            {equipment.length} total items in inventory
          </p>
        </div>
      </motion.div>
    </div>
  );
}

const PRESET_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#ef4444', label: 'Red' },
  { value: '#22c55e', label: 'Green' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#f97316', label: 'Orange' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
];

function SystemManagerModal({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void 
}) {
  const { data: systems = [] } = useSystems();
  const createSystem = useCreateSystem();
  const updateSystem = useUpdateSystem();
  const deleteSystem = useDeleteSystem();
  const [editingItem, setEditingItem] = useState<System | null>(null);
  const [formData, setFormData] = useState({ name: '', color: '#3b82f6' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleAdd = () => {
    setIsAdding(true);
    setFormData({ name: '', color: '#3b82f6' });
  };

  const handleSaveNew = () => {
    if (!formData.name) return;
    
    createSystem.mutate({
      name: formData.name,
      color: formData.color
    }, {
      onSuccess: () => {
        toast.success(`Added ${formData.name} system`);
        setIsAdding(false);
        setFormData({ name: '', color: '#3b82f6' });
      },
      onError: () => {
        toast.error('Failed to create system');
      }
    });
  };

  const handleEdit = (item: System) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      color: item.color
    });
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    
    updateSystem.mutate({
      id: editingItem.id,
      name: formData.name,
      color: formData.color
    }, {
      onSuccess: () => {
        toast.success(`Updated ${formData.name}`);
        setEditingItem(null);
      },
      onError: () => {
        toast.error('Failed to update system');
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteSystem.mutate(id, {
      onSuccess: () => {
        toast.success('System deleted');
        setDeleteConfirm(null);
      },
      onError: () => {
        toast.error('Failed to delete system');
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
        className="relative w-full max-w-md max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Palette className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold">System Manager</h2>
                <p className="text-xs text-muted-foreground">Add, edit, or remove color systems</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-system-manager">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isAdding && (
            <div className="bg-background border border-primary rounded-lg p-3 space-y-3">
              <div className="text-sm font-medium text-primary">New System</div>
              <Input 
                placeholder="System Name (e.g., Purple)"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-new-system-name"
              />
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, color: c.value }))}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      formData.color === c.value ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => setIsAdding(false)}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  className="flex-1"
                  onClick={handleSaveNew}
                  disabled={!formData.name}
                  data-testid="button-save-new-system"
                >
                  Add System
                </Button>
              </div>
            </div>
          )}
          
          {systems.length === 0 && !isAdding ? (
            <div className="text-center text-muted-foreground py-8">
              No systems created yet
            </div>
          ) : (
            systems.map(item => (
              <div 
                key={item.id}
                className="bg-background border border-border rounded-lg p-3"
              >
                {editingItem?.id === item.id ? (
                  <div className="space-y-3">
                    <Input 
                      placeholder="System Name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      data-testid={`input-edit-system-name-${item.id}`}
                    />
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, color: c.value }))}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            formData.color === c.value ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100"
                          )}
                          style={{ backgroundColor: c.value }}
                          title={c.label}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setEditingItem(null)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={!formData.name}
                        data-testid={`button-save-edit-system-${item.id}`}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : deleteConfirm === item.id ? (
                  <div className="space-y-3">
                    <div className="text-center">
                      <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                      <p className="text-sm font-medium">Delete {item.name} System?</p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleDelete(item.id)}
                        data-testid={`button-confirm-delete-system-${item.id}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-6 h-6 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleEdit(item)}
                        data-testid={`button-edit-system-${item.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(item.id)}
                        data-testid={`button-delete-system-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-border bg-muted/30">
          {!isAdding && (
            <Button 
              className="w-full" 
              onClick={handleAdd}
              data-testid="button-add-system"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New System
            </Button>
          )}
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
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);
  const [isSystemManagerOpen, setIsSystemManagerOpen] = useState(false);
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
                  <>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10" 
                      onClick={() => setIsBarcodeScannerOpen(true)}
                      data-testid="button-barcode-scanner"
                    >
                      <ScanBarcode className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="shrink-0 border-amber-500/30 text-amber-500 hover:bg-amber-500/10" 
                      onClick={() => setIsAdminSettingsOpen(true)}
                      data-testid="button-admin-settings"
                    >
                      <Database className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="shrink-0 border-purple-500/30 text-purple-500 hover:bg-purple-500/10" 
                      onClick={() => setIsSystemManagerOpen(true)}
                      data-testid="button-system-manager"
                    >
                      <Palette className="w-5 h-5" />
                    </Button>
                  </>
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
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Broken</span>
            </div>
             <div className="bg-card border border-border rounded-lg p-3 text-center shadow-sm">
                <span className="block text-3xl font-bold font-mono">{stats.total}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</span>
            </div>
        </div>

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
                {equipment.map(item => (
                    <EquipmentListItem 
                        key={item.id} 
                        item={item} 
                        onClick={() => setSelectedEquipmentId(item.id)} 
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
        {isAdminSettingsOpen && (
          <AdminSettingsModal
            isOpen={isAdminSettingsOpen}
            onClose={() => setIsAdminSettingsOpen(false)}
          />
        )}
        {isSystemManagerOpen && (
          <SystemManagerModal
            isOpen={isSystemManagerOpen}
            onClose={() => setIsSystemManagerOpen(false)}
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
