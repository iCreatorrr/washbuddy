import { prisma } from "@workspace/db";
import crypto from "crypto";

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRoleInfo[];
}

export interface UserRoleInfo {
  role: string;
  scope: "platform" | "fleet" | "provider";
  scopeId?: string;
  scopeName?: string;
  locationId?: string;
}

export async function loadUserRoles(userId: string): Promise<UserRoleInfo[]> {
  const roles: UserRoleInfo[] = [];

  const platformRoles = await prisma.userPlatformRole.findMany({
    where: { userId, isActive: true },
  });

  for (const pr of platformRoles) {
    roles.push({
      role: pr.role,
      scope: "platform",
    });
  }

  const fleetMemberships = await prisma.fleetMembership.findMany({
    where: { userId, isActive: true },
    include: { fleet: { select: { id: true, name: true } } },
  });

  for (const fm of fleetMemberships) {
    roles.push({
      role: fm.role,
      scope: "fleet",
      scopeId: fm.fleet.id,
      scopeName: fm.fleet.name,
    });
  }

  const providerMemberships = await prisma.providerMembership.findMany({
    where: { userId, isActive: true },
    include: {
      provider: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });

  for (const pm of providerMemberships) {
    roles.push({
      role: pm.role,
      scope: "provider",
      scopeId: pm.provider.id,
      scopeName: pm.provider.name,
      locationId: pm.locationId ?? undefined,
    });
  }

  return roles;
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  if (!user) return null;

  const roles = await loadUserRoles(user.id);
  return { ...user, roles };
}

export function isPlatformAdmin(user: SessionUser): boolean {
  return user.roles.some(
    (r) =>
      r.role === "PLATFORM_SUPER_ADMIN" ||
      r.role === "PLATFORM_SUPPORT_ADMIN" ||
      r.role === "PLATFORM_OPS_ADMIN",
  );
}

export function isSuperAdmin(user: SessionUser): boolean {
  return user.roles.some((r) => r.role === "PLATFORM_SUPER_ADMIN");
}

export function isProviderRole(user: SessionUser, providerId?: string): boolean {
  return user.roles.some(
    (r) =>
      (r.role === "PROVIDER_ADMIN" || r.role === "PROVIDER_STAFF") &&
      (providerId ? r.scopeId === providerId : true),
  );
}

export function isFleetRole(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) =>
      (r.role === "FLEET_ADMIN" || r.role === "DISPATCHER" || r.role === "MAINTENANCE_MANAGER") &&
      (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isFleetAdmin(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) => r.role === "FLEET_ADMIN" && (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isFleetDispatcher(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) => r.role === "DISPATCHER" && (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isMaintenanceManager(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) => r.role === "MAINTENANCE_MANAGER" && (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isReadOnlyAnalyst(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) => r.role === "READ_ONLY_ANALYST" && (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isFleetMember(user: SessionUser, fleetId?: string): boolean {
  return user.roles.some(
    (r) =>
      (r.role === "FLEET_ADMIN" || r.role === "DISPATCHER" || r.role === "MAINTENANCE_MANAGER" || r.role === "READ_ONLY_ANALYST" || r.role === "DRIVER") &&
      (fleetId ? r.scopeId === fleetId : true),
  );
}

export function isDriver(user: SessionUser): boolean {
  return user.roles.some((r) => r.role === "DRIVER");
}

export function getFleetId(user: SessionUser): string | undefined {
  const fleetRole = user.roles.find(
    (r) => r.scope === "fleet" || r.role === "DRIVER"
  );
  return fleetRole?.scopeId;
}

export function canWriteFleet(user: SessionUser, fleetId: string): boolean {
  return user.roles.some(
    (r) =>
      (r.role === "FLEET_ADMIN" || r.role === "DISPATCHER") &&
      r.scopeId === fleetId,
  ) || isPlatformAdmin(user);
}
