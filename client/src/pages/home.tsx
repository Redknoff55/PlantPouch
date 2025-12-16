import { useState } from "react";
import { useEquipmentStore, Equipment } from "@/lib/store";
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
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

// --- Components ---

function StatusBadge({ status }: { status: Equipment['status'] }) {
  const styles = {
    available: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    checked_out: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    broken: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  const labels = {
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

  return (
    <motion.div
      layoutId={`card-${item.id}`}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border p-4 transition-all cursor-pointer shadow-sm",
        isBroken 
          ? "border-destructive/50 hover:border-destructive bg-destructive/5 shadow-destructive/5" 
          : "border-border hover:border-primary/50 bg-card hover:bg-muted/30"
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
  const { equipment } = useEquipmentStore();

  const handleSimulatedScan = () => {
    // Pick a random equipment ID for demo purposes if empty, or try to match input
    const targetId = manualId || equipment[Math.floor(Math.random() * equipment.length)].id;
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
               <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary -mt-1 -ml-1"></div>
               <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary -mt-1 -mr-1"></div>
               <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary -mb-1 -ml-1"></div>
               <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary -mb-1 -mr-1"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-50 pointer-events-none">
                <span className="text-muted-foreground text-xs animate-bounce">Tap to simulate scan</span>
            </div>
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
              />
              <Button onClick={handleSimulatedScan}>
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
  const { checkOut, checkIn } = useEquipmentStore();
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
      checkOut(equipment.id, workOrder, "Tech #01"); // Hardcoded tech for now
    } else {
      checkIn(equipment.id, notes, isBroken);
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
                                // Simple "Fix" workflow for prototype
                                checkIn(equipment.id, "Repaired and returned to service", false);
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

export default function Home() {
  const { equipment, getEquipment } = useEquipmentStore();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  
  const selectedEquipment = selectedEquipmentId ? getEquipment(selectedEquipmentId) : null;
  
  const stats = {
    total: equipment.length,
    out: equipment.filter(e => e.status === 'checked_out').length,
    broken: equipment.filter(e => e.status === 'broken').length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded flex items-center justify-center font-bold text-primary-foreground text-xl shadow-lg shadow-primary/20">
                    EM
                </div>
                <div>
                    <h1 className="font-bold leading-none tracking-tight">EquipManager</h1>
                    <span className="text-xs text-muted-foreground font-mono">IND-V1.0</span>
                </div>
            </div>
            
            <div className="flex gap-2">
                <Button variant="outline" size="icon" className="shrink-0 rounded-full">
                   <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
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
        <button 
            onClick={() => setIsScannerOpen(true)}
            className="w-full py-6 rounded-xl bg-primary text-primary-foreground font-bold text-xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-3"
        >
            <QrCode className="w-6 h-6" />
            SCAN EQUIPMENT
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
