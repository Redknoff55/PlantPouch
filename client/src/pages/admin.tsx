import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import Home from "@/pages/home";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { getStoredPin, isAdminUnlocked, setAdminUnlocked, setStoredPin } from "@/lib/adminPin";

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [unlocked, setUnlocked] = useState(() => isAdminUnlocked());
  const [storedPin, setStoredPinState] = useState(() => getStoredPin());
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  if (unlocked) {
    return <Home mode="admin" />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
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
      setStoredPinState(pin);
      setAdminUnlocked(true);
      setUnlocked(true);
      return;
    }

    if (pin !== storedPin) {
      setError("Incorrect PIN.");
      return;
    }

    setAdminUnlocked(true);
    setUnlocked(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4 text-foreground sm:p-6">
      <Card className="w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="space-y-4 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-xl tracking-tight">Admin Access</CardTitle>
            <CardDescription>
              {storedPin ? "Enter your admin PIN to continue." : "Create your admin PIN to secure this workspace."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="admin-pin">{storedPin ? "PIN" : "New PIN"}</Label>
              <Input
                id="admin-pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={storedPin ? "Enter PIN" : "At least 4 digits"}
                autoComplete={storedPin ? "current-password" : "new-password"}
              />
            </div>
            {!storedPin && (
              <div className="space-y-2">
                <Label htmlFor="admin-pin-confirm">Confirm PIN</Label>
                <Input
                  id="admin-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Re-enter PIN"
                  autoComplete="new-password"
                />
              </div>
            )}
            {error && <div className="text-sm text-destructive" role="alert">{error}</div>}
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setLocation("/")}>
                Back
              </Button>
              <Button className="flex-1" type="submit">
                {storedPin ? "Unlock" : "Set PIN"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
