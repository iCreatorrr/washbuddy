import type { Request, Response, NextFunction } from "express";
import type { SessionUser } from "../lib/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    const user = req.user as SessionUser;
    const hasRole = user.roles.some((r) => allowedRoles.includes(r.role));

    if (!hasRole) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }

  const user = req.user as SessionUser;
  const isAdmin = user.roles.some(
    (r) =>
      r.role === "PLATFORM_SUPER_ADMIN" ||
      r.role === "PLATFORM_SUPPORT_ADMIN" ||
      r.role === "PLATFORM_OPS_ADMIN",
  );

  if (!isAdmin) {
    res.status(403).json({ errorCode: "FORBIDDEN", message: "Platform admin access required" });
    return;
  }

  next();
}

export function requireProviderAccess(paramName: string = "providerId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    const user = req.user as SessionUser;
    const providerId = req.params[paramName];

    const isPlatformAdmin = user.roles.some(
      (r) =>
        r.role === "PLATFORM_SUPER_ADMIN" ||
        r.role === "PLATFORM_SUPPORT_ADMIN" ||
        r.role === "PLATFORM_OPS_ADMIN",
    );

    if (isPlatformAdmin) {
      next();
      return;
    }

    const hasProviderAccess = user.roles.some(
      (r) =>
        (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") &&
        r.scopeId === providerId,
    );

    if (!hasProviderAccess) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Provider access required" });
      return;
    }

    next();
  };
}

export function requireFleetAccess(paramName: string = "fleetId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    const user = req.user as SessionUser;
    const fleetId = req.params[paramName];

    const isPlatformAdmin = user.roles.some(
      (r) =>
        r.role === "PLATFORM_SUPER_ADMIN" ||
        r.role === "PLATFORM_SUPPORT_ADMIN" ||
        r.role === "PLATFORM_OPS_ADMIN",
    );

    if (isPlatformAdmin) {
      next();
      return;
    }

    const hasFleetAccess = user.roles.some(
      (r) =>
        (r.role === "FLEET_ADMIN" || r.role === "DISPATCHER" || r.role === "MAINTENANCE_MANAGER" || r.role === "READ_ONLY_ANALYST" || r.role === "DRIVER") &&
        r.scopeId === fleetId,
    );

    if (!hasFleetAccess) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet access required" });
      return;
    }

    next();
  };
}

export function requireFleetWrite(paramName: string = "fleetId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ errorCode: "UNAUTHORIZED", message: "Authentication required" });
      return;
    }

    const user = req.user as SessionUser;
    const fleetId = req.params[paramName];

    const isPlatformAdminUser = user.roles.some(
      (r) =>
        r.role === "PLATFORM_SUPER_ADMIN" ||
        r.role === "PLATFORM_SUPPORT_ADMIN" ||
        r.role === "PLATFORM_OPS_ADMIN",
    );

    if (isPlatformAdminUser) {
      next();
      return;
    }

    const canWrite = user.roles.some(
      (r) =>
        (r.role === "FLEET_ADMIN" || r.role === "DISPATCHER") &&
        r.scopeId === fleetId,
    );

    if (!canWrite) {
      res.status(403).json({ errorCode: "FORBIDDEN", message: "Fleet write access required" });
      return;
    }

    next();
  };
}
