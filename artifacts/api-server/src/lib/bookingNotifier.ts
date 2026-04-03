/**
 * Booking lifecycle notification orchestrator.
 *
 * Sends both in-app notifications and emails for every booking state transition.
 * All functions are fire-and-forget — errors are logged but never thrown.
 */

import { prisma } from "@workspace/db";
import { createNotification } from "./notifications";
import { sendEmail } from "./emailService";
import * as templates from "./emailTemplates";
import { logger } from "./logger";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email || null;
}

async function getProviderAdmins(providerId: string): Promise<Array<{ userId: string; email: string; firstName: string }>> {
  const members = await prisma.providerMembership.findMany({
    where: { providerId, role: "PROVIDER_ADMIN", isActive: true },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });
  return members.map((m) => ({ userId: m.user.id, email: m.user.email, firstName: m.user.firstName }));
}

async function loadBookingFull(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      location: {
        select: {
          id: true, name: true, addressLine1: true, city: true, regionCode: true, postalCode: true,
          timezone: true, providerId: true,
          provider: { select: { id: true, name: true } },
        },
      },
      service: { select: { name: true } },
      customer: { select: { id: true, email: true, firstName: true, lastName: true } },
      vehicle: { select: { unitNumber: true } },
    },
  });
}

async function findAlternatives(locationId: string): Promise<Array<{ name: string; address: string }>> {
  try {
    const nearby = await prisma.location.findMany({
      where: { id: { not: locationId }, isVisible: true, provider: { isActive: true, approvalStatus: "APPROVED" } },
      include: { provider: { select: { name: true } } },
      take: 3,
    });
    return nearby.map((l) => ({
      name: `${l.provider.name} — ${l.name}`,
      address: [l.addressLine1, l.city, l.regionCode].filter(Boolean).join(", "),
    }));
  } catch { return []; }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Notification Functions ─────────────────────────────────────────────────

export async function notifyBookingRequested(bookingId: string): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    const admins = await getProviderAdmins(b.location.providerId);
    const customerName = `${b.customer.firstName} ${b.customer.lastName}`;

    // In-app + email to provider admins
    for (const admin of admins) {
      await createNotification(admin.userId, {
        subject: "New booking request",
        body: `${customerName} requested ${b.serviceNameSnapshot} at ${b.location.name} on ${fmtDate(b.scheduledStartAtUtc)}.`,
        actionUrl: "/provider",
        metadata: { bookingId: b.id, type: "BOOKING_REQUESTED" },
      });
      await sendEmail({ to: admin.email, ...templates.bookingRequested({
        providerName: admin.firstName, customerName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, scheduledDate: fmtDate(b.scheduledStartAtUtc),
        scheduledTime: fmtTime(b.scheduledStartAtUtc), responseDeadlineMinutes: 5,
        actionUrl: "/provider",
      })});
    }

    // In-app to customer
    await createNotification(b.customer.id, {
      subject: "Booking submitted",
      body: `Your request for ${b.serviceNameSnapshot} at ${b.location.name} has been submitted. The provider will respond shortly.`,
      actionUrl: `/bookings/${b.id}`,
      metadata: { bookingId: b.id, type: "BOOKING_SUBMITTED" },
    });
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingRequested failed"); }
}

export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    const address = [b.location.addressLine1, b.location.city, b.location.regionCode, b.location.postalCode].filter(Boolean).join(", ");

    await createNotification(b.customer.id, {
      subject: "Booking confirmed",
      body: `Your ${b.serviceNameSnapshot} at ${b.location.name} on ${fmtDate(b.scheduledStartAtUtc)} at ${fmtTime(b.scheduledStartAtUtc)} is confirmed.`,
      actionUrl: `/bookings/${b.id}`,
      metadata: { bookingId: b.id, type: "BOOKING_CONFIRMED" },
    });

    const email = await getUserEmail(b.customer.id);
    if (email) {
      await sendEmail({ to: email, ...templates.bookingConfirmed({
        customerName: b.customer.firstName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, locationAddress: address,
        scheduledDate: fmtDate(b.scheduledStartAtUtc), scheduledTime: fmtTime(b.scheduledStartAtUtc),
        actionUrl: `/bookings/${b.id}`,
      })});
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingConfirmed failed"); }
}

export async function notifyBookingDeclined(bookingId: string, reasonCode?: string): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    const alternatives = await findAlternatives(b.location.id);
    const reason = reasonCode?.replace(/_/g, " ").toLowerCase() || "provider declined";

    await createNotification(b.customer.id, {
      subject: "Booking declined",
      body: `Your request for ${b.serviceNameSnapshot} at ${b.location.name} was declined. Reason: ${reason}.`,
      actionUrl: "/search",
      metadata: { bookingId: b.id, type: "BOOKING_DECLINED" },
    });

    const email = await getUserEmail(b.customer.id);
    if (email) {
      await sendEmail({ to: email, ...templates.bookingDeclined({
        customerName: b.customer.firstName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, reason, alternatives,
        actionUrl: "/search",
      })});
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingDeclined failed"); }
}

