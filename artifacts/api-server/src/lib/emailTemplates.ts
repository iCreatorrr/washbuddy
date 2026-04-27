/**
 * Email templates for all booking lifecycle notifications.
 * Each function returns { subject, html, text } for use with sendEmail().
 */

import type { EmailMessage } from "./emailService";

type EmailContent = Pick<EmailMessage, "subject" | "html" | "text">;

// ─── Shared Layout Helpers ─────────────────────────────────────────────────

function wrapInLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#1e3a5f;padding:16px 24px;border-radius:12px 12px 0 0;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;">WashBuddy</h1>
    </div>
    <div style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0;">
      <h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">${title}</h2>
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      &copy; ${new Date().getFullYear()} WashBuddy &middot; Commercial fleet washing marketplace
    </p>
  </div>
</body></html>`;
}

function ctaButton(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">${text}</a>`;
}

function alternativesList(alternatives: Array<{ name: string; address: string; nextAvailable?: string }>): string {
  if (!alternatives.length) return "";
  return `<div style="margin-top:16px;padding:16px;background:#f8fafc;border-radius:8px;">
    <p style="font-weight:600;margin:0 0 8px;">Nearby alternatives:</p>
    ${alternatives.map((a) => `<p style="margin:4px 0;font-size:14px;">&bull; <strong>${a.name}</strong> &mdash; ${a.address}${a.nextAvailable ? ` (next available: ${a.nextAvailable})` : ""}</p>`).join("")}
  </div>`;
}

function alternativesText(alternatives: Array<{ name: string; address: string; nextAvailable?: string }>): string {
  if (!alternatives.length) return "";
  return "\n\nNearby alternatives:\n" + alternatives.map((a) => `- ${a.name} — ${a.address}${a.nextAvailable ? ` (next: ${a.nextAvailable})` : ""}`).join("\n");
}

function p(text: string): string {
  return `<p style="color:#475569;line-height:1.6;margin:0 0 12px;">${text}</p>`;
}

// ─── Templates ─────────────────────────────────────────────────────────────

// 1. New booking request → Provider
export function bookingRequested(params: {
  providerName: string;
  customerName: string;
  serviceName: string;
  locationName: string;
  scheduledDate: string;
  scheduledTime: string;
  responseDeadlineMinutes: number;
  actionUrl: string;
}): EmailContent {
  const { providerName, customerName, serviceName, locationName, scheduledDate, scheduledTime, responseDeadlineMinutes, actionUrl } = params;
  return {
    subject: `New booking request from ${customerName}`,
    html: wrapInLayout("New Booking Request", [
      p(`Hi ${providerName},`),
      p(`<strong>${customerName}</strong> has requested a <strong>${serviceName}</strong> at <strong>${locationName}</strong>.`),
      p(`<strong>Scheduled:</strong> ${scheduledDate} at ${scheduledTime}`),
      p(`Please respond within <strong>${responseDeadlineMinutes} minutes</strong> to avoid the request expiring.`),
      ctaButton("View Request", actionUrl),
    ].join("")),
    text: `Hi ${providerName},\n\n${customerName} has requested a ${serviceName} at ${locationName}.\nScheduled: ${scheduledDate} at ${scheduledTime}\nPlease respond within ${responseDeadlineMinutes} minutes.\n\nView request: ${actionUrl}`,
  };
}

// 2. Booking confirmed → Customer
export function bookingConfirmed(params: {
  customerName: string;
  serviceName: string;
  locationName: string;
  locationAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  actionUrl: string;
}): EmailContent {
  const { customerName, serviceName, locationName, locationAddress, scheduledDate, scheduledTime, actionUrl } = params;
  return {
    subject: `Your wash at ${locationName} is confirmed`,
    html: wrapInLayout("Booking Confirmed", [
      p(`Hi ${customerName},`),
      p(`Your <strong>${serviceName}</strong> at <strong>${locationName}</strong> has been confirmed.`),
      p(`<strong>Date:</strong> ${scheduledDate}<br><strong>Time:</strong> ${scheduledTime}<br><strong>Address:</strong> ${locationAddress}`),
      ctaButton("View Booking", actionUrl),
    ].join("")),
    text: `Hi ${customerName},\n\nYour ${serviceName} at ${locationName} is confirmed.\nDate: ${scheduledDate}\nTime: ${scheduledTime}\nAddress: ${locationAddress}\n\nView booking: ${actionUrl}`,
  };
}

