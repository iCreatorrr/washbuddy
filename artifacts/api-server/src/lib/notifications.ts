import { prisma } from "@workspace/db";

interface NotificationInput {
  subject: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export async function createNotification(userId: string, input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId,
      channel: "IN_APP",
      status: "DELIVERED",
      subject: input.subject,
      body: input.body,
      actionUrl: input.actionUrl || null,
      metadata: input.metadata || {},
      sentAt: new Date(),
      deliveredAt: new Date(),
    },
  });
}

export async function createBulkNotifications(userIds: string[], input: NotificationInput) {
  if (userIds.length === 0) return;
  const now = new Date();
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      channel: "IN_APP" as const,
      status: "DELIVERED" as const,
      subject: input.subject,
      body: input.body,
      actionUrl: input.actionUrl || null,
      metadata: input.metadata || {},
      sentAt: now,
      deliveredAt: now,
    })),
  });
}
