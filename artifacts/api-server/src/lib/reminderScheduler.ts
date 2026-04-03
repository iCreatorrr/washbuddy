/**
 * Booking Reminder Scheduler — sends reminders before scheduled washes.
 *
 * Runs every 5 minutes. Sends reminders for:
 *   - Same-day bookings starting within 1-2 hours
 *   - Next-day bookings (12-36 hours out) — morning reminder
 *
 * Uses PostgreSQL advisory lock to prevent duplicate runs across instances.
 */

import { prisma } from "@workspace/db";
import { createNotification } from "./notifications";
import { sendEmail } from "./emailService";
import { bookingReminder } from "./emailTemplates";
import { logger } from "./logger";

const REMINDER_LOCK_ID = 8675310; // Distinct from SLA enforcer lock

/**
 * Format a UTC date in a location's timezone for display.
 */
function formatInTimezone(utcDate: Date, timezone: string): { date: string; time: string } {
  const date = utcDate.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = utcDate.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return { date, time };
}

/**
 * Find and send reminders for upcoming confirmed bookings.
 */
async function sendUpcomingReminders(): Promise<number> {
  const now = new Date();
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const thirtySixHoursFromNow = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  // Category 1: Same-day — starting within 1-2 hours
  const sameDay = await prisma.booking.findMany({
    where: {
      status: "PROVIDER_CONFIRMED",
      reminderSentAt: null,
      scheduledStartAtUtc: { gt: now, lte: twoHoursFromNow },
    },
    include: {
      customer: { select: { id: true, email: true, firstName: true } },
      location: { select: { name: true, addressLine1: true, city: true, regionCode: true, postalCode: true, timezone: true } },
      service: { select: { name: true } },
    },
    take: 50,
  });

  // Category 2: Next-day — 12-36 hours out
  const nextDay = await prisma.booking.findMany({
    where: {
      status: "PROVIDER_CONFIRMED",
      reminderSentAt: null,
      scheduledStartAtUtc: { gt: twelveHoursFromNow, lte: thirtySixHoursFromNow },
    },
    include: {
      customer: { select: { id: true, email: true, firstName: true } },
      location: { select: { name: true, addressLine1: true, city: true, regionCode: true, postalCode: true, timezone: true } },
      service: { select: { name: true } },
    },
    take: 50,
  });

  // Deduplicate (a booking could match both windows if edge-case timing)
  const seen = new Set<string>();
  const bookings = [...sameDay, ...nextDay].filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  if (bookings.length === 0) return 0;

  let sentCount = 0;

  for (const b of bookings) {
    try {
      const tz = b.location.timezone || "America/New_York";
      const { date: scheduledDate, time: scheduledTime } = formatInTimezone(b.scheduledStartAtUtc, tz);
      const address = [b.location.addressLine1, b.location.city, b.location.regionCode, b.location.postalCode].filter(Boolean).join(", ");

      // In-app notification
      await createNotification(b.customer.id, {
        subject: "Booking reminder",
        body: `Reminder: Your ${b.serviceNameSnapshot} at ${b.location.name} is scheduled for ${scheduledDate} at ${scheduledTime}.`,
        actionUrl: `/bookings/${b.id}`,
        metadata: { bookingId: b.id, type: "BOOKING_REMINDER" },
      });

      // Email notification
      if (b.customer.email) {
        await sendEmail({
          to: b.customer.email,
          ...bookingReminder({
            customerName: b.customer.firstName,
            serviceName: b.serviceNameSnapshot,
            locationName: b.location.name,
            locationAddress: address,
            scheduledDate,
            scheduledTime,
            actionUrl: `/bookings/${b.id}`,
          }),
        });
      }

      // Mark as reminded
      await prisma.booking.update({
        where: { id: b.id },
        data: { reminderSentAt: new Date() },
      });

      sentCount++;
      logger.info({ bookingId: b.id, customerEmail: b.customer.email }, "Sent booking reminder");
    } catch (err) {
      logger.error({ err, bookingId: b.id }, "Failed to send reminder for booking");
    }
  }

  return sentCount;
}

/**
 * Main processing function with advisory lock.
 */
async function processReminders(): Promise<void> {
  const lockResult = await prisma.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
    `SELECT pg_try_advisory_lock(${REMINDER_LOCK_ID})`,
  );

  if (!lockResult[0]?.pg_try_advisory_lock) {
    logger.debug("Reminder scheduler: skipped — another instance holds the lock");
    return;
  }

  try {
    const count = await sendUpcomingReminders();
    if (count > 0) {
      logger.info({ sentCount: count }, "Reminder scheduler: run complete");
    }
  } finally {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${REMINDER_LOCK_ID})`);
  }
}

/**
 * Start the reminder scheduler as a recurring interval. Call once on server boot.
 */
export function startReminderScheduler(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
  logger.info({ intervalMs }, "Reminder scheduler: starting background job");

  // Run once immediately
  processReminders().catch((err) => logger.error({ err }, "Reminder scheduler: initial run failed"));

  const timer = setInterval(async () => {
    try {
      await processReminders();
    } catch (err) {
      logger.error({ err }, "Reminder scheduler: unhandled error in background run");
    }
  }, intervalMs);

  return timer;
}
