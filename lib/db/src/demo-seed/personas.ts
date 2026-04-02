import type { UserMembershipRole } from "@prisma/client";

export interface PersonaDefinition {
  code: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roles: PersonaRoleAssignment[];
  description: string;
}

export interface PersonaRoleAssignment {
  type: "platform" | "fleet" | "provider";
  role: UserMembershipRole;
  scopeRef?: string;
}

export const STABLE_PERSONAS: PersonaDefinition[] = [
  {
    code: "driver_demo_primary",
    email: "demo.driver@washbuddy.com",
    firstName: "Alex",
    lastName: "Rivera",
    phone: "+12125559001",
    roles: [{ type: "fleet", role: "DRIVER", scopeRef: "fleet:northeast-express" }],
    description: "Primary demo driver. Member of Northeast Express fleet. Has 3 vehicles, mix of booking history including completed, upcoming, and one disputed.",
  },
  {
    code: "fleet_admin_demo_primary",
    email: "demo.fleet@washbuddy.com",
    firstName: "Patricia",
    lastName: "Nakamura",
    phone: "+12125559002",
    roles: [{ type: "fleet", role: "FLEET_ADMIN", scopeRef: "fleet:northeast-express" }],
    description: "Primary fleet admin. Manages Northeast Express fleet with 15+ vehicles and 6 drivers. Active booking oversight.",
  },
  {
    code: "dispatcher_demo_primary",
    email: "demo.dispatch@washbuddy.com",
    firstName: "Marcus",
    lastName: "Chen",
    phone: "+12125559003",
    roles: [{ type: "fleet", role: "DISPATCHER", scopeRef: "fleet:northeast-express" }],
    description: "Primary dispatcher. Coordinates wash scheduling for Northeast Express fleet.",
  },
  {
    code: "provider_staff_demo_primary",
    email: "demo.staff@washbuddy.com",
    firstName: "Jordan",
    lastName: "Okafor",
    phone: "+12125559004",
    roles: [{ type: "provider", role: "PROVIDER_STAFF", scopeRef: "provider:sparkle-metro-nyc" }],
    description: "Primary provider staff. Works at Sparkle Metro NYC Bronx location. Handles check-ins and service execution.",
  },
  {
    code: "provider_admin_demo_primary",
    email: "demo.provider@washbuddy.com",
    firstName: "Rachel",
    lastName: "Vasquez",
    phone: "+12125559005",
    roles: [{ type: "provider", role: "PROVIDER_ADMIN", scopeRef: "provider:sparkle-metro-nyc" }],
    description: "Primary provider admin. Owns Sparkle Metro NYC (multi-location provider in NYC region). Manages availability, confirms/declines bookings, views payouts.",
  },
  {
    code: "support_admin_demo_primary",
    email: "demo.support@washbuddy.com",
    firstName: "David",
    lastName: "Kowalski",
    phone: "+12125559006",
    roles: [{ type: "platform", role: "PLATFORM_SUPPORT_ADMIN" }],
    description: "Primary support admin. Handles disputes, reviews flagged bookings, manages refunds.",
  },
  {
    code: "super_admin_demo_primary",
    email: "demo.admin@washbuddy.com",
    firstName: "Samantha",
    lastName: "Oduya",
    phone: "+12125559007",
    roles: [{ type: "platform", role: "PLATFORM_SUPER_ADMIN" }],
    description: "Primary super admin. Full platform access. KPI dashboard, provider management, user management.",
  },
];

export function getPersona(code: string): PersonaDefinition {
  const p = STABLE_PERSONAS.find((p) => p.code === code);
  if (!p) throw new Error(`Unknown persona: ${code}`);
  return p;
}
