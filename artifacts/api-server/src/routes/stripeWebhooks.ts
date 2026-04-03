/**
 * Stripe webhook ingestion route.
 *
 * POST /api/webhooks/stripe
 *
 * Uses express.raw() for raw body parsing (required for Stripe signature verification).
 * In stub mode (no STRIPE_WEBHOOK_SECRET), logs and returns 200.
 */

import { Router, type IRouter } from "express";
import express from "express";
import { constructWebhookEvent } from "../lib/stripeService";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const signature = req.headers["stripe-signature"] as string;

    try {
      const event = constructWebhookEvent(req.body, signature || "", webhookSecret);

      if (!event) {
        // Stub mode — no live Stripe
        logger.info("Stripe webhook received in stub mode");
        res.json({ received: true, mode: "stub" });
        return;
      }

      // Process live webhook events
      switch (event.type) {
        case "account.updated":
          logger.info({ accountId: (event.data.object as any).id }, "Stripe: account.updated");
          // TODO: Update provider payoutReady / stripeOnboardingStatus
          break;

        case "payment_intent.succeeded":
          logger.info({ paymentIntentId: (event.data.object as any).id }, "Stripe: payment_intent.succeeded");
          // TODO: Record PaymentEvent, update booking payment status
          break;

        case "payment_intent.payment_failed":
          logger.info({ paymentIntentId: (event.data.object as any).id }, "Stripe: payment_intent.payment_failed");
          // TODO: Record PaymentEvent, notify customer of failure
          break;

        case "charge.refunded":
          logger.info({ chargeId: (event.data.object as any).id }, "Stripe: charge.refunded");
          // TODO: Update RefundInternal record status
          break;

        default:
          logger.info({ type: event.type }, "Stripe: unhandled event type");
      }

      res.json({ received: true });
    } catch (err) {
      logger.error({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: "Webhook signature verification failed" });
    }
  },
);

export default router;
