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

/** Admins + staff for the provider org. Booking notifications go to
 * the whole front-of-house team: anyone who might check the new
 * booking in. Same shape as getProviderAdmins so callers can swap
 * helpers without restructuring their loops. Filtered to active
 * memberships only — terminated staff don't get pinged. */
async function getProviderTeam(providerId: string): Promise<Array<{ userId: string; email: string; firstName: string }>> {
  const members = await prisma.providerMembership.findMany({
    where: { providerId, role: { in: ["PROVIDER_ADMIN", "PROVIDER_STAFF"] }, isActive: true },
    include: { user: { select: { id: true, email: true, firstName: true } } },
  });
  // Dedupe by userId — a staff member with multiple location memberships
  // at the same provider would otherwise receive the same notification
  // once per membership.
  const seen = new Set<string>();
  const out: Array<{ userId: string; email: string; firstName: string }> = [];
  for (const m of members) {
    if (seen.has(m.user.id)) continue;
    seen.add(m.user.id);
    out.push({ userId: m.user.id, email: m.user.email, firstName: m.user.firstName });
  }
  return out;
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

    // Notify the whole provider team (admins + staff) — staff need to
    // know a request has landed since either role might respond. The
    // prior shape only notified PROVIDER_ADMIN, which left staff blind
    // to incoming requests on locations they operate.
    const admins = await getProviderTeam(b.location.providerId);
    const customerName = `${b.customer.firstName} ${b.customer.lastName}`;

    // In-app + email to provider team
    const bookingUrl = `/bookings/${b.id}`;
    for (const admin of admins) {
      await createNotification(admin.userId, {
        subject: "New booking request",
        body: `${customerName} requested ${b.serviceNameSnapshot} at ${b.location.name} on ${fmtDate(b.scheduledStartAtUtc)}.`,
        actionUrl: bookingUrl,
        metadata: { bookingId: b.id, type: "BOOKING_REQUESTED" },
      });
      await sendEmail({ to: admin.email, ...templates.bookingRequested({
        providerName: admin.firstName, customerName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, scheduledDate: fmtDate(b.scheduledStartAtUtc),
        scheduledTime: fmtTime(b.scheduledStartAtUtc), responseDeadlineMinutes: 5,
        actionUrl: bookingUrl,
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

    // Provider-side fan-out: PROVIDER_CONFIRMED is the instant-book
    // path — the prior shape only notified the customer, so providers
    // had no idea a booking had landed until they happened to open Bay
    // Timeline. Skip for off-platform / walk-in bookings since the
    // provider IS the creator there (no self-notify). Both PROVIDER_ADMIN
    // and PROVIDER_STAFF receive the notification; everyone with an
    // active membership at this provider org needs to know.
    if (b.bookingSource === "PLATFORM" && !b.isOffPlatform) {
      const team = await getProviderTeam(b.location.providerId);
      if (team.length > 0) {
        const customerName = `${b.customer.firstName} ${b.customer.lastName}`.trim();
        const dateStr = fmtDate(b.scheduledStartAtUtc);
        const timeStr = fmtTime(b.scheduledStartAtUtc);
        // "today" vs "for <date>" body wording — same-day awareness is
        // the load-bearing signal for providers; calling it out
        // explicitly avoids the "is this today?" mental tax.
        const today = new Date();
        const start = new Date(b.scheduledStartAtUtc);
        const isSameDay =
          today.getFullYear() === start.getFullYear() &&
          today.getMonth() === start.getMonth() &&
          today.getDate() === start.getDate();
        const whenPhrase = isSameDay ? `today at ${timeStr}` : `for ${dateStr} at ${timeStr}`;
        const body = `${customerName} booked ${b.serviceNameSnapshot} ${whenPhrase}.`;
        const actionUrl = `/bookings/${b.id}`;

        for (const member of team) {
          // In-app notification creation must succeed regardless of email
          // outcome. Email is fire-and-forget by sendEmail's contract;
          // if a single member's createNotification throws we still want
          // the others to receive theirs, so the loop body is wrapped.
          try {
            await createNotification(member.userId, {
              subject: "New booking",
              body,
              actionUrl,
              metadata: { bookingId: b.id, type: "BOOKING_RECEIVED_BY_PROVIDER", isSameDay },
            });
          } catch (perMemberErr) {
            logger.error({ err: perMemberErr, bookingId: b.id, userId: member.userId }, "createNotification failed for provider team member");
          }
          if (member.email && isSameDay) {
            await sendEmail({ to: member.email, ...templates.newBookingForProvider({
              recipientName: member.firstName, customerName, serviceName: b.serviceNameSnapshot,
              locationName: b.location.name, scheduledDate: dateStr, scheduledTime: timeStr,
              isSameDay, actionUrl,
            })});
          }
        }
      }
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingConfirmed failed"); }
}

export async function notifyBookingDeclined(bookingId: string, reasonCode?: string): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    const alternatives = await findAlternatives(b.location.id);
    const reason = reasonCode?.replace(/_/g, " ").toLowerCase() || "provider declined";

    const bookingUrl = `/bookings/${b.id}`;
    await createNotification(b.customer.id, {
      subject: "Booking declined",
      body: `Your request for ${b.serviceNameSnapshot} at ${b.location.name} was declined. Reason: ${reason}.`,
      actionUrl: bookingUrl,
      metadata: { bookingId: b.id, type: "BOOKING_DECLINED" },
    });

    const email = await getUserEmail(b.customer.id);
    if (email) {
      await sendEmail({ to: email, ...templates.bookingDeclined({
        customerName: b.customer.firstName, serviceName: b.serviceNameSnapshot,
        locationName: b.location.name, reason, alternatives,
        actionUrl: bookingUrl,
      })});
    }
  } catch (err) { logger.error({ err, bookingId }, "notifyBookingDeclined failed"); }
}

export async function notifyBookingCancelled(
  bookingId: string,
  cancelledBy: "customer" | "provider",
  reasonCode: string | null = null,
  _note: string | null = null,
): Promise<void> {
  try {
    const b = await loadBookingFull(bookingId);
    if (!b || !b.location || !b.customer) return;

    // Walk-in bookings: customerId points at the provider's own user
    // (no platform-side customer to notify). Skip the customer-side
    // notification entirely when the cancel comes from the provider
    // for a walk-in — there's no real driver to apologise to.
    const isWalkIn = b.bookingSource === "WALK_IN" || (b as any).isOffPlatform === true;

    const cancellerLabel = cancelledBy === "customer" ? `${b.customer.firstName} ${b.customer.lastName}` : b.location.provider.name;
    const scheduledDate = fmtDate(b.scheduledStartAtUtc);
    const scheduledTime = fmtTime(b.scheduledStartAtUtc);
    const whenLine = `${scheduledDate} at ${scheduledTime}`;
    const bookingUrl = `/bookings/${b.id}`;

    if (cancelledBy === "customer") {
      // Notify provider team (admins + staff). The customer-side cancel
      // text is unchanged from the prior shape — we don't surface the
      // driver's reason to the provider here, just the bare fact.
      const team = await getProviderTeam(b.location.providerId);
      for (const member of team) {
        await createNotification(member.userId, {
          subject: "Booking cancelled by customer",
          body: `${b.customer.firstName} ${b.customer.lastName} cancelled their ${b.serviceNameSnapshot} at ${b.location.name} on ${scheduledDate}.`,
          actionUrl: bookingUrl,
          metadata: { bookingId: b.id, type: "BOOKING_CANCELLED", cancelledBy: "customer", reasonCode },
        });
        await sendEmail({ to: member.email, ...templates.bookingCancelled({
          recipientName: member.firstName, cancelledBy: cancellerLabel,
          serviceName: b.serviceNameSnapshot, locationName: b.location.name,
          scheduledDate, actionUrl: bookingUrl,
        })});
      }
      return;
    }

    // Provider-cancelled. Customer-side text branches on reason so the
    // driver gets context-appropriate wording instead of a generic
    // "We apologize for the inconvenience" for every cause.
    if (isWalkIn) return; // no platform-side customer to notify

    // Defaults (OTHER / null reason) match the prior generic text so
    // any unrecognised code still produces a reasonable message.
    let subject = "Booking cancelled";
    let body = `Your ${b.serviceNameSnapshot} at ${b.location.name} for ${whenLine} has been cancelled.`;

    switch (reasonCode) {
      case "CUSTOMER_REQUESTED":
        subject = "Booking cancelled per your request";
        body = `Your ${b.serviceNameSnapshot} at ${b.location.name} for ${whenLine} has been cancelled as requested.`;
        break;
      case "PROVIDER_UNAVAILABLE":
        subject = "Booking cancelled";
        body = `${b.location.name} is unable to service your ${b.serviceNameSnapshot} for ${whenLine}. Sorry for the inconvenience.`;
        break;
      case "CUSTOMER_NO_SHOW":
        subject = "Booking cancelled — no-show";
        body = `Your ${b.serviceNameSnapshot} at ${b.location.name} for ${whenLine} was cancelled because you didn't arrive.`;
        break;
      case "OTHER":
      default:
        // keep defaults above
        break;
    }

    await createNotification(b.customer.id, {
      subject,
      body,
      actionUrl: bookingUrl,
      metadata: { bookingId: b.id, type: "BOOKING_CANCELLED", cancelledBy: "provider", reasonCode },
    });
    const email = await getUserEmail(b.customer.id);
    if (email) {
      await sendEmail({ to: email, ...templates.bookingCancelled({
        recipientName: b.customer.firstName, cancelledBy: cancellerLabel,
        serviceName: b.serviceNameSnapshot, locationName: b.location.name,
        scheduledDate, actionUrl: bookingUrl,
      })});
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
