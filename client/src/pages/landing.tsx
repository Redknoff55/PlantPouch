import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, ShieldCheck } from "lucide-react";
import { getStoredPin, setAdminUnlocked, setStoredPin } from "@/lib/adminPin";
import { loadBrandingFromStorage } from "@/lib/branding";

function AdminAccessModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const storedPin = getStoredPin();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    setError("");
    if (!storedPin) {
      if (!pin || pin.length < 4) {
        setError("Use a PIN with at least 4 digits.");
        return;
      }
      if (pin !== confirmPin) {
        setError("PINs do not match.");
        return;
      }
      setStoredPin(pin);
      setAdminUnlocked(true);
      onSuccess();
      return;
    }

    if (pin !== storedPin) {
      setError("Incorrect PIN.");
      return;
    }

    setAdminUnlocked(true);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md shadow-2xl border border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <CardTitle>Admin Access</CardTitle>
          </div>
          <CardDescription>
            {storedPin ? "Enter your admin PIN." : "Create an admin PIN to secure admin features."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{storedPin ? "PIN" : "New PIN"}</Label>
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
            />
          </div>
          {!storedPin && (
            <div className="space-y-2">
              <Label>Confirm PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Confirm PIN"
              />
            </div>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit}>
              {storedPin ? "Unlock" : "Set PIN"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const brandingState = useMemo(() => loadBrandingFromStorage(), []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center shadow-lg shadow-primary/20 mb-6 overflow-hidden">
          {brandingState.logo.imageSrc ? (
            <img
              src={brandingState.logo.imageSrc}
              alt={brandingState.logo.alt ?? `${brandingState.appName} logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            brandingState.logo.text ?? branding.logo.text ?? "PP"
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{brandingState.appName}</h1>
        <p className="text-sm text-muted-foreground mt-2">Tap to check equipment in or out.</p>

        <button
          className="mt-8 w-full max-w-md rounded-2xl bg-primary text-primary-foreground py-10 text-2xl font-bold shadow-lg shadow-primary/30 hover:brightness-110 active:scale-[0.99] transition-all flex flex-col items-center gap-3"
          onClick={() => setLocation("/tech")}
        >
          <ShieldCheck className="w-8 h-8" />
          CHECK IN / OUT
        </button>
      </div>

      <div className="pb-6 flex items-center justify-center">
        <Button variant="ghost" size="sm" onClick={() => setIsAdminModalOpen(true)}>
          Admin
        </Button>
      </div>

      <AdminAccessModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onSuccess={() => {
          setIsAdminModalOpen(false);
          setLocation("/admin");
        }}
      />
    </div>
  );
}
