type BookingStatus =
  | "REQUESTED"
  | "HELD"
  | "PROVIDER_CONFIRMED"
  | "PROVIDER_DECLINED"
  | "EXPIRED"
  | "CUSTOMER_CANCELLED"
  | "PROVIDER_CANCELLED"
  | "LATE"
  | "NO_SHOW"
  | "CHECKED_IN"
  | "IN_SERVICE"
  | "COMPLETED_PENDING_WINDOW"
  | "COMPLETED"
  | "DISPUTED"
  | "REFUNDED"
  | "SETTLED";

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  REQUESTED: ["HELD", "PROVIDER_CONFIRMED", "PROVIDER_DECLINED", "EXPIRED", "CUSTOMER_CANCELLED"],
  HELD: ["PROVIDER_CONFIRMED", "PROVIDER_DECLINED", "EXPIRED", "CUSTOMER_CANCELLED"],
  PROVIDER_CONFIRMED: ["CUSTOMER_CANCELLED", "PROVIDER_CANCELLED", "LATE", "CHECKED_IN"],
  PROVIDER_DECLINED: [],
  EXPIRED: [],
  CUSTOMER_CANCELLED: [],
  PROVIDER_CANCELLED: [],
  LATE: ["CHECKED_IN", "NO_SHOW", "CUSTOMER_CANCELLED"],
  NO_SHOW: ["COMPLETED", "DISPUTED"],
  CHECKED_IN: ["IN_SERVICE", "PROVIDER_CANCELLED"],
  IN_SERVICE: ["COMPLETED_PENDING_WINDOW"],
  COMPLETED_PENDING_WINDOW: ["COMPLETED", "DISPUTED"],
  COMPLETED: ["DISPUTED", "SETTLED"],
  DISPUTED: ["REFUNDED", "SETTLED", "COMPLETED"],
  REFUNDED: ["SETTLED"],
  SETTLED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getAllowedTransitions(from: BookingStatus): BookingStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

export function isActiveBooking(status: BookingStatus): boolean {
  return [
    "REQUESTED", "HELD", "PROVIDER_CONFIRMED", "LATE", "CHECKED_IN", "IN_SERVICE",
  ].includes(status);
}

export function isCancellable(status: BookingStatus): boolean {
  return ["REQUESTED", "HELD", "PROVIDER_CONFIRMED", "LATE"].includes(status);
}
