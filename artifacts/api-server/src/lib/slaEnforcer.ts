/**
 * SLA Enforcer — Background job that auto-expires bookings when providers
 * fail to respond within the SLA window (PRD Section 3.3).
 *
 * Runs every 60 seconds. Uses a PostgreSQL advisory lock to prevent
 * duplicate processing across multiple server instances.
 */

import { prisma } from "@workspace/db";
import { createNotification } from "./notifications";
import { sendEmail } from "./emailService";
import * as templates from "./emailTemplates";
import { logger } from "./logger";

const SLA_ENFORCER_LOCK_ID = 8675309; // Arbitrary advisory lock ID

/**
 * Get the monthly period boundaries for a given date.
 */
function getMonthlyPeriod(date: Date): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

/**
 * Upsert a ProviderResponseMetric record and increment the missedSla counter.
 */
async function incrementMissedSla(providerId: string, locationId: string): Promise<void> {
  const { periodStart, periodEnd } = getMonthlyPeriod(new Date());

  await prisma.providerResponseMetric.upsert({
    where: {
      providerId_locationId_periodStart: { providerId, locationId, periodStart },
    },
    create: {
      providerId,
      locationId,
      periodStart,
      periodEnd,
      totalRequests: 1,
      respondedInSla: 0,
      missedSla: 1,
    },
    update: {
      totalRequests: { increment: 1 },
      missedSla: { increment: 1 },
    },
  });
}

/**
 * Upsert a ProviderResponseMetric record and increment respondedInSla.
 * Called from confirm/decline handlers when a provider responds in time.
 */
export async function incrementRespondedInSla(
  providerId: string,
  locationId: string,
  responseTimeSecs?: number,
): Promise<void> {
  const { periodStart, periodEnd } = getMonthlyPeriod(new Date());

  await prisma.providerResponseMetric.upsert({
    where: {
      providerId_locationId_periodStart: { providerId, locationId, periodStart },
    },
    create: {
      providerId,
      locationId,
      periodStart,
      periodEnd,
      totalRequests: 1,
      respondedInSla: 1,
      missedSla: 0,
      avgResponseSecs: responseTimeSecs ?? null,
    },
    update: {
      totalRequests: { increment: 1 },
      respondedInSla: { increment: 1 },
      ...(responseTimeSecs != null ? { avgResponseSecs: responseTimeSecs } : {}),
    },
  });
}

/**
 * Core enforcement function — finds and expires overdue bookings.
 */
export async function enforceExpiredBookings(): Promise<number> {
  // Acquire advisory lock — skip if another instance is already running
  const lockResult = await prisma.$queryRawUnsafe<Array<{ pg_try_advisory_lock: boolean }>>(
    `SELECT pg_try_advisory_lock(${SLA_ENFORCER_LOCK_ID})`,
  );

  if (!lockResult[0]?.pg_try_advisory_lock) {
    logger.debug("SLA enforcer: skipped — another instance holds the lock");
    return 0;
  }

  try {
    const now = new Date();

    // Find all REQUESTED bookings past their response deadline
    const expiredBookings = await prisma.booking.findMany({
      where: {
        status: "REQUESTED",
        providerResponseDeadlineUtc: { lt: now },
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            providerId: true,
            provider: {
              select: {
                id: true,
                name: true,
                memberships: {
                  where: { role: "PROVIDER_ADMIN", isActive: true },
                  include: { user: { select: { id: true, email: true, firstName: true } } },
                  take: 5,
                },
              },
            },
          },
        },
        service: { select: { name: true } },
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (expiredBookings.length === 0) {
      return 0;
    }

    logger.info({ count: expiredBookings.length }, "SLA enforcer: expiring overdue bookings");

    let expiredCount = 0;

    for (const booking of expiredBookings) {
      try {
        // Transition to EXPIRED within a transaction
        await prisma.$transaction(async (tx) => {
          // Double-check status hasn't changed since our query
          const current = await tx.booking.findFirst({
            where: { id: booking.id, status: "REQUESTED" },
          });
          if (!current) return;

          // Update booking status
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: "EXPIRED" },
          });

          // Create status history record
          await tx.bookingStatusHistory.create({
            data: {
              bookingId: booking.id,
              fromStatus: "REQUESTED",
              toStatus: "EXPIRED",
              changedBy: null, // System-initiated
              reason: "Provider did not respond within SLA deadline",
            },
          });

          // Release any active booking holds
          await tx.bookingHold.updateMany({
            where: { bookingId: booking.id, isReleased: false },
            data: { isReleased: true },
          });
        });

        // Notify the customer
        const scheduledDate = booking.scheduledStartAtUtc.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

        await createNotification(booking.customer.id, {
          subject: "Booking request expired",
          body: `Your booking request for ${booking.service.name} at ${booking.location.name} on ${scheduledDate} expired because the provider didn't respond in time. Try searching for another location nearby.`,
          actionUrl: `/search`,
          metadata: {
            bookingId: booking.id,
            locationId: booking.location.id,
            type: "BOOKING_EXPIRED",
          },
        });

        // Email to customer
        if (booking.customer.email) {
          await sendEmail({ to: booking.customer.email, ...templates.bookingExpired({
            customerName: booking.customer.firstName, serviceName: booking.service.name,
            locationName: booking.location.name, alternatives: [], actionUrl: "/search",
          })});
        }

        // Notify provider admin(s)
        const providerAdmins = booking.location.provider.memberships;
        for (const admin of providerAdmins) {
          await createNotification(admin.user.id, {
            subject: "Missed booking request",
            body: `You missed a booking request for ${booking.service.name} at ${booking.location.name} on ${scheduledDate}. Repeated failures to respond during your operating hours will impact your platform rating.`,
            actionUrl: `/provider`,
            metadata: {
              bookingId: booking.id,
              locationId: booking.location.id,
              type: "PROVIDER_MISSED_SLA",
            },
          });
          // Email to provider
          const revenueLost = `$${(booking.serviceBasePriceMinor / 100).toFixed(2)}`;
          await sendEmail({ to: admin.user.email, ...templates.providerMissedSLA({
            providerName: admin.user.firstName, serviceName: booking.service.name,
            locationName: booking.location.name,
            customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
            revenueLost, actionUrl: "/provider",
          })});
        }

        // Update provider response metrics
        await incrementMissedSla(booking.location.providerId, booking.location.id);

        expiredCount++;
        logger.info(
          { bookingId: booking.id, locationName: booking.location.name },
          "SLA enforcer: booking expired",
        );
      } catch (err) {
        logger.error({ err, bookingId: booking.id }, "SLA enforcer: failed to expire booking");
      }
    }

    return expiredCount;
  } finally {
    // Always release the advisory lock
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${SLA_ENFORCER_LOCK_ID})`);
  }
}

/**
 * Start the SLA enforcer as a recurring interval. Call once on server boot.
 */
export function startSlaEnforcer(intervalMs: number = 60_000): NodeJS.Timeout {
  logger.info({ intervalMs }, "SLA enforcer: starting background job");

  const timer = setInterval(async () => {
    try {
      const count = await enforceExpiredBookings();
      if (count > 0) {
        logger.info({ expiredCount: count }, "SLA enforcer: run complete");
      }
    } catch (err) {
      logger.error({ err }, "SLA enforcer: unhandled error in background run");
    }
  }, intervalMs);

  return timer;
}
