import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requirePlatformAdmin, requireProviderAccess } from "../middlewares/requireAuth";
import { isPlatformAdmin, type SessionUser } from "../lib/auth";

const router: IRouter = Router();

router.get("/providers", requireAuth, async (req, res) => {
  try {
    const user = req.user as SessionUser;
    const isAdmin = isPlatformAdmin(user);

    if (isAdmin) {
      const providers = await prisma.provider.findMany({
        include: {
          locations: { select: { id: true, name: true, city: true, regionCode: true, isVisible: true } },
          _count: { select: { memberships: true } },
        },
        orderBy: { name: "asc" },
      });
      res.json({ providers });
      return;
    }

    const providerIds = user.roles
      .filter((r) => r.scope === "provider" && r.scopeId)
      .map((r) => r.scopeId!);

    if (providerIds.length === 0) {
      res.json({ providers: [] });
      return;
    }

    const providers = await prisma.provider.findMany({
      where: { id: { in: providerIds } },
      include: {
        locations: { select: { id: true, name: true, city: true, regionCode: true, isVisible: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json({ providers });
  } catch (err) {
    req.log.error({ err }, "Failed to list providers");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list providers" });
  }
});

router.get("/providers/:providerId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: req.params.providerId },
      include: {
        locations: {
          include: {
            services: { where: { isVisible: true }, select: { id: true, name: true, basePriceMinor: true, currencyCode: true, durationMins: true } },
            _count: { select: { operatingWindows: true } },
          },
        },
        memberships: {
          where: { isActive: true },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
      },
    });

    if (!provider) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Provider not found" });
      return;
    }

    res.json({ provider });
  } catch (err) {
    req.log.error({ err }, "Failed to get provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to get provider" });
  }
});

router.post("/providers", requirePlatformAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "name is required" });
      return;
    }

    const provider = await prisma.provider.create({
      data: { name: name.trim() },
    });

    res.status(201).json({ provider });
  } catch (err) {
    req.log.error({ err }, "Failed to create provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create provider" });
  }
});

router.patch("/providers/:providerId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const data: Record<string, unknown> = {};

    if (name !== undefined) data.name = name.trim();
    if (isActive !== undefined) {
      const user = req.user as SessionUser;
      if (!isPlatformAdmin(user)) {
        res.status(403).json({ errorCode: "FORBIDDEN", message: "Only platform admins can deactivate providers" });
        return;
      }
      data.isActive = isActive;
    }

    const provider = await prisma.provider.update({
      where: { id: req.params.providerId },
      data,
    });

    res.json({ provider });
  } catch (err) {
    req.log.error({ err }, "Failed to update provider");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update provider" });
  }
});

export default router;
