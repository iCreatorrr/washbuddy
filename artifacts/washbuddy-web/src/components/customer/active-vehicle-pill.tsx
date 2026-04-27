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
  bodyTypeStyleFor,
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is rendered with position:fixed at JS-computed coordinates so
  // it never gets cropped by an inline-block parent or pulled off-screen
  // by a simple `right-0` anchor. Coordinates are recomputed on resize and
  // any ancestor scroll while the menu is open.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  // Position the menu under the trigger, anchored to the trigger's right edge
  // when there's room on the left, otherwise clamped to a safe viewport gutter.
  // Width caps at min(320, viewport - 16) so the menu always fits with breathing
  // room. Recomputes on resize / scroll so the menu tracks the trigger.
  useEffect(() => {
    if (!open) { setMenuPos(null); return; }
    const compute = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const gutter = 8;
      const idealWidth = 320;
      const width = Math.min(idealWidth, Math.max(240, vw - gutter * 2));
      let left = rect.right - width; // try to right-align to the trigger
      if (left < gutter) left = gutter;
      if (left + width > vw - gutter) left = vw - gutter - width;
      const top = rect.bottom + 8;
      setMenuPos({ top, left, width });
    };
    compute();
    window.addEventListener("resize", compute);
    // Capture-phase scroll listener so we react to any scrolling ancestor,
    // not just the window — Find a Wash sometimes sits inside a flex-column
    // that scrolls.
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        // Single-line pill, ~44px tall: small size-class badge + nickname
        // · body type + chevron. Drops the prior 2-line layout (icon chip
        // + 2 lines of text + py-2 + border-2 ≈ 53px) so the pill costs
        // less above-the-fold real estate on phones. py-2.5 keeps the
        // tap target above the 44px iOS floor.
        className="flex items-center gap-2 pl-2 pr-3 py-2.5 bg-white border border-slate-200 rounded-full hover:border-slate-300 transition-colors max-w-full"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {activeVehicle ? <PillContentCompact vehicle={activeVehicle} /> : <span className="text-sm text-slate-500 px-2">No active vehicle</span>}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && menuPos && (
        // position:fixed at JS-computed coords; `left` is clamped to the
        // viewport's safe gutter so the menu can never have a negative
        // left, which is the trap right-anchored absolute dropdowns fall
        // into when the trigger sits in the left half of a narrow phone.
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          className="z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b text-xs font-bold uppercase tracking-wider text-slate-500">Switch Vehicle</div>
          <ul role="listbox" className="max-h-72 overflow-y-auto">
            {eligibleVehicles.map((v) => (
              <li key={v.id}>
                <button
                  role="option"
                  aria-selected={v.isDefault}
                  type="button"
                  onClick={async () => { await setActive(v.id); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 min-w-0 ${v.isDefault ? "bg-primary/5" : ""}`}
                >
                  <DropdownItemContent vehicle={v} active={v.isDefault} />
                  {v.isDefault && <Star className="h-4 w-4 text-primary fill-primary ml-auto shrink-0" />}
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

/** Compact, single-line trigger content — small size-class badge on
 * the left, "nickname · body type" inline. The body-type chip is gone
 * (it duplicated the colour signal of the size badge); long names
 * truncate via min-w-0 so the trigger never grows past the row width. */
function PillContentCompact({ vehicle }: { vehicle: ActiveVehicleRow }) {
  const bt = normalizeBodyType(vehicle.bodyType);
  const sizeClass = deriveSizeClassFromLengthInches(vehicle.lengthInches);
  // Size-class abbreviations: S / M / L / XL — matches Daily Board's
  // booking-card size avatar so providers and drivers see the same
  // shorthand for vehicle scale.
  const sizeAbbrev: Record<string, string> = { SMALL: "S", MEDIUM: "M", LARGE: "L", EXTRA_LARGE: "XL" };
  const sizeBadge = sizeClass ? sizeAbbrev[sizeClass] : null;
  // Reuse the size-class colour palette from BODY_TYPE_STYLE, scaled
  // down to a small inline chip.
  const style = BODY_TYPE_STYLE[bt];
  return (
    <>
      {sizeBadge && (
        <span className={`inline-flex items-center justify-center h-6 min-w-[28px] px-1 rounded-full text-[11px] font-bold shrink-0 ${style.chipBg} ${style.chipFg}`}>
          {sizeBadge}
        </span>
      )}
      <span className="text-sm font-semibold text-slate-900 truncate min-w-0">
        {vehicleDisplayName(vehicle)}
        <span className="font-normal text-slate-500">{` · ${BODY_TYPE_LABEL[bt]}`}</span>
      </span>
    </>
  );
}

function PillContent({ vehicle, compact, active }: { vehicle: ActiveVehicleRow; compact?: boolean; active?: boolean }) {
  const bt = normalizeBodyType(vehicle.bodyType);
  const style = bodyTypeStyleFor(bt, !!active);
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

/** Dropdown menu item rendering. The active vehicle keeps its full
 * body-type colored chip; non-active items get an outline-only chip
 * (white interior, body-type colored border + glyph) so the active
 * row dominates by reduction of the rest. */
function DropdownItemContent({ vehicle, active }: { vehicle: ActiveVehicleRow; active: boolean }) {
  const bt = normalizeBodyType(vehicle.bodyType);
  const Icon = BODY_TYPE_ICON[bt];
  const fullStyle = BODY_TYPE_STYLE[bt];
  const sizeClass = deriveSizeClassFromLengthInches(vehicle.lengthInches);
  const lengthFeet = inchesToFeet(vehicle.lengthInches);
  return (
    <>
      {active ? (
        <div className={`h-8 w-8 ${fullStyle.chipBg} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${fullStyle.chipFg}`} />
        </div>
      ) : (
        <div className={`h-8 w-8 bg-white rounded-lg border ${fullStyle.border} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${fullStyle.text}`} strokeWidth={1.75} />
        </div>
      )}
      <div className="text-left min-w-0">
        <p className={`font-bold text-sm truncate leading-tight ${active ? "text-slate-900" : "text-slate-700"}`}>{vehicleDisplayName(vehicle)}</p>
        <p className="text-xs text-slate-500 truncate leading-tight">
          {BODY_TYPE_LABEL[bt]}{lengthFeet != null ? ` · ${lengthFeet} ft` : ""}{sizeClass ? ` · ${SIZE_CLASS_LABEL[sizeClass]}` : ""}
        </p>
      </div>
    </>
  );
}
