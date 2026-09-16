import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, ClipboardList, Lock, Package, ShieldCheck, Warehouse as WarehouseIcon } from "lucide-react";
import { getStoredPin, setAdminUnlocked, setStoredPin } from "@/lib/adminPin";
import { useActiveOutages } from "@/lib/hooks";
import {
  applyBrandingToDocument,
  loadBrandingFromStorage,
  mergeBranding,
  saveBrandingToStorage,
  type BrandingState,
} from "@/lib/branding";
import { api } from "@/lib/api";

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
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
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
            <Button variant="outline" className="flex-1" type="button" onClick={onClose}>
              Cancel
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

export default function Landing() {
  const [, setLocation] = useLocation();
  const { data: activeOutages = [] } = useActiveOutages();
  const toolboxOutages = activeOutages.filter((outage) => outage.toolboxId);
  const { data: registry, isLoading: isRegistryLoading } = useQuery({
    queryKey: ["platform-registry"],
    queryFn: api.registry.get,
  });
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [brandingState, setBrandingState] = useState<BrandingState>(() => loadBrandingFromStorage());

  useEffect(() => {
    let active = true;
    api.branding
      .get()
      .then((overrides) => {
        if (!active) return;
        const nextBranding = mergeBranding(overrides);
        setBrandingState(nextBranding);
        saveBrandingToStorage(nextBranding);
      })
      .catch(() => {
        // Ignore branding fetch errors on the landing page.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyBrandingToDocument(brandingState);
    saveBrandingToStorage(brandingState);
  }, [brandingState]);

  const enabledWarehouses = (registry?.warehouses ?? []).filter((warehouse) => warehouse.enabled);
  const enabledToolboxes = (registry?.toolboxes ?? []).filter((toolbox) => toolbox.enabled);
  const enabledPouches = (registry?.pouches ?? []).filter((pouch) => pouch.enabled);
  const hasRegistry = enabledWarehouses.length > 0;

  const openPouch = (toolboxId: string, pouchId: string) => {
    window.location.href = `/tech?toolbox=${encodeURIComponent(toolboxId)}&pouch=${encodeURIComponent(pouchId)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div
          className={`w-16 h-16 rounded-2xl text-2xl font-bold flex items-center justify-center mb-6 overflow-hidden ${
            brandingState.logo.imageSrc
              ? "bg-transparent shadow-none"
              : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          }`}
        >
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

        {isRegistryLoading ? (
          <div className="mt-8 text-sm text-muted-foreground">Loading warehouse...</div>
        ) : hasRegistry ? (
          <div className="mt-8 w-full max-w-2xl space-y-4 text-left">
            {enabledWarehouses.map((warehouse) => {
              const warehouseToolboxes = enabledToolboxes.filter((toolbox) => toolbox.warehouseId === warehouse.id);
              return (
                <section key={warehouse.id} className="rounded-2xl border border-border bg-card/80 p-4 shadow-lg">
                  <div className="mb-3 flex items-center gap-3">
                    <WarehouseIcon className="h-6 w-6 text-primary" />
                    <div>
                      <h2 className="font-semibold">{warehouse.name}</h2>
                      {warehouse.description && <p className="text-xs text-muted-foreground">{warehouse.description}</p>}
                    </div>
                  </div>
                  {warehouseToolboxes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No toolboxes are enabled.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {warehouseToolboxes.map((toolbox) => {
                        const toolboxPouches = enabledPouches.filter((pouch) => pouch.toolboxId === toolbox.id);
                        return (
                          <div key={toolbox.id} className="rounded-xl border border-border/70 bg-background/50 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Box className="h-4 w-4 text-primary" />
                              <h3 className="font-medium">{toolbox.name}</h3>
                            </div>
                            {toolboxPouches.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No pouches are enabled.</p>
                            ) : (
                              <div className="space-y-2">
                                {toolboxPouches.map((pouch) => (
                                  <button
                                    key={pouch.id}
                                    className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-primary/20"
                                    onClick={() => openPouch(toolbox.id, pouch.id)}
                                  >
                                    <Package className="h-4 w-4 text-primary" />
                                    <span>{pouch.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <button
            className="mt-8 w-full max-w-md rounded-2xl bg-primary py-10 text-2xl font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:brightness-110 active:scale-[0.99]"
            onClick={() => {
              window.location.href = "/tech";
            }}
          >
            <ShieldCheck className="mx-auto mb-3 h-8 w-8" />
            CHECK IN / OUT
          </button>
        )}

        {toolboxOutages.length > 0 && (
          <div className="mt-4 w-full max-w-2xl space-y-2 text-left">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active outage modes</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {toolboxOutages.map((outage) => {
                const toolbox = enabledToolboxes.find((entry) => entry.id === outage.toolboxId);
                return (
                  <button
                    key={outage.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 text-left text-base font-semibold shadow-sm transition-all hover:bg-muted/50 active:scale-[0.99]"
                    onClick={() => {
                      window.location.href = `/outage?toolbox=${encodeURIComponent(outage.toolboxId ?? "")}`;
                    }}
                  >
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <span>
                      <span className="block">Outage Mode ({toolbox?.name ?? "Toolbox"})</span>
                      <span className="block text-xs font-normal text-muted-foreground">{outage.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
          window.location.href = "/admin";
        }}
      />
    </div>
  );
}