export async function notifyBookingCancelled(bookingId: string, cancelledBy: "customer" | "provider"): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    const cancellerLabel = cancelledBy === "customer" ? `${b.customer.firstName} ${b.customer.lastName}` : b.location.provider.name;
    const scheduledDate = fmtDate(b.scheduledStartAtUtc);

    if (cancelledBy === "customer") {
      // Notify provider
      const admins = await getProviderAdmins(b.location.providerId);
      for (const admin of admins) {
        await createNotification(admin.userId, {
          subject: "Booking cancelled by customer",
          body: `${b.customer.firstName} ${b.customer.lastName} cancelled their ${b.serviceNameSnapshot} at ${b.location.name} on ${scheduledDate}.`,
          actionUrl: "/provider",
          metadata: { bookingId: b.id, type: "BOOKING_CANCELLED" },
        });
        await sendEmail({ to: admin.email, ...templates.bookingCancelled({
          recipientName: admin.firstName, cancelledBy: cancellerLabel,
          serviceName: b.serviceNameSnapshot, locationName: b.location.name,
          scheduledDate, actionUrl: "/provider",
        })});
      }
    } else {
      // Notify customer
      await createNotification(b.customer.id, {
        subject: "Booking cancelled by provider",
        body: `${b.location.provider.name} cancelled your ${b.serviceNameSnapshot} on ${scheduledDate}. We apologize for the inconvenience.`,
        actionUrl: "/search",
        metadata: { bookingId: b.id, type: "BOOKING_CANCELLED" },
      });
      const email = await getUserEmail(b.customer.id);
      if (email) {
        await sendEmail({ to: email, ...templates.bookingCancelled({
          recipientName: b.customer.firstName, cancelledBy: cancellerLabel,
          serviceName: b.serviceNameSnapshot, locationName: b.location.name,
          scheduledDate, actionUrl: "/search",
        })});
      }
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingCancelled failed"); }
}

export async function notifyBookingCompleted(bookingId: string): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    await createNotification(b.customer.id, {
      subject: "Wash complete!",
      body: `Your ${b.serviceNameSnapshot} at ${b.location.name} is finished. Leave a review to help other drivers.`,
      actionUrl: `/bookings/${b.id}`,
      metadata: { bookingId: b.id, type: "BOOKING_COMPLETED" },
    });

    const email = await getUserEmail(b.customer.id);
    if (email) {
      await sendEmail({ to: email, ...templates.bookingCompleted({
        customerName: b.customer.firstName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, actionUrl: `/bookings/${b.id}`,
      })});
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingCompleted failed"); }
}

export async function notifyProviderApproved(providerId: string): Promise<void> {
  try {
    const provider = await prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } });
    if (!provider) return;

    const admins = await getProviderAdmins(providerId);
    for (const admin of admins) {
      await createNotification(admin.userId, {
        subject: "Listing approved!",
        body: `Your WashBuddy listing "${provider.name}" has been approved. You're now visible to customers.`,
        actionUrl: "/provider",
        metadata: { type: "PROVIDER_APPROVED" },
      });
      await sendEmail({ to: admin.email, ...templates.providerApproved({
        providerName: provider.name, actionUrl: "/provider",
      })});
    }
  } catch (err) { logger.error({ err, providerId }, "notifyProviderApproved failed"); }
}

export async function notifyWashRequestSubmitted(washRequestId: string, fleetId: string): Promise<void> {
  try {
    const req = await prisma.washRequest.findUnique({
      where: { id: washRequestId },
      include: {
        vehicle: { select: { unitNumber: true } },
        driver: { select: { firstName: true, lastName: true } },
        desiredLocation: { select: { name: true, provider: { select: { name: true } } } },
      },
    });
    if (!req) return;

    const fleetAdmins = await prisma.fleetMembership.findMany({
      where: { fleetId, role: "FLEET_ADMIN", isActive: true },
      include: { user: { select: { id: true, email: true, firstName: true } } },
    });

    const driverName = `${req.driver.firstName} ${req.driver.lastName}`;
    const vehicleUnit = req.vehicle?.unitNumber || "Unknown";
    const providerName = req.desiredLocation?.provider?.name || "Flexible";
    const locationName = req.desiredLocation?.name || "Any location";

    for (const fm of fleetAdmins) {
      await createNotification(fm.user.id, {
        subject: `Wash request from ${driverName}`,
        body: `${driverName} submitted a wash request for ${vehicleUnit} at ${providerName} — ${locationName}.`,
        actionUrl: `/fleet/requests/${washRequestId}`,
        metadata: { washRequestId, type: "WASH_REQUEST_SUBMITTED" },
      });
      await sendEmail({ to: fm.user.email, ...templates.washRequestSubmitted({
        fleetAdminName: fm.user.firstName, driverName, vehicleUnit,
        providerName, locationName, actionUrl: `/fleet/requests/${washRequestId}`,
      })});
    }
  } catch (err) { logger.error({ err, washRequestId }, "notifyWashRequestSubmitted failed"); }
}
