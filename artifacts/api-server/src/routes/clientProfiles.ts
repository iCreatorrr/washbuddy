import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess } from "../middlewares/requireAuth";
import type { SessionUser } from "../lib/auth";

const router: IRouter = Router();

// List client profiles with search, filter, sort, pagination
router.get("/providers/:providerId/client-profiles", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { providerId } = req.params;
    const { search, tags, sortBy = "lastVisitAt", sortOrder = "desc", page = "1", limit: limitParam = "25" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam as string)));
    const skip = (pageNum - 1) * limit;

    const where: any = { providerId };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { phone: { contains: search as string } },
        { email: { contains: search as string, mode: "insensitive" } },
        { fleetName: { contains: search as string, mode: "insensitive" } },
      ];
    }
    if (tags) {
      const tagList = (tags as string).split(",").map((t) => t.trim());
      where.tags = { hasEvery: tagList };
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder === "asc" ? "asc" : "desc";

    const [profiles, total] = await Promise.all([
      prisma.clientProfile.findMany({ where, orderBy, skip, take: limit }),
      prisma.clientProfile.count({ where }),
    ]);

    res.json({ profiles, total, page: pageNum, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    req.log.error({ err }, "Failed to list client profiles");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load profiles" });
  }
});

// Get single profile with visit history
router.get("/providers/:providerId/client-profiles/:profileId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const profile = await prisma.clientProfile.findUnique({ where: { id: req.params.profileId } });
    if (!profile || profile.providerId !== req.params.providerId) {
      res.status(404).json({ errorCode: "NOT_FOUND" }); return;
    }

    // Get provider's location IDs
    const locations = await prisma.location.findMany({ where: { providerId: req.params.providerId }, select: { id: true } });
    const locIds = locations.map((l) => l.id);

    // Recent bookings
    const bookingWhere: any = { locationId: { in: locIds } };
    if (profile.userId) bookingWhere.customerId = profile.userId;
    else bookingWhere.offPlatformClientName = profile.name;

    const recentBookings = await prisma.booking.findMany({
      where: bookingWhere,
      include: {
        location: { select: { name: true } },
        assignedOperator: { select: { firstName: true, lastName: true } },
        reviews: { where: { authorId: profile.userId || undefined }, select: { rating: true }, take: 1 },
      },
      orderBy: { scheduledStartAtUtc: "desc" },
      take: 20,
    });

    // Communication history
    const bookingIds = recentBookings.map((b) => b.id);
    const messages = bookingIds.length > 0 ? await prisma.bookingMessage.findMany({
      where: { bookingId: { in: bookingIds } },
      include: { sender: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }) : [];

    res.json({
      ...profile,
      recentBookings: recentBookings.map((b) => ({
        id: b.id, scheduledStartAtUtc: b.scheduledStartAtUtc, serviceNameSnapshot: b.serviceNameSnapshot,
        serviceBasePriceMinor: b.serviceBasePriceMinor, status: b.status, bookingSource: b.bookingSource,
        assignedOperatorName: b.assignedOperator ? `${b.assignedOperator.firstName} ${b.assignedOperator.lastName}` : null,
        rating: b.reviews[0]?.rating || null, locationName: b.location.name,
      })),
      communicationHistory: messages.map((m) => ({
        id: m.id, body: m.body, senderName: `${m.sender.firstName} ${m.sender.lastName}`, createdAt: m.createdAt,
      })),
    });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get client profile");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load profile" });
  }
});

// Update profile (tags, notes)
router.patch("/providers/:providerId/client-profiles/:profileId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const { tags, notes } = req.body;
    const profile = await prisma.clientProfile.findUnique({ where: { id: req.params.profileId } });
    if (!profile) { res.status(404).json({ errorCode: "NOT_FOUND" }); return; }

    const data: any = {};
    if (tags !== undefined) data.tags = tags;
    if (notes !== undefined) data.notes = notes;

    const updated = await prisma.clientProfile.update({ where: { id: profile.id }, data });
    await prisma.auditEvent.create({
      data: { actorId: user.id, entityType: "ClientProfile", entityId: profile.id, action: "CLIENT_PROFILE_UPDATED",
        metadata: { before: { tags: profile.tags, notes: profile.notes }, after: { tags, notes } } },
    });

    res.json({ profile: updated });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update profile" });
  }
});

// Create new off-platform client profile
router.post("/providers/:providerId/client-profiles", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { name, phone, email, fleetName, tags, notes } = req.body;
    if (!name) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Name is required" }); return; }

    const profile = await prisma.clientProfile.create({
      data: { providerId: req.params.providerId, name, phone: phone || null, email: email || null,
        fleetName: fleetName || null, tags: tags || ["NEW_CLIENT"], notes: notes || null },
    });

    res.status(201).json({ profile });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create profile" });
  }
});

export default router;
