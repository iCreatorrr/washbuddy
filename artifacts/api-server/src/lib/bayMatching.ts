/**
 * Bay auto-assignment logic — shared between the driver-side availability
 * query and the platform booking creation endpoint.
 *
 * The pure function `pickTightestFit` is the heart of the selection rule
 * (tightest fit by supportedClasses length, ties broken by name) and is
 * unit-tested in isolation against in-memory fixtures. The DB-aware wrapper
 * `findAvailableBayTx` pulls the candidate bays + overlapping bookings + the
 * location operating windows and hands them to the pure function.
 */

import { isWithinOperatingHours } from "./timezone";

// ─── Vehicle class derivation ───────────────────────────────────────────────

export type VehicleClass = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";
export const VEHICLE_CLASSES: VehicleClass[] = ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"];

/**
 * Map a vehicle length in inches to its class, matching the PRD/EID bands:
 *   SMALL       <25ft  (<300in)
 *   MEDIUM      25–35ft (300–419in)
 *   LARGE       35–45ft (420–539in)
 *   EXTRA_LARGE 45ft+   (≥540in)
 * Returns null for invalid input (≤0) so callers can surface a specific error.
 */
export function deriveVehicleClassFromLength(lengthInches: number | null | undefined): VehicleClass | null {
  if (typeof lengthInches !== "number" || !Number.isFinite(lengthInches) || lengthInches <= 0) return null;
  if (lengthInches < 300) return "SMALL";
  if (lengthInches < 420) return "MEDIUM";
  if (lengthInches < 540) return "LARGE";
  return "EXTRA_LARGE";
}

/**
 * Normalize a free-form string into a VehicleClass, or null if invalid.
 * Used when reading Booking.fleetPlaceholderClass (a free String field).
 */
export function normalizeVehicleClass(value: string | null | undefined): VehicleClass | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (VEHICLE_CLASSES as string[]).includes(upper) ? (upper as VehicleClass) : null;
}

// ─── Pure selection logic ───────────────────────────────────────────────────

export interface BayCandidate {
  id: string;
  name: string;
  supportedClasses: string[];
  isActive: boolean;
  outOfServiceSince: Date | null;
  outOfServiceEstReturn: Date | null;
}

export interface BookingWindow {
  washBayId: string | null;
  scheduledStartAtUtc: Date;
  scheduledEndAtUtc: Date;
}

/**
 * Out-of-service covers the requested window when the bay is flagged
 * out-of-service AND either has no estimated return OR the return is after
 * the requested window ends.
 */
export function isBayOutOfServiceForWindow(bay: BayCandidate, windowEnd: Date): boolean {
  if (!bay.outOfServiceSince) return false;
  if (!bay.outOfServiceEstReturn) return true;
  return bay.outOfServiceEstReturn.getTime() > windowEnd.getTime();
}

/**
 * Pick the tightest-fitting bay for a vehicle class and time window.
 *
 * Filters:
 *   - bay is active
 *   - supportedClasses includes the requested class
 *   - not in an out-of-service window covering the booking
 *   - no existing booking on that bay overlaps [startUtc, endUtc)
 *
 * Sort:
 *   - fewest supportedClasses first (tightest fit)
 *   - name asc, numeric-aware ("Bay 2" < "Bay 10")
 */
export function pickTightestFit(
  bays: BayCandidate[],
  existing: BookingWindow[],
  vehicleClass: VehicleClass,
  startUtc: Date,
  endUtc: Date,
): BayCandidate | null {
  const startMs = startUtc.getTime();
  const endMs = endUtc.getTime();

  const busyBayIds = new Set<string>();
  for (const b of existing) {
    if (!b.washBayId) continue;
    const bStart = b.scheduledStartAtUtc.getTime();
    const bEnd = b.scheduledEndAtUtc.getTime();
    if (bStart < endMs && bEnd > startMs) busyBayIds.add(b.washBayId);
  }

  const viable = bays.filter((bay) => {
    if (!bay.isActive) return false;
    if (!bay.supportedClasses.includes(vehicleClass)) return false;
    if (isBayOutOfServiceForWindow(bay, endUtc)) return false;
    if (busyBayIds.has(bay.id)) return false;
    return true;
  });

  if (viable.length === 0) return null;

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  viable.sort((a, b) => {
    const diff = a.supportedClasses.length - b.supportedClasses.length;
    if (diff !== 0) return diff;
    return collator.compare(a.name, b.name);
  });

  return viable[0];
}

