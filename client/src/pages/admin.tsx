import { useState } from "react";
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
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-md border border-border shadow-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <CardTitle>Admin Access</CardTitle>
          </div>
          <CardDescription>
            {storedPin ? "Enter your admin PIN to continue." : "Create your admin PIN."}
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
            <Button variant="outline" className="flex-1" onClick={() => setLocation("/")}>
              Back
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
