import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireProviderAccess } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/providers/:providerId/locations/:locationId/services", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { locationId: req.params.locationId, location: { providerId: req.params.providerId } },
      include: {
        compatibilityRules: true,
        pricing: true,
      },
      orderBy: { name: "asc" },
    });

    res.json({ services });
  } catch (err) {
    req.log.error({ err }, "Failed to list services");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to list services" });
  }
});

router.post("/providers/:providerId/locations/:locationId/services", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const {
      name, description, durationMins, basePriceMinor, currencyCode,
      platformFeeMinor, capacityPerSlot, leadTimeMins, requiresConfirmation,
      isVisible, compatibilityRules,
    } = req.body;

    if (!name || !durationMins || basePriceMinor === undefined || !currencyCode || platformFeeMinor === undefined) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "name, durationMins, basePriceMinor, currencyCode, and platformFeeMinor are required",
      });
      return;
    }

    const location = await prisma.location.findFirst({
      where: { id: req.params.locationId, providerId: req.params.providerId },
    });

    if (!location) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Location not found" });
      return;
    }

    const service = await prisma.service.create({
      data: {
        locationId: req.params.locationId,
        name,
        description: description || null,
        durationMins,
        basePriceMinor,
        currencyCode,
        platformFeeMinor,
        capacityPerSlot: capacityPerSlot ?? 1,
        leadTimeMins: leadTimeMins ?? 60,
        requiresConfirmation: requiresConfirmation ?? true,
        isVisible: isVisible ?? false,
        compatibilityRules: compatibilityRules?.length
          ? {
              createMany: {
                data: compatibilityRules.map((r: { categoryCode: string; subtypeCode?: string; maxLengthInches?: number; maxHeightInches?: number }) => ({
                  categoryCode: r.categoryCode,
                  subtypeCode: r.subtypeCode || null,
                  maxLengthInches: r.maxLengthInches || null,
                  maxHeightInches: r.maxHeightInches || null,
                })),
              },
            }
          : undefined,
      },
      include: { compatibilityRules: true },
    });

    res.status(201).json({ service });
  } catch (err) {
    req.log.error({ err }, "Failed to create service");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to create service" });
  }
});

router.patch("/providers/:providerId/locations/:locationId/services/:serviceId", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const existing = await prisma.service.findFirst({
      where: {
        id: req.params.serviceId,
        locationId: req.params.locationId,
        location: { providerId: req.params.providerId },
      },
    });

    if (!existing) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found" });
      return;
    }

    const {
      name, description, durationMins, basePriceMinor, currencyCode,
      platformFeeMinor, capacityPerSlot, leadTimeMins, requiresConfirmation,
      isVisible,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (durationMins !== undefined) data.durationMins = durationMins;
    if (basePriceMinor !== undefined) data.basePriceMinor = basePriceMinor;
    if (currencyCode !== undefined) data.currencyCode = currencyCode;
    if (platformFeeMinor !== undefined) data.platformFeeMinor = platformFeeMinor;
    if (capacityPerSlot !== undefined) data.capacityPerSlot = capacityPerSlot;
    if (leadTimeMins !== undefined) data.leadTimeMins = leadTimeMins;
    if (requiresConfirmation !== undefined) data.requiresConfirmation = requiresConfirmation;
    if (isVisible !== undefined) data.isVisible = isVisible;

    const service = await prisma.service.update({
      where: { id: req.params.serviceId },
      data,
      include: { compatibilityRules: true, pricing: true },
    });

    // Upsert ServicePricing records if provided
    const { pricing } = req.body;
    if (Array.isArray(pricing)) {
      for (const p of pricing) {
        await prisma.servicePricing.upsert({
          where: { serviceId_vehicleClass: { serviceId: service.id, vehicleClass: p.vehicleClass } },
          create: { serviceId: service.id, vehicleClass: p.vehicleClass, priceMinor: p.priceMinor, durationMins: p.durationMins, isAvailable: p.isAvailable ?? true },
          update: { priceMinor: p.priceMinor, durationMins: p.durationMins, isAvailable: p.isAvailable ?? true },
        });
      }
    }

    const updated = await prisma.service.findUnique({ where: { id: service.id }, include: { compatibilityRules: true, pricing: true } });
    res.json({ service: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update service");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update service" });
  }
});

router.put("/providers/:providerId/locations/:locationId/services/:serviceId/compatibility", requireAuth, requireProviderAccess(), async (req, res) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules)) {
      res.status(400).json({ errorCode: "VALIDATION_ERROR", message: "rules array is required" });
      return;
    }

    const existing = await prisma.service.findFirst({
      where: {
        id: req.params.serviceId,
        locationId: req.params.locationId,
        location: { providerId: req.params.providerId },
      },
    });

    if (!existing) {
      res.status(404).json({ errorCode: "NOT_FOUND", message: "Service not found" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceCompatibility.deleteMany({ where: { serviceId: req.params.serviceId } });

      if (rules.length > 0) {
        await tx.serviceCompatibility.createMany({
          data: rules.map((r: { categoryCode: string; subtypeCode?: string; maxLengthInches?: number; maxHeightInches?: number }) => ({
            serviceId: req.params.serviceId,
            categoryCode: r.categoryCode,
            subtypeCode: r.subtypeCode || null,
            maxLengthInches: r.maxLengthInches || null,
            maxHeightInches: r.maxHeightInches || null,
          })),
        });
      }
    });

    const service = await prisma.service.findUnique({
      where: { id: req.params.serviceId },
      include: { compatibilityRules: true },
    });

    res.json({ service });
  } catch (err) {
    req.log.error({ err }, "Failed to update compatibility rules");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Failed to update compatibility rules" });
  }
});

export default router;
