/**
 * Persistent active-vehicle indicator + switcher. Renders inline at the
 * top of pages where a driver makes a booking decision (Find a Wash,
 * Route Planner, Location Detail). Click opens a small popover that
 * lists eligible vehicles and a link to manage them.
 *
 * If the user has zero eligible vehicles the pill renders an
 * "Add a vehicle" empty state instead, with a CTA to /vehicles. The
 * parent page should also gate its primary action on this state.
 */

import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui";
import { ChevronDown, Plus, Settings, Star, Truck } from "lucide-react";
import { useActiveVehicle, type ActiveVehicleRow } from "@/contexts/activeVehicle";
import {
  BODY_TYPE_ICON,
  BODY_TYPE_LABEL,
  BODY_TYPE_STYLE,
  deriveSizeClassFromLengthInches,
  inchesToFeet,
  normalizeBodyType,
  SIZE_CLASS_LABEL,
  vehicleDisplayName,
} from "@/lib/vehicleBodyType";

export function ActiveVehiclePill({ className }: { className?: string }) {
  const { loading, activeVehicle, eligibleVehicles, hasAnyVehicle, setActive } = useActiveVehicle();
  const [, setNav] = useLocation();
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

  if (loading) {
    return <div className={`h-12 w-72 bg-slate-100 rounded-2xl animate-pulse ${className || ""}`} />;
  }

  if (!hasAnyVehicle) {
    return (
      <div className={`flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl ${className || ""}`}>
        <div className="h-9 w-9 bg-amber-100 rounded-xl flex items-center justify-center">
          <Truck className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-amber-900">No vehicle set</p>
          <p className="text-xs text-amber-800/80">Add a vehicle to start booking washes.</p>
        </div>
        <Button size="sm" onClick={() => setNav("/vehicles")}><Plus className="h-3.5 w-3.5 mr-1" /> Add Vehicle</Button>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative inline-block ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 pl-3 pr-4 py-2 bg-white border-2 border-slate-200 rounded-2xl hover:border-slate-300 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeVehicle ? <PillContent vehicle={activeVehicle} /> : <span className="text-sm text-slate-500">No active vehicle</span>}
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wider text-slate-500">Switch Vehicle</div>
          <ul role="listbox" className="max-h-72 overflow-y-auto">
            {eligibleVehicles.map((v) => (
              <li key={v.id}>
                <button
                  role="option"
                  aria-selected={v.isDefault}
                  type="button"
                  onClick={async () => { await setActive(v.id); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 ${v.isDefault ? "bg-primary/5" : ""}`}
                >
                  <PillContent vehicle={v} compact />
                  {v.isDefault && <Star className="h-4 w-4 text-primary fill-primary ml-auto" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { setOpen(false); setNav("/vehicles"); }}
            className="w-full px-4 py-3 text-sm font-semibold text-primary border-t hover:bg-slate-50 flex items-center gap-2"
          >
            <Settings className="h-4 w-4" /> Manage vehicles →
          </button>
        </div>
      )}
    </div>
  );
}

function PillContent({ vehicle, compact }: { vehicle: ActiveVehicleRow; compact?: boolean }) {
  const bt = normalizeBodyType(vehicle.bodyType);
  const style = BODY_TYPE_STYLE[bt];
  const Icon = BODY_TYPE_ICON[bt];
  const sizeClass = deriveSizeClassFromLengthInches(vehicle.lengthInches);
  const lengthFeet = inchesToFeet(vehicle.lengthInches);
  return (
    <>
      <div className={`h-8 w-8 ${style.chipBg} rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`h-4 w-4 ${style.chipFg}`} />
      </div>
      <div className="text-left min-w-0">
        <p className="font-bold text-sm text-slate-900 truncate leading-tight">{vehicleDisplayName(vehicle)}</p>
        <p className="text-xs text-slate-500 truncate leading-tight">
          {BODY_TYPE_LABEL[bt]}{lengthFeet != null ? ` · ${lengthFeet} ft` : ""}{!compact && sizeClass ? ` · ${SIZE_CLASS_LABEL[sizeClass]}` : ""}
        </p>
      </div>
    </>
  );
}
