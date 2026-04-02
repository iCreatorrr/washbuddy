export interface ScenarioDefinition {
  code: string;
  name: string;
  description: string;
  targetPersona: string;
  entities: ScenarioEntity[];
}

export interface ScenarioEntity {
  type: "booking" | "dispute" | "review" | "payout";
  status: string;
  ageDescription: string;
  notes: string;
}

export const GOLDEN_SCENARIOS: ScenarioDefinition[] = [
  {
    code: "DRIVER_HAPPY_PATH",
    name: "Driver Happy Path",
    description: "Complete successful booking cycle: search → book → arrive → wash → review",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "COMPLETED", ageDescription: "3 days ago", notes: "Completed wash at Bronx location" },
      { type: "review", status: "SUBMITTED", ageDescription: "2 days ago", notes: "5-star review with comment" },
    ],
  },
  {
    code: "DRIVER_UPCOMING_BOOKING",
    name: "Driver Upcoming Booking",
    description: "Driver has a confirmed booking for tomorrow, ready for check-in flow",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "PROVIDER_CONFIRMED", ageDescription: "tomorrow +4h", notes: "Confirmed booking at primary location" },
    ],
  },
  {
    code: "DRIVER_DISPUTE_FLOW",
    name: "Driver Dispute Flow",
    description: "Driver has a completed booking with an open dispute about service quality",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "DISPUTED", ageDescription: "5 days ago", notes: "Service quality complaint" },
      { type: "dispute", status: "OPEN", ageDescription: "4 days ago", notes: "Incomplete wash — spots missed on roof" },
    ],
  },
  {
    code: "DRIVER_CANCELLED",
    name: "Driver Cancellation",
    description: "Driver cancelled a booking within the allowed window",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "CUSTOMER_CANCELLED", ageDescription: "1 week ago", notes: "Route changed, cancellation within window" },
    ],
  },
  {
    code: "FLEET_ADMIN_OVERVIEW",
    name: "Fleet Admin Overview",
    description: "Fleet admin sees a mix of recent/upcoming bookings across fleet vehicles",
    targetPersona: "fleet_admin_demo_primary",
    entities: [
      { type: "booking", status: "COMPLETED", ageDescription: "1 day ago", notes: "Vehicle NEB-101 washed" },
      { type: "booking", status: "PROVIDER_CONFIRMED", ageDescription: "tomorrow", notes: "Vehicle NEB-202 scheduled" },
      { type: "booking", status: "IN_SERVICE", ageDescription: "now", notes: "Vehicle NEB-303 currently being washed" },
      { type: "booking", status: "NO_SHOW", ageDescription: "2 days ago", notes: "Vehicle NEB-104 missed appointment" },
    ],
  },
  {
    code: "PROVIDER_QUEUE",
    name: "Provider Confirmation Queue",
    description: "Provider has pending bookings awaiting confirmation/decline",
    targetPersona: "provider_admin_demo_primary",
    entities: [
      { type: "booking", status: "HELD", ageDescription: "30 min ago", notes: "New booking awaiting confirmation" },
      { type: "booking", status: "HELD", ageDescription: "15 min ago", notes: "Another pending booking" },
      { type: "booking", status: "HELD", ageDescription: "5 min ago", notes: "Latest booking request" },
    ],
  },
  {
    code: "PROVIDER_DAILY_SCHEDULE",
    name: "Provider Daily Schedule",
    description: "Provider has a full day of confirmed bookings showing daily operations",
    targetPersona: "provider_admin_demo_primary",
    entities: [
      { type: "booking", status: "COMPLETED", ageDescription: "today -6h", notes: "Early morning wash done" },
      { type: "booking", status: "COMPLETED", ageDescription: "today -4h", notes: "Mid-morning wash done" },
      { type: "booking", status: "IN_SERVICE", ageDescription: "now", notes: "Currently in progress" },
      { type: "booking", status: "PROVIDER_CONFIRMED", ageDescription: "today +2h", notes: "Afternoon booking" },
      { type: "booking", status: "PROVIDER_CONFIRMED", ageDescription: "today +4h", notes: "Late afternoon booking" },
    ],
  },
  {
    code: "PROVIDER_DECLINED_BOOKING",
    name: "Provider Declined Booking",
    description: "Provider declined a booking due to equipment maintenance",
    targetPersona: "provider_admin_demo_primary",
    entities: [
      { type: "booking", status: "PROVIDER_DECLINED", ageDescription: "2 days ago", notes: "Declined — bay under maintenance" },
    ],
  },
  {
    code: "PROVIDER_PAYOUT_CYCLE",
    name: "Provider Payout Cycle",
    description: "Provider has completed bookings ready for payout settlement",
    targetPersona: "provider_admin_demo_primary",
    entities: [
      { type: "booking", status: "SETTLED", ageDescription: "1 week ago", notes: "Paid out in last batch" },
      { type: "payout", status: "COMPLETED", ageDescription: "5 days ago", notes: "Payout batch with 8 bookings" },
      { type: "booking", status: "COMPLETED", ageDescription: "2 days ago", notes: "Pending next payout cycle" },
    ],
  },
  {
    code: "ADMIN_DISPUTE_QUEUE",
    name: "Admin Dispute Queue",
    description: "Admin has open disputes requiring review across multiple providers",
    targetPersona: "support_admin_demo_primary",
    entities: [
      { type: "dispute", status: "OPEN", ageDescription: "1 day ago", notes: "Service quality — NYC provider" },
      { type: "dispute", status: "UNDER_REVIEW", ageDescription: "3 days ago", notes: "Overcharge claim — Detroit provider" },
      { type: "dispute", status: "CUSTOMER_UPHELD", ageDescription: "1 week ago", notes: "Resolved — partial refund issued" },
    ],
  },
  {
    code: "ADMIN_KPI_REALISM",
    name: "Admin KPI Dashboard Realism",
    description: "Sufficient data density for meaningful KPI charts (GMV, bookings/day, provider utilization)",
    targetPersona: "super_admin_demo_primary",
    entities: [
      { type: "booking", status: "COMPLETED", ageDescription: "last 30 days spread", notes: "Historical volume for charts" },
      { type: "booking", status: "SETTLED", ageDescription: "last 30 days spread", notes: "Revenue data for GMV" },
    ],
  },
  {
    code: "NOSHOW_SCENARIO",
    name: "No-Show Scenario",
    description: "Driver was marked as no-show, charged cancellation fee",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "NO_SHOW", ageDescription: "4 days ago", notes: "Missed wash at Newark location" },
    ],
  },
  {
    code: "REFUND_SCENARIO",
    name: "Refund Scenario",
    description: "Booking was refunded after provider error",
    targetPersona: "driver_demo_primary",
    entities: [
      { type: "booking", status: "REFUNDED", ageDescription: "1 week ago", notes: "Provider used wrong chemicals — full refund" },
    ],
  },
];

export function getScenario(code: string): ScenarioDefinition {
  const s = GOLDEN_SCENARIOS.find((s) => s.code === code);
  if (!s) throw new Error(`Unknown scenario: ${code}`);
  return s;
}

export function getScenariosForPersona(personaCode: string): ScenarioDefinition[] {
  return GOLDEN_SCENARIOS.filter((s) => s.targetPersona === personaCode);
}
