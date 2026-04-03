/**
 * Stripe service layer — sole interface between WashBuddy and Stripe.
 *
 * When STRIPE_SECRET_KEY is not set, all functions operate as stubs:
 * they log arguments and return mock data. When the key is set,
 * the TODO blocks should be filled in with real Stripe API calls.
 */

import Stripe from "stripe";
import { logger } from "./logger";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_LIVE = !!STRIPE_SECRET_KEY;

const stripe = STRIPE_LIVE
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" as any })
  : null;

// ─── Connected Accounts ─────────────────────────────────────────────────────

export async function createConnectedAccount(
  providerName: string,
): Promise<{ accountId: string }> {
  logger.info({ providerName }, "stripe.createConnectedAccount stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const account = await stripe.accounts.create({ type: "express", business_profile: { name: providerName } });
    // return { accountId: account.id };
  }
  return { accountId: `acct_stub_${Date.now()}` };
}

export async function createAccountOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<{ url: string }> {
  logger.info({ accountId, refreshUrl, returnUrl }, "stripe.createAccountOnboardingLink stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const link = await stripe.accountLinks.create({ account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
    // return { url: link.url };
  }
  return { url: `https://connect.stripe.com/setup/stub?account=${accountId}` };
}

export async function getAccountStatus(
  accountId: string,
): Promise<{ payoutsEnabled: boolean; detailsSubmitted: boolean }> {
  logger.info({ accountId }, "stripe.getAccountStatus stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const account = await stripe.accounts.retrieve(accountId);
    // return { payoutsEnabled: account.payouts_enabled ?? false, detailsSubmitted: account.details_submitted ?? false };
  }
  return { payoutsEnabled: false, detailsSubmitted: false };
}

// ─── Payment Intents ────────────────────────────────────────────────────────

export async function createPaymentIntent(params: {
  amountMinor: number;
  currencyCode: string;
  customerId?: string;
  metadata?: Record<string, string>;
}): Promise<{ paymentIntentId: string; clientSecret: string; status: string }> {
  logger.info({ amountMinor: params.amountMinor, currency: params.currencyCode }, "stripe.createPaymentIntent stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const pi = await stripe.paymentIntents.create({ amount: params.amountMinor, currency: params.currencyCode.toLowerCase(), capture_method: "manual", customer: params.customerId, metadata: params.metadata });
    // return { paymentIntentId: pi.id, clientSecret: pi.client_secret!, status: pi.status };
  }
  return {
    paymentIntentId: `pi_stub_${Date.now()}`,
    clientSecret: `pi_stub_secret_${Date.now()}`,
    status: "requires_payment_method",
  };
}

export async function capturePaymentIntent(
  paymentIntentId: string,
): Promise<{ status: string; capturedAmount: number }> {
  logger.info({ paymentIntentId }, "stripe.capturePaymentIntent stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const pi = await stripe.paymentIntents.capture(paymentIntentId);
    // return { status: pi.status, capturedAmount: pi.amount_received };
  }
  return { status: "succeeded", capturedAmount: 0 };
}

export async function cancelPaymentIntent(
  paymentIntentId: string,
): Promise<{ status: string }> {
  logger.info({ paymentIntentId }, "stripe.cancelPaymentIntent stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const pi = await stripe.paymentIntents.cancel(paymentIntentId);
    // return { status: pi.status };
  }
  return { status: "canceled" };
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export async function createRefund(params: {
  paymentIntentId: string;
  amountMinor: number;
  reason: string;
}): Promise<{ refundId: string; status: string }> {
  logger.info({ paymentIntentId: params.paymentIntentId, amount: params.amountMinor }, "stripe.createRefund stub called");
  if (STRIPE_LIVE && stripe) {
    // TODO: const refund = await stripe.refunds.create({ payment_intent: params.paymentIntentId, amount: params.amountMinor, reason: "requested_by_customer" });
    // return { refundId: refund.id, status: refund.status! };
  }
  return { refundId: `re_stub_${Date.now()}`, status: "succeeded" };
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event | null {
  logger.info({ signatureLength: signature?.length }, "stripe.constructWebhookEvent stub called");
  if (STRIPE_LIVE && stripe && webhookSecret) {
    // TODO: return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
  return null;
}
