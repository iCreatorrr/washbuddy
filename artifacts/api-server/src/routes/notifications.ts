import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const where: any = { userId: user.id };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;

    res.json({
      notifications: items.map((n) => ({
        id: n.id,
        subject: n.subject,
        body: n.body,
        actionUrl: n.actionUrl,
        metadata: n.metadata,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].createdAt.toISOString() : null,
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list notifications" });
  }
});

router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const count = await prisma.notification.count({
      where: { userId: user.id, readAt: null },
    });
    res.json({ count });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get unread count");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get unread count" });
  }
});

router.post("/notifications/:notificationId/read", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { notificationId } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });

    if (!notification) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Notification not found" });
      return;
    }

    if (notification.readAt) {
      res.json({ success: true });
      return;
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to mark notification as read");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to mark as read" });
  }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;

    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Failed to mark all notifications as read");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to mark all as read" });
  }
});

// ─── Notification Preferences ───────────────────────────────────────────────

const DEFAULT_EVENT_TYPES = [
  "NEW_BOOKING", "CANCELLATION", "REVIEW_RECEIVED", "SLA_WARNING", "BOOKING_REMINDER",
  "WASH_COMPLETE", "BOOKING_RESCHEDULED", "MESSAGE_RECEIVED", "WASH_HEALTH_ALERT", "SUBSCRIPTION_RENEWAL",
];

router.get("/users/me/notification-preferences", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const prefs = await prisma.notificationPreference.findMany({ where: { userId: user.id } });
    const prefMap = new Map(prefs.map((p) => [p.eventType, p]));

    const result = DEFAULT_EVENT_TYPES.map((et) => {
      const p = prefMap.get(et);
      return { eventType: et, emailEnabled: p?.emailEnabled ?? true, inAppEnabled: p?.inAppEnabled ?? true, smsEnabled: p?.smsEnabled ?? false };
    });
    res.json({ preferences: result });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load preferences" });
  }
});

router.put("/users/me/notification-preferences", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { preferences } = req.body;
    if (!Array.isArray(preferences)) { res.status(400).json({ errorCode: "VALIDATION_ERROR" }); return; }

    for (const p of preferences) {
      await prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: user.id, eventType: p.eventType } },
        create: { userId: user.id, eventType: p.eventType, emailEnabled: p.emailEnabled, inAppEnabled: p.inAppEnabled, smsEnabled: p.smsEnabled ?? false },
        update: { emailEnabled: p.emailEnabled, inAppEnabled: p.inAppEnabled, smsEnabled: p.smsEnabled ?? false },
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to save preferences" });
  }
});

export default router;