// 2b. New booking confirmed → Provider team (PROVIDER_ADMIN + PROVIDER_STAFF)
// Fires for instant-confirm (PROVIDER_CONFIRMED status) bookings — the
// flow that previously had NO provider notification at all and led to
// James missing Mike's booking at MetroClean Bronx until he happened
// to open Bay Timeline. Same-day bookings get a "today at HH:MM"
// subject; future bookings get "Date at HH:MM".
export function newBookingForProvider(params: {
  recipientName: string;
  customerName: string;
  serviceName: string;
  locationName: string;
  scheduledDate: string;
  scheduledTime: string;
  isSameDay: boolean;
  actionUrl: string;
}): EmailContent {
  const { recipientName, customerName, serviceName, locationName, scheduledDate, scheduledTime, isSameDay, actionUrl } = params;
  const whenLine = isSameDay ? `today at ${scheduledTime}` : `${scheduledDate} at ${scheduledTime}`;
  const subject = isSameDay
    ? `New booking today at ${scheduledTime} — ${locationName}`
    : `New booking on ${scheduledDate} — ${locationName}`;
  return {
    subject,
    html: wrapInLayout("New Booking", [
      p(`Hi ${recipientName},`),
      p(`<strong>${customerName}</strong> just booked <strong>${serviceName}</strong> at <strong>${locationName}</strong> for ${whenLine}.`),
      ctaButton("View Booking", actionUrl),
    ].join("")),
    text: `Hi ${recipientName},\n\n${customerName} just booked ${serviceName} at ${locationName} for ${whenLine}.\n\nView booking: ${actionUrl}`,
  };
}

// 3. Booking declined → Customer
export function bookingDeclined(params: {
  customerName: string;
  serviceName: string;
  locationName: string;
  reason: string;
  alternatives: Array<{ name: string; address: string; nextAvailable?: string }>;
  actionUrl: string;
}): EmailContent {
  const { customerName, serviceName, locationName, reason, alternatives, actionUrl } = params;
  return {
    subject: `Booking at ${locationName} was declined`,
    html: wrapInLayout("Booking Declined", [
      p(`Hi ${customerName},`),
      p(`Unfortunately, your request for <strong>${serviceName}</strong> at <strong>${locationName}</strong> was declined.`),
      p(`<strong>Reason:</strong> ${reason}`),
      alternativesList(alternatives),
      ctaButton("Find Another Location", actionUrl),
    ].join("")),
    text: `Hi ${customerName},\n\nYour request for ${serviceName} at ${locationName} was declined.\nReason: ${reason}${alternativesText(alternatives)}\n\nFind another location: ${actionUrl}`,
  };
}

// 4. Booking expired (provider didn't respond) → Customer
export function bookingExpired(params: {
  customerName: string;
  serviceName: string;
  locationName: string;
  alternatives: Array<{ name: string; address: string; nextAvailable?: string }>;
  actionUrl: string;
}): EmailContent {
  const { customerName, serviceName, locationName, alternatives, actionUrl } = params;
  return {
    subject: `${locationName} didn't respond in time`,
    html: wrapInLayout("Booking Request Expired", [
      p(`Hi ${customerName},`),
      p(`Your booking request for <strong>${serviceName}</strong> at <strong>${locationName}</strong> expired because the provider didn't respond in time.`),
      p("We apologize for the inconvenience. Here are some alternatives:"),
      alternativesList(alternatives),
      ctaButton("Search Nearby Locations", actionUrl),
    ].join("")),
    text: `Hi ${customerName},\n\nYour request for ${serviceName} at ${locationName} expired — the provider didn't respond in time.${alternativesText(alternatives)}\n\nSearch nearby: ${actionUrl}`,
  };
}

// 5. Booking reminder → Customer
export function bookingReminder(params: {
  customerName: string;
  serviceName: string;
  locationName: string;
  locationAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  actionUrl: string;
}): EmailContent {
  const { customerName, serviceName, locationName, locationAddress, scheduledDate, scheduledTime, actionUrl } = params;
  return {
    subject: `Reminder: Wash at ${locationName} — ${scheduledDate}`,
    html: wrapInLayout("Booking Reminder", [
      p(`Hi ${customerName},`),
      p(`This is a reminder that your <strong>${serviceName}</strong> at <strong>${locationName}</strong> is coming up.`),
      p(`<strong>Date:</strong> ${scheduledDate}<br><strong>Time:</strong> ${scheduledTime}<br><strong>Address:</strong> ${locationAddress}`),
      ctaButton("View Booking", actionUrl),
    ].join("")),
    text: `Hi ${customerName},\n\nReminder: ${serviceName} at ${locationName}\nDate: ${scheduledDate}\nTime: ${scheduledTime}\nAddress: ${locationAddress}\n\nView booking: ${actionUrl}`,
  };
}

