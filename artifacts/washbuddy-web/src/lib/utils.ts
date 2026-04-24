import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(cents / 100);
}

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  EXTRA_LARGE: "Extra Large",
};

/** Human-readable label for a vehicle class enum value. Unknown values
 * pass through with underscores replaced by spaces for graceful fallback. */
export function formatVehicleClass(cls: string | null | undefined): string {
  if (!cls) return "";
  return VEHICLE_CLASS_LABELS[cls] ?? cls.replace(/_/g, " ");
}

/**
 * Project the wall-clock components of a UTC date into the given IANA
 * timezone, returned as a "faux-local" Date whose getHours/getDate/etc.
 * match what a viewer in that timezone would see. Intended only as a
 * vehicle for passing components into date-fns — do not convert back
 * with toISOString().
 */
function dateInTimezone(d: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hourStr = get("hour");
  const hour = hourStr === "24" ? 0 : parseInt(hourStr, 10);
  return new Date(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    hour,
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );
}

export function formatDate(
  dateString: string | undefined | null,
  formatStr = "MMM d, yyyy • h:mm a",
  timezone?: string,
) {
  if (!dateString) return "N/A";
  try {
    const parsed = parseISO(dateString);
    const source = timezone ? dateInTimezone(parsed, timezone) : parsed;
    return format(source, formatStr);
  } catch (e) {
    return dateString;
  }
}

/**
 * Convert a local wall-clock date+time in the given IANA timezone to a
 * UTC Date, DST-aware. Mirrors the backend's timezone.ts implementation
 * without crossing the HTTP boundary.
 */
export function localDateTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  const approxUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(approxUtc);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const actualH = hourStr === "24" ? 0 : parseInt(hourStr, 10);
  const actualM = parseInt(minuteStr, 10);
  const [targetH, targetM] = timeStr.split(":").map(Number);
  const diffMinutes = (targetH * 60 + targetM) - (actualH * 60 + actualM);
  return new Date(approxUtc.getTime() + diffMinutes * 60 * 1000);
}

export function getStatusColor(status: string) {
  switch (status) {
    case "REQUESTED":
    case "HELD":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "PROVIDER_CONFIRMED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "CHECKED_IN":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "IN_SERVICE":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "COMPLETED_PENDING_WINDOW":
    case "COMPLETED":
    case "SETTLED":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "CUSTOMER_CANCELLED":
    case "PROVIDER_CANCELLED":
    case "PROVIDER_DECLINED":
    case "EXPIRED":
    case "NO_SHOW":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

export function getStatusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
