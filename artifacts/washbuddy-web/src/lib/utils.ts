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

export function formatDate(dateString: string | undefined | null, formatStr = "MMM d, yyyy • h:mm a") {
  if (!dateString) return "N/A";
  try {
    return format(parseISO(dateString), formatStr);
  } catch (e) {
    return dateString;
  }
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
