import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, Button, Input, Label, Badge } from "@/components/ui";
import { Plus, Star, Trash2, X, AlertTriangle, Lock, MoreVertical } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useActiveVehicle, type ActiveVehicleRow } from "@/contexts/activeVehicle";
import {
  BODY_TYPE_ICON,
  BODY_TYPE_LABEL,
  bodyTypeStyleFor,
  BODY_TYPES,
  deriveSizeClassFromLengthFeet,
  feetToInches,
  inchesToFeet,
  normalizeBodyType,
  SIZE_CLASS_LABEL,
  vehicleDisplayName,
  type BodyType,
  type SizeClass,
} from "@/lib/vehicleBodyType";

const API_BASE = import.meta.env.VITE_API_URL || "";

type VehicleRow = ActiveVehicleRow;

interface FutureBookingsResp {
  count: number;
  firstBookingId: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { credentials: "include", ...init });
  if (!r.ok) {
    const d: any = await r.json().catch(() => ({}));
    const err: any = new Error(d.message || `HTTP ${r.status}`);
    err.status = r.status;
    err.errorCode = d.errorCode;
    err.payload = d;
    throw err;
  }
  return r.json();
}

export default function MyVehicles() {
  const [, setNav] = useLocation();
  const { allVehicles: vehicles, loading, refresh, setActive } = useActiveVehicle();
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ vehicle: VehicleRow; future: FutureBookingsResp } | null>(null);

  const setDefault = async (vehicleId: string) => {
    // setActive performs the PATCH, then refresh()es the shared context.
    // Every consumer (pills on Find a Wash, Route Planner, location-detail,
    // booking summary) sees the new active vehicle without a page reload.
    await setActive(vehicleId);
    toast.success("Active vehicle updated");
  };

  const requestDelete = async (v: VehicleRow) => {
    try {
      const future = await api<FutureBookingsResp>(`/api/vehicles/${v.id}/future-bookings`);
      setPendingDelete({ vehicle: v, future });
    } catch (e: any) {
      toast.error(e?.message || "Could not check upcoming bookings");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { vehicle } = pendingDelete;
    try {
      await api(`/api/vehicles/${vehicle.id}`, { method: "DELETE" });
      toast.success(`Removed ${vehicleDisplayName(vehicle)}`);
      setPendingDelete(null);
      await refresh();
    } catch (e: any) {
      if (e?.errorCode === "DEFAULT_VEHICLE_DELETE_BLOCKED") {
        toast.error(e.message);
      } else {
        toast.error(e?.message || "Failed to delete");
      }
      setPendingDelete(null);
    }
  };

  const ownedVehicles = vehicles.filter((v) => v.isOwnedByUser);
  const fleetVehicles = vehicles.filter((v) => !v.isOwnedByUser);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">My Vehicles</h1>
          <p className="text-slate-500 mt-2">Pick one as your active vehicle for booking — its size class drives bay compatibility, pricing, and duration.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" /> Add Vehicle</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => <Card key={i} className="h-24 animate-pulse bg-slate-100 border-none" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-8">
          {ownedVehicles.length > 0 && (
            <Section title="My Vehicles">
              <VehicleGrid vehicles={ownedVehicles} onSetDefault={setDefault} onDelete={requestDelete} />
            </Section>
          )}
          {fleetVehicles.length > 0 && (
            <Section title="Fleet-Assigned" subtitle="Managed by your fleet — read-only here, but can still be set as your active vehicle.">
              <VehicleGrid vehicles={fleetVehicles} onSetDefault={setDefault} onDelete={null} />
            </Section>
          )}
        </div>
      )}

      {showForm && (
        <AddVehicleModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); void refresh(); }}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          state={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          onNavigate={(href) => { setPendingDelete(null); setNav(href); }}
        />
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-0.5 mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function VehicleGrid({
  vehicles,
  onSetDefault,
  onDelete,
}: {
  vehicles: VehicleRow[];
  onSetDefault: (id: string) => void;
  onDelete: ((v: VehicleRow) => void) | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {vehicles.map((v) => (
        <VehicleCard key={v.id} vehicle={v} onSetDefault={onSetDefault} onDelete={onDelete} />
      ))}
    </div>
  );
}

function VehicleCard({
  vehicle,
  onSetDefault,
  onDelete,
}: {
  vehicle: VehicleRow;
  onSetDefault: (id: string) => void;
  onDelete: ((v: VehicleRow) => void) | null;
}) {
  const bodyType = normalizeBodyType(vehicle.bodyType);
  // Prominence by reduction: the active card gets full body-type colour,
  // every other card desaturates so the eye lands on the active one
  // without any louder treatment on its part.
  const style = bodyTypeStyleFor(bodyType, vehicle.isDefault);
  const Icon = BODY_TYPE_ICON[bodyType];
  const lengthFeet = inchesToFeet(vehicle.lengthInches);
  const sizeClass = deriveSizeClassFromLengthFeet(lengthFeet);
  const display = vehicleDisplayName(vehicle);
  const secondary = vehicle.nickname?.trim() ? vehicle.unitNumber : null;

  // Active card pops with full body-type colour + ring + soft tint;
  // every other card collapses to a plain white card with a slate
  // border, slate text, and a much-muted icon chip — no green/yellow
  // tints, no body-type background fill on the chip. The contrast
  // between active and inactive needs to be unmissable on a list.
  const cardClass = vehicle.isDefault
    ? "ring-2 ring-primary shadow-md bg-primary/[0.03]"
    : "border border-slate-200 bg-white";
  const stripeClass = vehicle.isDefault ? style.stripe : "bg-slate-200";
  const chipBgClass = vehicle.isDefault ? style.chipBg : "bg-slate-50";
  const chipFgClass = vehicle.isDefault ? style.chipFg : "text-slate-400";

  return (
    <Card className={`relative overflow-hidden p-0 transition-shadow ${cardClass}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${stripeClass}`} aria-hidden />
      <div className="p-5 pl-6 flex items-start gap-4">
        <div className={`h-12 w-12 ${chipBgClass} rounded-xl flex items-center justify-center shrink-0`}>
          <Icon className={`h-6 w-6 ${chipFgClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className={`flex-1 min-w-0 truncate text-lg ${vehicle.isDefault ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}>{display}</h3>
            {vehicle.isDefault && (
              <Badge className="bg-primary/10 text-primary border-primary/20 shrink-0"><Star className="h-3 w-3 mr-1 fill-primary" />Active</Badge>
            )}
            {!vehicle.isOwnedByUser && (
              <Badge className="bg-slate-100 text-slate-600 border-slate-200 shrink-0"><Lock className="h-3 w-3 mr-1" />{vehicle.fleet?.name || "Fleet"}</Badge>
            )}
            {onDelete && vehicle.isOwnedByUser && (
              <VehicleKebabMenu vehicle={vehicle} onDelete={onDelete} />
            )}
          </div>
          <div className={`flex items-center gap-2 mt-1 text-sm ${vehicle.isDefault ? "text-slate-500" : "text-slate-400"}`}>
            {secondary && <span className="font-mono uppercase tracking-wider">{secondary}</span>}
            {secondary && <span>·</span>}
            <span>{BODY_TYPE_LABEL[bodyType]}</span>
            {lengthFeet != null && (<><span>·</span><span>{lengthFeet} ft</span></>)}
            {sizeClass && (<><span>·</span><span>{SIZE_CLASS_LABEL[sizeClass]}</span></>)}
          </div>
          {!vehicle.isDefault && vehicle.isEligibleForDefault && (
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => onSetDefault(vehicle.id)} className="border-slate-300 text-slate-600 hover:text-slate-900">
                <Star className="h-3.5 w-3.5 mr-1" /> Set as active
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Per-card kebab menu. Single destructive action today (Remove
 * vehicle) but extensible — the kebab pattern keeps the card calm
 * even when more actions land later. The menu item is red to signal
 * destruction; the trigger itself is neutral so it doesn't compete
 * with the active card's accent. */
function VehicleKebabMenu({ vehicle, onDelete }: { vehicle: VehicleRow; onDelete: (v: VehicleRow) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Vehicle actions"
        className="p-1 -mr-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(vehicle); }}
            className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove vehicle
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
      <div className="h-16 w-16 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Plus className="h-8 w-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">Add a vehicle to start booking washes</h3>
      <p className="text-slate-500 mt-1 max-w-md mx-auto">Your active vehicle's size and class drive what services and time slots you'll see.</p>
      <Button className="mt-5" onClick={onAdd}><Plus className="h-4 w-4 mr-2" /> Add Vehicle</Button>
    </div>
  );
}

function AddVehicleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [unitNumber, setUnitNumber] = useState("");
  const [bodyType, setBodyType] = useState<BodyType>("COACH");
  const [lengthFeetStr, setLengthFeetStr] = useState("");
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lengthFeet = parseInt(lengthFeetStr, 10);
  const lengthValid = Number.isFinite(lengthFeet) && lengthFeet >= 15 && lengthFeet <= 75;
  const lengthClass: SizeClass | null = lengthValid ? deriveSizeClassFromLengthFeet(lengthFeet) : null;

  const canSubmit = unitNumber.trim().length > 0 && lengthValid;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const created = await api<{ vehicle: VehicleRow; autoSetAsDefault?: boolean }>("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber: unitNumber.trim(),
          bodyType,
          lengthInches: feetToInches(lengthFeet),
          nickname: nickname.trim() || undefined,
        }),
      });
      toast.success(created.autoSetAsDefault ? `${vehicleDisplayName(created.vehicle)} added and set as your active vehicle` : `${vehicleDisplayName(created.vehicle)} added`);
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add vehicle");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-bold text-slate-900">Add Vehicle</h2>
          <button type="button" onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg" aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          <div>
            <Label>Unit Number *</Label>
            <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value.slice(0, 20))} placeholder="e.g. NEB-101" required maxLength={20} />
          </div>

          <div>
            <Label>Body Type *</Label>
            <select
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value as BodyType)}
              className="w-full h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white"
            >
              {BODY_TYPES.map((b) => (
                <option key={b} value={b}>{BODY_TYPE_LABEL[b]}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Length (feet) *</Label>
            <Input
              type="number"
              min={15}
              max={75}
              value={lengthFeetStr}
              onChange={(e) => setLengthFeetStr(e.target.value)}
              placeholder="e.g. 38"
            />
            {lengthFeetStr && !lengthValid && (
              <p className="text-xs text-red-600 mt-1">Please enter a length between 15 and 75 ft.</p>
            )}
            {lengthValid && lengthClass && (
              <p className="text-xs text-slate-500 mt-1">= {SIZE_CLASS_LABEL[lengthClass]} vehicle</p>
            )}
          </div>

          <div>
            <Label>Nickname <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
            <Input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 40))} placeholder="e.g. Coach-203" maxLength={40} />
          </div>
        </div>

        <div className="p-4 border-t shrink-0 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={!canSubmit || submitting} isLoading={submitting}>Add Vehicle</Button>
        </div>
      </form>
    </div>
  );
}

