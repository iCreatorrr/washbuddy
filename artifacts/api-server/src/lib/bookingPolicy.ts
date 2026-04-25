/**
 * Booking-policy constants shared between availability, hold creation, and UI.
 *
 * Lead-time policy (per current PRD):
 *   - Driver platform bookings have NO hard lead-time block. Past slots are
 *     not bookable, but any future slot is. Slots that start within
 *     SHORT_NOTICE_THRESHOLD_MINUTES of `now` are flagged so the UI can show
 *     a confirmation modal — never a server-side block.
 *   - Provider walk-in / phone-in bookings: zero lead time, no confirmation.
 *     The customer is on-site.
 *   - Fleet auto-bookings (subscriptions, recurring schedules): no lead-time
 *     enforcement, no confirmation. Operators schedule these deliberately.
 */

export const SHORT_NOTICE_THRESHOLD_MINUTES = 30;
