/**
 * Single source of truth for vehicle visual styling and length-class
 * derivation on the web client. Mirrors `bayMatching.ts` on the API side
 * for the class bands.
 *
 * Important: bodyType drives ONLY visual identification (icon + color
 * stripe). Length drives operational behavior (bay compatibility, pricing,
 * duration) via deriveSizeClassFromLengthInches.
 */

import { Bus, Truck, type LucideIcon } from "lucide-react";

export type BodyType = "COACH" | "SCHOOL_BUS" | "SHUTTLE" | "TRANSIT_BUS" | "OTHER";

export const BODY_TYPES: BodyType[] = ["COACH", "SCHOOL_BUS", "SHUTTLE", "TRANSIT_BUS", "OTHER"];

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  COACH: "Coach",
  SCHOOL_BUS: "School Bus",
  SHUTTLE: "Shuttle",
  TRANSIT_BUS: "Transit Bus",
  OTHER: "Other",
};

/** Tailwind tokens grouped per body type. Muted by design — these colors
 * appear as subtle accents (icon tint, left stripe, dot) alongside neutral
 * card chrome. Don't introduce additional saturation: keep the page calm. */
export const BODY_TYPE_STYLE: Record<BodyType, {
  /** Used for the colored left stripe on cards/list items. */
  stripe: string;
  /** Background+text combo for icon chips and small badges. */
  chipBg: string;
  chipFg: string;
  /** Plain text color (e.g. for inline labels next to neutral text). */
  text: string;
  /** A solid dot color for compact UIs (provider rows). */
  dot: string;
  /** Soft border tint matching the family. */
  border: string;
}> = {
  COACH:       { stripe: "bg-slate-500",  chipBg: "bg-slate-100",  chipFg: "text-slate-700",  text: "text-slate-700",  dot: "bg-slate-500",  border: "border-slate-200" },
  SCHOOL_BUS:  { stripe: "bg-amber-500",  chipBg: "bg-amber-100",  chipFg: "text-amber-800",  text: "text-amber-800",  dot: "bg-amber-500",  border: "border-amber-200" },
  SHUTTLE:     { stripe: "bg-emerald-600",chipBg: "bg-emerald-100",chipFg: "text-emerald-800",text: "text-emerald-800",dot: "bg-emerald-600",border: "border-emerald-200" },
  TRANSIT_BUS: { stripe: "bg-zinc-500",   chipBg: "bg-zinc-100",   chipFg: "text-zinc-700",   text: "text-zinc-700",   dot: "bg-zinc-500",   border: "border-zinc-200" },
  OTHER:       { stripe: "bg-stone-400",  chipBg: "bg-stone-100",  chipFg: "text-stone-700",  text: "text-stone-700",  dot: "bg-stone-400",  border: "border-stone-200" },
};

export const BODY_TYPE_ICON: Record<BodyType, LucideIcon> = {
  COACH: Bus,
  SCHOOL_BUS: Bus,
  SHUTTLE: Bus,
  TRANSIT_BUS: Bus,
  OTHER: Truck,
};

/** Coerce arbitrary string → BodyType, falling back to OTHER. Used when
 * receiving a raw `bodyType` field over the wire. */
export function normalizeBodyType(raw: string | null | undefined): BodyType {
  if (!raw) return "OTHER";
  const upper = raw.toUpperCase();
  return (BODY_TYPES as string[]).includes(upper) ? (upper as BodyType) : "OTHER";
}

// ─── Length-derived size class ──────────────────────────────────────────────

export type SizeClass = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";

export const SIZE_CLASS_LABEL: Record<SizeClass, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  EXTRA_LARGE: "Extra Large",
};

const FEET_PER_INCH = 1 / 12;

/** Same bands as the API's `deriveVehicleClassFromLength`, in feet. */
export function deriveSizeClassFromLengthFeet(lengthFeet: number | null | undefined): SizeClass | null {
  if (typeof lengthFeet !== "number" || !Number.isFinite(lengthFeet) || lengthFeet <= 0) return null;
  if (lengthFeet < 25) return "SMALL";
  if (lengthFeet < 35) return "MEDIUM";
  if (lengthFeet < 45) return "LARGE";
  return "EXTRA_LARGE";
}

/** Same bands as the API's `deriveVehicleClassFromLength`, in inches. */
export function deriveSizeClassFromLengthInches(lengthInches: number | null | undefined): SizeClass | null {
  if (typeof lengthInches !== "number" || !Number.isFinite(lengthInches) || lengthInches <= 0) return null;
  if (lengthInches < 300) return "SMALL";
  if (lengthInches < 420) return "MEDIUM";
  if (lengthInches < 540) return "LARGE";
  return "EXTRA_LARGE";
}

export function inchesToFeet(inches: number | null | undefined): number | null {
  if (typeof inches !== "number" || !Number.isFinite(inches) || inches <= 0) return null;
  return Math.round(inches * FEET_PER_INCH);
}

export function feetToInches(feet: number): number {
  return Math.round(feet * 12);
}

/** "Coach-203" if nickname; else "NEB-101" unit number. */
export function vehicleDisplayName(v: { nickname?: string | null; unitNumber: string }): string {
  return v.nickname?.trim() || v.unitNumber;
}
