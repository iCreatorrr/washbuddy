/**
 * Timezone utilities using the built-in Intl API.
 * No external libraries required — Node.js supports IANA timezone IDs natively.
 */

export interface LocalTimeInfo {
  /** Day of week: 0=Sunday through 6=Saturday */
  dayOfWeek: number;
  /** Hours (0-23) in the local timezone */
  hours: number;
  /** Minutes (0-59) in the local timezone */
  minutes: number;
  /** HH:MM string in the local timezone */
  timeString: string;
}

/**
 * Get the local time components for a UTC Date in the given IANA timezone.
 */
export function getLocalTimeInfo(utcDate: Date, timezone: string): LocalTimeInfo {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(utcDate);

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";

  const hours = parseInt(hourStr, 10) === 24 ? 0 : parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[weekday] ?? 0;

  return {
    dayOfWeek,
    hours,
    minutes,
    timeString: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

/**
 * Check if the given UTC time falls within any of the operating windows
 * for the location's timezone.
 */
export function isWithinOperatingHours(
  utcDate: Date,
  timezone: string,
  windows: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>,
): boolean {
  if (windows.length === 0) return false;

  const local = getLocalTimeInfo(utcDate, timezone);
  const currentMinutes = local.hours * 60 + local.minutes;

  return windows.some((w) => {
    if (w.dayOfWeek !== local.dayOfWeek) return false;
    const [openH, openM] = w.openTime.split(":").map(Number);
    const [closeH, closeM] = w.closeTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  });
}

/**
 * Find the next opening time (as a UTC Date) given operating windows
 * and the location's timezone. Returns null if no upcoming window found
 * within the next 7 days.
 */
export function getNextOpenAt(
  utcDate: Date,
  timezone: string,
  windows: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>,
): Date | null {
  if (windows.length === 0) return null;

  const local = getLocalTimeInfo(utcDate, timezone);
  const currentMinutes = local.hours * 60 + local.minutes;

  // Check remaining windows today (after current time)
  const todayWindows = windows
    .filter((w) => w.dayOfWeek === local.dayOfWeek)
    .sort((a, b) => a.openTime.localeCompare(b.openTime));

  for (const w of todayWindows) {
    const [openH, openM] = w.openTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    if (openMinutes > currentMinutes) {
      // This window opens later today
      const localDateStr = formatLocalDate(utcDate, timezone);
      return localTimeToUtc(localDateStr, w.openTime, timezone);
    }
  }

  // Check next 7 days
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const futureDate = new Date(utcDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const futureLocal = getLocalTimeInfo(futureDate, timezone);
    const dayWindows = windows
      .filter((w) => w.dayOfWeek === futureLocal.dayOfWeek)
      .sort((a, b) => a.openTime.localeCompare(b.openTime));

    if (dayWindows.length > 0) {
      const localDateStr = formatLocalDate(futureDate, timezone);
      return localTimeToUtc(localDateStr, dayWindows[0].openTime, timezone);
    }
  }

  return null;
}

/**
 * Get the local date string (YYYY-MM-DD) for a UTC Date in a timezone.
 */
export function formatLocalDate(utcDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(utcDate);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * Convert a local date + time string to a UTC Date.
 * dateStr: "YYYY-MM-DD", timeStr: "HH:MM", timezone: IANA timezone ID.
 *
 * Uses a binary search approach to find the UTC offset for the given local time,
 * handling DST transitions correctly.
 */
export function localTimeToUtc(dateStr: string, timeStr: string, timezone: string): Date {
  // Create an approximate UTC date (treating local as UTC initially)
  const approxUtc = new Date(`${dateStr}T${timeStr}:00Z`);

  // Get the offset by checking what local time this UTC time maps to.
  // If approxUtc 09:00Z shows as 05:00 local, the local-to-UTC offset is +4h,
  // so we need to ADD (target - actual) to get the correct UTC.
  const local = getLocalTimeInfo(approxUtc, timezone);
  const targetMinutes = parseInt(timeStr.split(":")[0], 10) * 60 + parseInt(timeStr.split(":")[1], 10);
  const actualMinutes = local.hours * 60 + local.minutes;
  const diffMinutes = targetMinutes - actualMinutes;

  // corrected = approxUtc + diff, which shifts UTC forward by the offset
  const corrected = new Date(approxUtc.getTime() + diffMinutes * 60 * 1000);

  return corrected;
}
