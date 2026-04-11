import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requirePlatformAdmin, requireProviderAccess } from "../middlewares/requireAuth";
import { isPlatformAdmin, type SessionUser } from "../lib/auth";
import { createConnectedAccount, createAccountOnboardingLink } from "../lib/stripeService";

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

router.post("/providers/:providerId/stripe/onboard", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: req.params.providerId },
      select: { id: true, name: true, externalPayoutAcctId: true },
    });

    if (!provider) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Provider not found" });
      return;
    }

    let accountId = provider.externalPayoutAcctId;

    if (!accountId) {
      const account = await createConnectedAccount(provider.name);
      accountId = account.accountId;
      await prisma.provider.update({
        where: { id: provider.id },
        data: { externalPayoutAcctId: accountId },
      });
    }

    const basePath = process.env.BASE_PATH || "";
    const refreshUrl = `${basePath}/provider/settings`;
    const returnUrl = `${basePath}/provider/settings?stripe_onboard=complete`;

    const link = await createAccountOnboardingLink(accountId, refreshUrl, returnUrl);

    res.json({ url: link.url });
  } catch (err) {
    req.log.error({ err }, "Failed to initiate Stripe onboarding");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to start payment setup" });
  }
});

// ─── Team Management ────────────────────────────────────────────────────────

router.get("/providers/:providerId/team", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const members = await prisma.providerMembership.findMany({
      where: { providerId: req.params.providerId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, location: { select: { name: true } } },
      orderBy: { role: "asc" },
    });
    res.json({ members: members.map((m) => ({
      membershipId: m.id, userId: m.userId, userName: `${m.user.firstName} ${m.user.lastName}`,
      userEmail: m.user.email, role: m.role, locationName: m.location?.name || null, isActive: m.isActive, createdAt: m.createdAt,
    })) });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load team" }); }
});

router.post("/providers/:providerId/team/invite", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { email, role, locationId } = req.body;
    if (!email || !role) { res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "Email and role required" }); return; }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const { hashPassword } = await import("../lib/auth");
      user = await prisma.user.create({ data: { email, firstName: "Invited", lastName: "User", passwordHash: await hashPassword(crypto.randomUUID()), isActive: true } });
    }

    const membership = await prisma.providerMembership.create({
      data: { providerId: req.params.providerId, userId: user.id, role: role as any, locationId: locationId || null, isActive: true },
    });
    res.status(201).json({ membership });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to invite" }); }
});

router.patch("/providers/:providerId/team/:membershipId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { role, locationId, isActive } = req.body;
    const data: any = {};
    if (role !== undefined) data.role = role;
    if (locationId !== undefined) data.locationId = locationId || null;
    if (isActive !== undefined) data.isActive = isActive;
    const updated = await prisma.providerMembership.update({ where: { id: req.params.membershipId }, data });
    res.json({ membership: updated });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update membership" }); }
});

// ─── Discounts ──────────────────────────────────────────────────────────────

router.get("/providers/:providerId/discounts", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const discounts = await prisma.providerDiscount.findMany({ where: { providerId: req.params.providerId }, orderBy: { createdAt: "desc" } });
    res.json({ discounts });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load discounts" }); }
});

router.post("/providers/:providerId/discounts", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const discount = await prisma.providerDiscount.create({ data: { providerId: req.params.providerId, ...req.body } });
    res.status(201).json({ discount });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create discount" }); }
});

router.patch("/providers/:providerId/discounts/:discountId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const updated = await prisma.providerDiscount.update({ where: { id: req.params.discountId }, data: req.body });
    res.json({ discount: updated });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update discount" }); }
});

router.delete("/providers/:providerId/discounts/:discountId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    await prisma.providerDiscount.update({ where: { id: req.params.discountId }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to delete discount" }); }
});

// ─── Subscription Packages ──────────────────────────────────────────────────

router.get("/providers/:providerId/subscription-packages", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const packages = await prisma.subscriptionPackage.findMany({
      where: { providerId: req.params.providerId },
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ packages });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load packages" }); }
});

router.post("/providers/:providerId/subscription-packages", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const pkg = await prisma.subscriptionPackage.create({ data: { providerId: req.params.providerId, ...req.body } });
    res.status(201).json({ package: pkg });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create package" }); }
});

router.patch("/providers/:providerId/subscription-packages/:packageId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const updated = await prisma.subscriptionPackage.update({ where: { id: req.params.packageId }, data: req.body });
    res.json({ package: updated });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update package" }); }
});

// ─── Wash Bays ──────────────────────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/bays", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const bays = await prisma.washBay.findMany({ where: { locationId: req.params.locationId }, orderBy: { displayOrder: "asc" } });
    res.json({ bays });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load bays" }); }
});

router.post("/providers/:providerId/locations/:locationId/bays", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const bay = await prisma.washBay.create({ data: { locationId: req.params.locationId, ...req.body } });
    res.status(201).json({ bay });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create bay" }); }
});

router.patch("/providers/:providerId/locations/:locationId/bays/:bayId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const updated = await prisma.washBay.update({ where: { id: req.params.bayId }, data: req.body });
    res.json({ bay: updated });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update bay" }); }
});

// ─── Add-Ons ────────────────────────────────────────────────────────────────

