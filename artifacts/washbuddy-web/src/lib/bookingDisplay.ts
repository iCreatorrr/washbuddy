/**
 * Single source for "what name do I show for this booking?".
 *
 * Walk-in and direct bookings have a quirk: the off-platform creation
 * handler sets Booking.customerId = the operator (e.g. James) so the
 * booking has a valid customer FK, while the *actual* walk-in client's
 * name lives in Booking.offPlatformClientName. So when the booking is
 * off-platform, we MUST prefer offPlatformClientName regardless of
 * whether `customer` resolves to a user record — otherwise every walk-in
 * shows the operator's name on the boards.
 *
 * Order of preference:
 *   isOffPlatform (or bookingSource = WALK_IN/DIRECT):
 *     1. offPlatformClientName  (the name typed in the walk-in form)
 *     2. vehicle unit number
 *     3. "Walk-in"
 *   otherwise (platform driver booking):
 *     1. customer first + last
 *     2. customer first
 *     3. driverFirstName (bay-timeline pre-resolved string)
 *     4. vehicle unit number
 *     5. "Walk-in"
 *
 * Bay Timeline and Daily Board both render this. The resolver is
 * tolerant of the two distinct response shapes — the daily-board
 * endpoint surfaces `customer.firstName / customer.lastName +
 * offPlatformClientName + isOffPlatform`; the bay-timeline endpoint
 * surfaces a resolved `driverFirstName` string + `vehicleUnitNumber`.
 */

interface BookingNameShape {
  customer?: { firstName?: string | null; lastName?: string | null } | null;
  driverFirstName?: string | null;
  offPlatformClientName?: string | null;
  isOffPlatform?: boolean | null;
  bookingSource?: string | null;
  vehicleUnitNumber?: string | null;
  vehicle?: { unitNumber?: string | null } | null;
}

function isOffPlatformBooking(b: BookingNameShape): boolean {
  if (b.isOffPlatform === true) return true;
  const source = (b.bookingSource || "").toUpperCase();
  return source === "WALK_IN" || source === "DIRECT";
}

export function resolveBookingDisplayName(b: BookingNameShape): string {
  const unit = (b.vehicle?.unitNumber || b.vehicleUnitNumber)?.trim();

  if (isOffPlatformBooking(b)) {
    const walkInName = b.offPlatformClientName?.trim();
    if (walkInName) return walkInName;
    if (unit) return unit;
    return "Walk-in";
  }

  const first = b.customer?.firstName?.trim();
  const last = b.customer?.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (b.driverFirstName?.trim()) return b.driverFirstName.trim();
  if (unit) return unit;
  return "Walk-in";
}
