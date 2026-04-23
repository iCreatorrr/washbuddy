/**
 * Unit tests for the pure bay-selection logic. Run with:
 *     pnpm --filter @workspace/api-server exec tsx --test src/lib/bayMatching.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveVehicleClassFromLength,
  isBayOutOfServiceForWindow,
  normalizeVehicleClass,
  pickTightestFit,
  type BayCandidate,
  type BookingWindow,
} from "./bayMatching";

function bay(overrides: Partial<BayCandidate>): BayCandidate {
  return {
    id: "id",
    name: "Bay X",
    supportedClasses: ["SMALL", "MEDIUM"],
    isActive: true,
    outOfServiceSince: null,
    outOfServiceEstReturn: null,
    ...overrides,
  };
}

const T0 = new Date("2026-04-23T14:00:00Z");
const T1 = new Date("2026-04-23T14:30:00Z");
const T2 = new Date("2026-04-23T15:00:00Z");

test("picks the bay with the fewest supported classes (tightest fit)", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["SMALL", "MEDIUM"] });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["SMALL", "MEDIUM", "LARGE"] });
  const b3 = bay({ id: "b3", name: "Bay 3", supportedClasses: ["MEDIUM", "LARGE", "EXTRA_LARGE"] });
  const picked = pickTightestFit([b3, b2, b1], [], "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b1");
});

test("tiebreaker: numeric-aware name ordering", () => {
  const b10 = bay({ id: "b10", name: "Bay 10", supportedClasses: ["MEDIUM", "LARGE"] });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["MEDIUM", "LARGE"] });
  const picked = pickTightestFit([b10, b2], [], "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b2");
});

test("excludes inactive bays", () => {
  const active = bay({ id: "a", name: "Bay 1", supportedClasses: ["MEDIUM"], isActive: true });
  const inactive = bay({ id: "i", name: "Bay 0", supportedClasses: ["MEDIUM"], isActive: false });
  const picked = pickTightestFit([inactive, active], [], "MEDIUM", T0, T1);
  assert.equal(picked?.id, "a");
});

test("excludes bays that don't support the requested class", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["SMALL"] });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["MEDIUM"] });
  const picked = pickTightestFit([b1, b2], [], "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b2");
});

test("excludes bays with overlapping bookings", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"] });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["MEDIUM", "LARGE"] });
  const booked: BookingWindow[] = [
    { washBayId: "b1", scheduledStartAtUtc: T0, scheduledEndAtUtc: T2 },
  ];
  const picked = pickTightestFit([b1, b2], booked, "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b2");
});

test("back-to-back bookings don't conflict (zero buffer)", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"] });
  const booked: BookingWindow[] = [
    // previous booking ends exactly when ours starts
    { washBayId: "b1", scheduledStartAtUtc: new Date("2026-04-23T13:30:00Z"), scheduledEndAtUtc: T0 },
  ];
  const picked = pickTightestFit([b1], booked, "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b1");
});

test("excludes bays out-of-service covering the window", () => {
  const b1 = bay({
    id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"],
    outOfServiceSince: new Date("2026-04-22T00:00:00Z"),
    outOfServiceEstReturn: new Date("2026-04-25T00:00:00Z"),
  });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["MEDIUM", "LARGE"] });
  const picked = pickTightestFit([b1, b2], [], "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b2");
});

test("out-of-service with no estimated return is treated as covering", () => {
  const b1 = bay({
    id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"],
    outOfServiceSince: new Date("2026-04-22T00:00:00Z"),
    outOfServiceEstReturn: null,
  });
  const picked = pickTightestFit([b1], [], "MEDIUM", T0, T1);
  assert.equal(picked, null);
});

test("out-of-service ending before the window starts is ignored", () => {
  const b1 = bay({
    id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"],
    outOfServiceSince: new Date("2026-04-22T00:00:00Z"),
    outOfServiceEstReturn: new Date("2026-04-23T13:30:00Z"),
  });
  // helper only compares against windowEnd, so returning before windowEnd = not covering
  assert.equal(isBayOutOfServiceForWindow(b1, T1), false);
});

test("returns null when no bay fits", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["SMALL"] });
  const picked = pickTightestFit([b1], [], "EXTRA_LARGE", T0, T1);
  assert.equal(picked, null);
});

test("bookings on other bays don't affect the choice", () => {
  const b1 = bay({ id: "b1", name: "Bay 1", supportedClasses: ["MEDIUM"] });
  const b2 = bay({ id: "b2", name: "Bay 2", supportedClasses: ["MEDIUM", "LARGE"] });
  const booked: BookingWindow[] = [
    { washBayId: "b2", scheduledStartAtUtc: T0, scheduledEndAtUtc: T2 },
  ];
  const picked = pickTightestFit([b1, b2], booked, "MEDIUM", T0, T1);
  assert.equal(picked?.id, "b1");
});

test("deriveVehicleClassFromLength maps PRD length bands", () => {
  assert.equal(deriveVehicleClassFromLength(200), "SMALL");
  assert.equal(deriveVehicleClassFromLength(299), "SMALL");
  assert.equal(deriveVehicleClassFromLength(300), "MEDIUM");
  assert.equal(deriveVehicleClassFromLength(419), "MEDIUM");
  assert.equal(deriveVehicleClassFromLength(420), "LARGE");
  assert.equal(deriveVehicleClassFromLength(539), "LARGE");
  assert.equal(deriveVehicleClassFromLength(540), "EXTRA_LARGE");
  assert.equal(deriveVehicleClassFromLength(999), "EXTRA_LARGE");
  assert.equal(deriveVehicleClassFromLength(0), null);
  assert.equal(deriveVehicleClassFromLength(-10), null);
  assert.equal(deriveVehicleClassFromLength(null), null);
});

test("normalizeVehicleClass accepts valid enum values (case-insensitive)", () => {
  assert.equal(normalizeVehicleClass("medium"), "MEDIUM");
  assert.equal(normalizeVehicleClass("EXTRA_LARGE"), "EXTRA_LARGE");
  assert.equal(normalizeVehicleClass("bogus"), null);
  assert.equal(normalizeVehicleClass(""), null);
  assert.equal(normalizeVehicleClass(null), null);
});