// 6. Booking completed → Customer
export function bookingCompleted(params: {
  customerName: string;
  serviceName: string;
  locationName: string;
  actionUrl: string;
}): EmailContent {
  const { customerName, serviceName, locationName, actionUrl } = params;
  return {
    subject: "Your wash is complete!",
    html: wrapInLayout("Wash Complete", [
      p(`Hi ${customerName},`),
      p(`Your <strong>${serviceName}</strong> at <strong>${locationName}</strong> has been completed.`),
      p("We'd love to hear how it went! Leave a review to help other drivers find great wash facilities."),
      ctaButton("Leave a Review", actionUrl),
    ].join("")),
    text: `Hi ${customerName},\n\nYour ${serviceName} at ${locationName} is complete!\nLeave a review: ${actionUrl}`,
  };
}

// 7. Booking cancelled → Both parties
export function bookingCancelled(params: {
  recipientName: string;
  cancelledBy: string;
  serviceName: string;
  locationName: string;
  scheduledDate: string;
  actionUrl: string;
}): EmailContent {
  const { recipientName, cancelledBy, serviceName, locationName, scheduledDate, actionUrl } = params;
  return {
    subject: `Booking at ${locationName} cancelled`,
    html: wrapInLayout("Booking Cancelled", [
      p(`Hi ${recipientName},`),
      p(`The <strong>${serviceName}</strong> booking at <strong>${locationName}</strong> on <strong>${scheduledDate}</strong> has been cancelled by ${cancelledBy}.`),
      ctaButton("View Details", actionUrl),
    ].join("")),
    text: `Hi ${recipientName},\n\nThe ${serviceName} booking at ${locationName} on ${scheduledDate} has been cancelled by ${cancelledBy}.\n\nView details: ${actionUrl}`,
  };
}

// 8. Provider missed SLA → Provider
export function providerMissedSLA(params: {
  providerName: string;
  serviceName: string;
  locationName: string;
  customerName: string;
  revenueLost: string;
  actionUrl: string;
}): EmailContent {
  const { providerName, serviceName, locationName, customerName, revenueLost, actionUrl } = params;
  return {
    subject: `Missed booking request — ${revenueLost} lost`,
    html: wrapInLayout("Missed Booking Request", [
      p(`Hi ${providerName},`),
      p(`You missed a booking request for <strong>${serviceName}</strong> at <strong>${locationName}</strong> from <strong>${customerName}</strong>.`),
      p(`<strong>Revenue lost:</strong> ${revenueLost}`),
      p("Repeated failures to respond during your operating hours will negatively impact your platform rating and search ranking."),
      ctaButton("View Dashboard", actionUrl),
    ].join("")),
    text: `Hi ${providerName},\n\nYou missed a booking request for ${serviceName} at ${locationName} from ${customerName}.\nRevenue lost: ${revenueLost}\n\nRepeated missed responses will impact your platform rating.\n\nView dashboard: ${actionUrl}`,
  };
}

// 9. Provider approved → Provider
export function providerApproved(params: {
  providerName: string;
  actionUrl: string;
}): EmailContent {
  const { providerName, actionUrl } = params;
  return {
    subject: "Your WashBuddy listing is approved!",
    html: wrapInLayout("Listing Approved", [
      p(`Congratulations ${providerName}!`),
      p("Your WashBuddy listing has been approved. Your locations and services are now <strong>visible to customers</strong> in search results."),
      p("To start receiving payouts, set up your payment processing through Stripe Connect."),
      ctaButton("Go to Dashboard", actionUrl),
    ].join("")),
    text: `Congratulations ${providerName}!\n\nYour WashBuddy listing is approved! Your locations are now visible to customers.\n\nSet up payments to receive payouts.\n\nGo to dashboard: ${actionUrl}`,
  };
}

// 10. Wash request submitted → Fleet admin
export function washRequestSubmitted(params: {
  fleetAdminName: string;
  driverName: string;
  vehicleUnit: string;
  providerName: string;
  locationName: string;
  actionUrl: string;
}): EmailContent {
  const { fleetAdminName, driverName, vehicleUnit, providerName, locationName, actionUrl } = params;
  return {
    subject: `Wash request from ${driverName}`,
    html: wrapInLayout("New Wash Request", [
      p(`Hi ${fleetAdminName},`),
      p(`<strong>${driverName}</strong> has submitted a wash request:`),
      p(`<strong>Vehicle:</strong> ${vehicleUnit}<br><strong>Provider:</strong> ${providerName}<br><strong>Location:</strong> ${locationName}`),
      p("Please review and approve or decline the request."),
      ctaButton("Review Request", actionUrl),
    ].join("")),
    text: `Hi ${fleetAdminName},\n\n${driverName} submitted a wash request.\nVehicle: ${vehicleUnit}\nProvider: ${providerName}\nLocation: ${locationName}\n\nReview request: ${actionUrl}`,
  };
}
