import React, { useState, useEffect } from "react";
import { Card, Badge, Button, Label } from "@/components/ui";
import { Repeat, Package, Truck, Calendar, DollarSign, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

function getFleetId(user: any): string | null {
  return user?.roles?.find((r: any) => r.role === "FLEET_ADMIN" && r.scopeId)?.scopeId || null;
}

export default function FleetSubscriptions() {
  const { user } = useAuth();
  const fleetId = getFleetId(user);
  const [subs, setSubs] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribePkg, setSubscribePkg] = useState<any>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!fleetId) return;
    Promise.all([
      fetch(`${API_BASE}/api/fleets/${fleetId}/subscriptions`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE}/api/fleets/${fleetId}/available-subscriptions`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE}/api/fleets/${fleetId}/vehicles`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([subData, pkgData, vehData]) => {
      setSubs(subData.subscriptions || []);
      setPackages(pkgData.packages || []);
      setVehicles(vehData.vehicles || []);
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, [fleetId]);

  const handleCancel = async (subId: string) => {
    if (!confirm("Cancel this subscription?")) return;
    try {
      await fetch(`${API_BASE}/api/fleets/${fleetId}/subscriptions/${subId}/cancel`, { method: "PATCH", credentials: "include" });
      toast.success("Subscription cancelled");
      setSubs((prev) => prev.map((s) => s.id === subId ? { ...s, status: "CANCELLED" } : s));
    } catch { toast.error("Failed to cancel"); }
  };

  const handleSubscribe = async () => {
    if (selectedVehicleIds.length === 0) { toast.error("Select at least one vehicle"); return; }
    setSubscribing(true);
    try {
      // Create a subscription for each selected vehicle
      for (const vehicleId of selectedVehicleIds) {
        const r = await fetch(`${API_BASE}/api/fleets/${fleetId}/subscriptions`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: subscribePkg.id,
            vehicleId,
            startDate: new Date().toISOString(),
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          toast.error(err.message || `Failed to subscribe vehicle`);
        }
      }
      toast.success(`Subscribed ${selectedVehicleIds.length} vehicle${selectedVehicleIds.length > 1 ? "s" : ""}`);
      setSubscribePkg(null);
      setSelectedVehicleIds([]);
      // Refresh
      const subData = await fetch(`${API_BASE}/api/fleets/${fleetId}/subscriptions`, { credentials: "include" }).then((r) => r.json());
      setSubs(subData.subscriptions || []);
    } catch {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  const activeSubs = subs.filter((s) => s.status === "ACTIVE");

  if (!fleetId) return <div className="p-8 text-center text-slate-500">No fleet access.</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-slate-900">Subscriptions</h1>
        <p className="text-slate-500 mt-1">Manage recurring wash packages for your fleet vehicles.</p>
      </div>

      {/* Active Subscriptions */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Active Subscriptions ({activeSubs.length})</h2>
        {activeSubs.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <Repeat className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No active subscriptions. Browse packages below.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSubs.map((s) => (
              <Card key={s.id} className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-slate-900">{s.package?.name}</h3>
                    <p className="text-sm text-slate-500">{s.package?.provider?.name} — {s.package?.location?.name}</p>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <span className="flex items-center gap-1 text-slate-600"><Truck className="h-3.5 w-3.5" />{s.vehicle?.unitNumber}</span>
                  <span className="flex items-center gap-1 text-slate-600"><DollarSign className="h-3.5 w-3.5" />{formatCurrency(s.package?.pricePerWashMinor || 0)} /wash</span>
                  <span className="flex items-center gap-1 text-slate-600"><Calendar className="h-3.5 w-3.5" />{s.totalWashesCompleted} washes done</span>
                  <span className="flex items-center gap-1 text-green-600">Save $5/wash vs. standard</span>
                </div>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => handleCancel(s.id)}>Cancel</Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Browse Packages */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Available Packages ({packages.length})</h2>
        {isLoading ? (
          <div className="space-y-4">{[1,2].map((i) => <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />)}</div>
        ) : packages.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No subscription packages available yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((p: any) => (
              <Card key={p.id} className="p-5 hover:border-primary/30 transition-colors">
                <h3 className="font-bold text-slate-900 mb-1">{p.name}</h3>
                <p className="text-sm text-slate-500 mb-3">{p.provider?.name} — {p.location?.name}</p>
                <div className="space-y-1 text-sm text-slate-600 mb-4">
                  <p>Cadence: {p.cadence}</p>
                  <p>Price: {formatCurrency(p.pricePerWashMinor, p.currencyCode)} per wash</p>
                  <p>Min commitment: {p.minWashes} washes</p>
                </div>
                <Button size="sm" className="w-full" onClick={() => { setSubscribePkg(p); setSelectedVehicleIds([]); }}>Subscribe</Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Subscribe Dialog */}
      <Dialog open={!!subscribePkg} onOpenChange={(o) => !o && setSubscribePkg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Subscribe to {subscribePkg?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {subscribePkg?.provider?.name} — {formatCurrency(subscribePkg?.pricePerWashMinor || 0)} per wash, {subscribePkg?.cadence?.toLowerCase()}
            </p>
            <div>
              <Label>Select Vehicles</Label>
              <div className="space-y-1.5 mt-1 max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2">
                {vehicles.length === 0 ? (
                  <p className="text-sm text-slate-400 py-2 text-center">No vehicles available</p>
                ) : vehicles.map((v: any) => (
                  <label key={v.id} className="flex items-center gap-2 cursor-pointer text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.includes(v.id)}
                      onChange={(e) =>
                        setSelectedVehicleIds((prev) =>
                          e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id)
                        )
                      }
                    />
                    <Truck className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{v.unitNumber}</span>
                    <span className="text-slate-400">{v.subtypeCode?.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
              {selectedVehicleIds.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">{selectedVehicleIds.length} vehicle{selectedVehicleIds.length > 1 ? "s" : ""} selected</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscribePkg(null)}>Cancel</Button>
            <Button onClick={handleSubscribe} disabled={subscribing || selectedVehicleIds.length === 0}>
              {subscribing ? "Subscribing..." : `Subscribe ${selectedVehicleIds.length} Vehicle${selectedVehicleIds.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
