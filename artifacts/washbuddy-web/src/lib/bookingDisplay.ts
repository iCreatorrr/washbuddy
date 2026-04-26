/**
 * Single source for "what name do I show for this booking?".
 *
 * Order of preference:
 *   1. Customer first + last name (platform booking with a registered driver)
 *   2. Customer first name only
 *   3. Off-platform client name (walk-ins / direct bookings)
 *   4. Driver first name resolved server-side (bay-timeline shape)
 *   5. Vehicle unit number (no client info but we know which bus)
 *   6. "Walk-in" as last resort
 *
 * Bay Timeline and Daily Board both render this. The resolver is
 * tolerant of the two distinct response shapes — the daily-board
 * endpoint surfaces `customer.firstName / customer.lastName +
 * offPlatformClientName`; the bay-timeline endpoint surfaces a
 * resolved `driverFirstName` string + `vehicleUnitNumber`.
 */

interface BookingNameShape {
  customer?: { firstName?: string | null; lastName?: string | null } | null;
  driverFirstName?: string | null;
  offPlatformClientName?: string | null;
  vehicleUnitNumber?: string | null;
  vehicle?: { unitNumber?: string | null } | null;
}

export function resolveBookingDisplayName(b: BookingNameShape): string {
  const first = b.customer?.firstName?.trim();
  const last = b.customer?.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (b.offPlatformClientName?.trim()) return b.offPlatformClientName.trim();
  if (b.driverFirstName?.trim()) return b.driverFirstName.trim();
  const unit = (b.vehicle?.unitNumber || b.vehicleUnitNumber)?.trim();
  if (unit) return unit;
  return "Walk-in";
}
