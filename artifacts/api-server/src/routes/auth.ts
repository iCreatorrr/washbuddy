import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { hashPassword, verifyPassword, loadSessionUser } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, accountType, businessName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "email, password, firstName, and lastName are required",
      });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "Password must be at least 8 characters",
      });
      return;
    }

    const validAccountTypes = ["driver", "fleet_admin", "provider_admin"];
    if (accountType && !validAccountTypes.includes(accountType)) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "accountType must be one of: driver, fleet_admin, provider_admin",
      });
      return;
    }

    if ((accountType === "fleet_admin" || accountType === "provider_admin") && !businessName?.trim()) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "businessName is required for fleet_admin and provider_admin accounts",
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({
        errorCode: "EMAIL_EXISTS",
        message: "An account with this email already exists",
      });
      return;
    }

    const passwordHash = await hashPassword(password);

    // Create user and role-specific records in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phoneE164: phone || null,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
      });

      if (accountType === "fleet_admin") {
        const fleet = await tx.fleet.create({
          data: {
            name: businessName.trim(),
            billingMode: "FLEET_PAYS",
            currencyCode: "USD",
            defaultTimezone: "America/New_York",
          },
        });
        await tx.fleetMembership.create({
          data: {
            fleetId: fleet.id,
            userId: newUser.id,
            role: "FLEET_ADMIN",
            isActive: true,
          },
        });
      } else if (accountType === "provider_admin") {
        const provider = await tx.provider.create({
          data: {
            name: businessName.trim(),
            isActive: true,
          },
        });
        await tx.providerMembership.create({
          data: {
            providerId: provider.id,
            userId: newUser.id,
            role: "PROVIDER_ADMIN",
            isActive: true,
          },
        });
      }
      // "driver" accountType (or no accountType): user only, no membership needed

      return newUser;
    });

    req.session.userId = user.id;

    const sessionUser = await loadSessionUser(user.id);

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: sessionUser?.roles ?? [],
      },
    });
  } catch (err) {
    req.log.error({ err }, "Registration failed");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        errorCode: "VALIDATION_ERROR",
        message: "email and password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email, isActive: true, deletedAt: null },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({
        errorCode: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
      return;
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({
        errorCode: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
      return;
    }

    req.session.userId = user.id;

    const sessionUser = await loadSessionUser(user.id);

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: sessionUser?.roles ?? [],
      },
    });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Login failed" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Logout failed");
      res.status(500).json({ errorCode: "INTERNAL_ERROR", message: "Logout failed" });
      return;
    }
    res.clearCookie("wash_buddy_sid");
    res.json({ success: true });
  });
});

router.get("/auth/me", requireAuth, (req, res) => {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
    },
  });
});

export default router;