router.get("/providers/:providerId/locations/:locationId/add-ons", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const addOns = await prisma.providerAddOn.findMany({
      where: { locationId: req.params.locationId, providerId: req.params.providerId },
      orderBy: [{ category: "asc" }, { displayOrder: "asc" }],
    });
    res.json({ addOns });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to load add-ons" }); }
});

router.post("/providers/:providerId/locations/:locationId/add-ons", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const addOn = await prisma.providerAddOn.create({
      data: { providerId: req.params.providerId, locationId: req.params.locationId, ...req.body },
    });
    res.status(201).json({ addOn });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create add-on" }); }
});

router.patch("/providers/:providerId/locations/:locationId/add-ons/:addOnId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const updated = await prisma.providerAddOn.update({ where: { id: req.params.addOnId }, data: req.body });
    res.json({ addOn: updated });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update add-on" }); }
});

router.post("/providers/:providerId/locations/:locationId/add-ons/init-from-template", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { providerId, locationId } = req.params;
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { countryCode: true } });
    const currency = loc?.countryCode === "CA" ? "CAD" : "USD";

    const template = [
      { category: "RESTROOM_SUPPLIES", name: "Toilet Paper", iconName: "ScrollText", priceMinor: 350, quantityMode: "COUNTABLE" },
      { category: "RESTROOM_SUPPLIES", name: "Paper Towels", iconName: "Newspaper", priceMinor: 300, quantityMode: "COUNTABLE" },
      { category: "RESTROOM_SUPPLIES", name: "Hand Soap Refill", iconName: "Droplets", priceMinor: 400, quantityMode: "FLAT" },
      { category: "RESTROOM_SUPPLIES", name: "Hand Sanitizer", iconName: "Sparkles", priceMinor: 350, quantityMode: "FLAT" },
      { category: "RESTROOM_SUPPLIES", name: "Air Freshener", iconName: "Wind", priceMinor: 500, quantityMode: "FLAT" },
      { category: "RESTROOM_SUPPLIES", name: "Trash Bags", iconName: "Trash2", priceMinor: 200, quantityMode: "COUNTABLE" },
      { category: "RESTROOM_SUPPLIES", name: "Disinfectant Wipes", iconName: "Eraser", priceMinor: 450, quantityMode: "COUNTABLE" },
      { category: "DRIVER_AMENITIES", name: "Coffee", iconName: "Coffee", priceMinor: 300, quantityMode: "COUNTABLE" },
      { category: "DRIVER_AMENITIES", name: "Bottled Water", iconName: "GlassWater", priceMinor: 250, quantityMode: "COUNTABLE" },
      { category: "DRIVER_AMENITIES", name: "Snack Pack", iconName: "Cookie", priceMinor: 400, quantityMode: "COUNTABLE" },
      { category: "DRIVER_AMENITIES", name: "Hot Meal", iconName: "UtensilsCrossed", priceMinor: 1200, quantityMode: "COUNTABLE" },
      { category: "DRIVER_AMENITIES", name: "Driver Lounge Access", iconName: "Sofa", priceMinor: 1000, quantityMode: "FLAT" },
      { category: "DRIVER_AMENITIES", name: "Shower Access", iconName: "ShowerHead", priceMinor: 1500, quantityMode: "FLAT" },
      { category: "VEHICLE_SUPPLIES", name: "Windshield Washer Fluid", iconName: "Droplet", priceMinor: 800, quantityMode: "FLAT" },
      { category: "VEHICLE_SUPPLIES", name: "DEF Top-Up", iconName: "Fuel", priceMinor: 1200, quantityMode: "FLAT" },
      { category: "VEHICLE_SUPPLIES", name: "Tire Pressure Check", iconName: "Gauge", priceMinor: 500, quantityMode: "FLAT" },
      { category: "VEHICLE_SUPPLIES", name: "Coolant Top-Up", iconName: "Thermometer", priceMinor: 1500, quantityMode: "FLAT" },
      { category: "SPECIALTY_TREATMENTS", name: "Protective Wax Coating", iconName: "Shield", priceMinor: 3500, quantityMode: "FLAT" },
      { category: "SPECIALTY_TREATMENTS", name: "Anti-Salt Undercoating", iconName: "Snowflake", priceMinor: 4500, quantityMode: "FLAT" },
      { category: "SPECIALTY_TREATMENTS", name: "Odor Elimination", iconName: "Leaf", priceMinor: 2500, quantityMode: "FLAT" },
      { category: "SPECIALTY_TREATMENTS", name: "Window Rain Repellent", iconName: "CloudRain", priceMinor: 2000, quantityMode: "FLAT" },
      { category: "SPECIALTY_TREATMENTS", name: "Fabric Stain Treatment", iconName: "Paintbrush", priceMinor: 3000, quantityMode: "FLAT" },
    ];

    let created = 0;
    for (let i = 0; i < template.length; i++) {
      const t = template[i];
      const exists = await prisma.providerAddOn.findFirst({ where: { locationId, name: t.name } });
      if (!exists) {
        await prisma.providerAddOn.create({
          data: { providerId, locationId, ...t, currencyCode: currency, isActive: false, isFromTemplate: true, displayOrder: i },
        });
        created++;
      }
    }
    res.json({ created, total: template.length });
  } catch (err: any) {
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to initialize template" });
  }
});

router.delete("/providers/:providerId/locations/:locationId/add-ons/:addOnId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    await prisma.providerAddOn.update({ where: { id: req.params.addOnId }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to delete add-on" }); }
});

export default router;
