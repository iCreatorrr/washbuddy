/**
 * Customer-facing display strings for cancellation reason codes.
 *
 * Reason codes are produced by the provider-side cancellation dialog
 * (cancel-booking-dialog.tsx) and persisted on Booking.cancellationReasonCode.
 * These strings render on the booking-detail page and the My Bookings
 * cancelled card so the customer sees the same wording everywhere.
 *
 * Keep in sync with the dialog's REASON_OPTIONS and the server's
 * VALID_CANCELLATION_REASONS set in routes/bookings.ts.
 *
 * Internal-only fields (cancellationNote on the booking record) are
 * NEVER surfaced through this map — those stay in provider records.
 */

export type CancellationReasonCode =
  | "CUSTOMER_REQUESTED"
  | "PROVIDER_UNAVAILABLE"
  | "CUSTOMER_NO_SHOW"
  | "OTHER";

const CUSTOMER_FACING_REASON_LABELS: Record<CancellationReasonCode, string> = {
  CUSTOMER_REQUESTED: "Cancelled per customer request",
  PROVIDER_UNAVAILABLE: "Provider unable to service",
  CUSTOMER_NO_SHOW: "Customer no-show",
  OTHER: "Cancelled",
};

export function customerFacingCancellationLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  // Tolerate legacy/unknown codes by returning null — caller suppresses
  // the line entirely rather than rendering a raw enum value.
  if (code in CUSTOMER_FACING_REASON_LABELS) {
    return CUSTOMER_FACING_REASON_LABELS[code as CancellationReasonCode];
  }
  return null;
}