// ─── DB-aware wrapper ───────────────────────────────────────────────────────

export interface OperatingWindow {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

const EXCLUDED_BOOKING_STATUSES = [
  "CUSTOMER_CANCELLED",
  "PROVIDER_CANCELLED",
  "PROVIDER_DECLINED",
  "EXPIRED",
  "NO_SHOW",
];

/**
 * Given a Prisma transaction (or the default client), find a bay that can
 * host the requested booking window. Returns null if none is free OR the
 * window falls outside operating hours.
 *
 * Accepts any Prisma.TransactionClient; we avoid typing it strictly so this
 * module stays usable from both `prisma.$transaction(async tx => ...)` and
 * the default client.
 */
export async function findAvailableBayTx(
  tx: any,
  params: {
    locationId: string;
    vehicleClass: VehicleClass;
    startUtc: Date;
    durationMins: number;
  },
): Promise<BayCandidate | null> {
  const { locationId, vehicleClass, startUtc, durationMins } = params;
  const endUtc = new Date(startUtc.getTime() + durationMins * 60 * 1000);

  const location = await tx.location.findUnique({
    where: { id: locationId },
    select: {
      timezone: true,
      operatingWindows: { select: { dayOfWeek: true, openTime: true, closeTime: true } },
    },
  });
  if (!location) return null;

  // The booking must fit entirely inside a single operating window. Because
  // isWithinOperatingHours only answers "is this instant open?", we verify
  // BOTH endpoints (start and the last minute of the service). The operating
  // windows table doesn't support overnight crossings, so if both endpoints
  // are open it's safe to assume continuity.
  const lastInstant = new Date(endUtc.getTime() - 1);
  const startOpen = isWithinOperatingHours(startUtc, location.timezone, location.operatingWindows);
  const endOpen = isWithinOperatingHours(lastInstant, location.timezone, location.operatingWindows);
  if (!startOpen || !endOpen) return null;

  const bays = await tx.washBay.findMany({
    where: { locationId },
    select: {
      id: true,
      name: true,
      supportedClasses: true,
      isActive: true,
      outOfServiceSince: true,
      outOfServiceEstReturn: true,
      displayOrder: true,
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  if (bays.length === 0) return null;

  const bayIds = bays.map((b: BayCandidate) => b.id);
  const existing = await tx.booking.findMany({
    where: {
      washBayId: { in: bayIds },
      status: { notIn: EXCLUDED_BOOKING_STATUSES as any },
      scheduledStartAtUtc: { lt: endUtc },
      scheduledEndAtUtc: { gt: startUtc },
    },
    select: { washBayId: true, scheduledStartAtUtc: true, scheduledEndAtUtc: true },
  });

  return pickTightestFit(bays, existing, vehicleClass, startUtc, endUtc);
}

/**
 * Resolve the booking duration for a service × vehicle class pair. Falls
 * back to Service.durationMins if no per-class override exists.
 */
export async function resolveServiceDuration(
  tx: any,
  serviceId: string,
  vehicleClass: VehicleClass,
): Promise<number | null> {
  const pricing = await tx.servicePricing.findUnique({
    where: { serviceId_vehicleClass: { serviceId, vehicleClass } },
    select: { durationMins: true, isAvailable: true },
  });
  if (pricing && pricing.isAvailable) return pricing.durationMins;

  const svc = await tx.service.findUnique({ where: { id: serviceId }, select: { durationMins: true } });
  return svc?.durationMins ?? null;
}