function DeleteConfirmModal({
  state,
  onCancel,
  onConfirm,
  onNavigate,
}: {
  state: { vehicle: VehicleRow; future: FutureBookingsResp };
  onCancel: () => void;
  onConfirm: () => void;
  onNavigate: (href: string) => void;
}) {
  const { vehicle, future } = state;
  const display = vehicleDisplayName(vehicle);

  // Branch on future-bookings count: 0 → confirm, 1 → link to that booking,
  // 2+ → link to filtered My Bookings.
  if (future.count === 0) {
    return (
      <Modal title="Delete vehicle?" onClose={onCancel}>
        <p className="text-sm text-slate-600">Are you sure you want to delete <span className="font-semibold">{display}</span>? This can't be undone.</p>
        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={onConfirm}>Delete</Button>
        </div>
      </Modal>
    );
  }

  if (future.count === 1 && future.firstBookingId) {
    return (
      <Modal title="Cancel your upcoming booking first" onClose={onCancel} icon="warn">
        <p className="text-sm text-slate-600">You have 1 upcoming booking for <span className="font-semibold">{display}</span>. Please cancel it before deleting.</p>
        <div className="flex gap-2 mt-5">
          <Button variant="outline" className="flex-1" onClick={onCancel}>Close</Button>
          <Button className="flex-1" onClick={() => onNavigate(`/bookings/${future.firstBookingId}`)}>Open booking</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Cancel your upcoming bookings first" onClose={onCancel} icon="warn">
      <p className="text-sm text-slate-600">You have {future.count} upcoming bookings for <span className="font-semibold">{display}</span>. Please cancel them before deleting.</p>
      <div className="flex gap-2 mt-5">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Close</Button>
        <Button className="flex-1" onClick={() => onNavigate(`/bookings?vehicleId=${vehicle.id}`)}>View bookings</Button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, icon }: { title: string; children: React.ReactNode; onClose: () => void; icon?: "warn" }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          {icon === "warn" && (
            <div className="p-2 bg-amber-100 rounded-xl"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
          )}
          <h3 className="text-lg font-bold text-slate-900 flex-1">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}
