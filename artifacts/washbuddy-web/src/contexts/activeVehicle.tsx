/**
 * Active-vehicle context: the driver's currently-selected default vehicle
 * plus their full eligible set, fetched once and shared across pages.
 *
 * Source of truth is the server (User.defaultVehicleId). The hook reads
 * `GET /api/vehicles` (which returns each vehicle pre-flagged with
 * isDefault / isEligibleForDefault / isOwnedByUser), surfaces the
 * eligible subset, and exposes:
 *   - activeVehicle: the row marked isDefault, or null if none / no
 *     vehicles yet / lazy-invalidated
 *   - eligibleVehicles: candidates the driver can switch to
 *   - setActive(vehicleId): server PATCH + optimistic local update
 *   - refresh(): re-fetches (used after add / delete / role changes)
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface ActiveVehicleRow {
  id: string;
  unitNumber: string;
  nickname: string | null;
  bodyType: string;
  lengthInches: number;
  fleetId: string | null;
  ownerUserId: string | null;
  fleet: { id: string; name: string } | null;
  isDefault: boolean;
  isEligibleForDefault: boolean;
  isOwnedByUser: boolean;
}

interface ActiveVehicleState {
  loading: boolean;
  hasAnyVehicle: boolean;
  activeVehicle: ActiveVehicleRow | null;
  eligibleVehicles: ActiveVehicleRow[];
  /** All vehicles the user can see (eligible + read-only fleet listings) */
  allVehicles: ActiveVehicleRow[];
  setActive: (vehicleId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ActiveVehicleState | null>(null);

export function ActiveVehicleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<ActiveVehicleRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/vehicles`, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setVehicles(d.vehicles ?? []);
    } catch {
      // Don't toast on background refreshes — pages that need vehicles will
      // surface their own loading/error states. Just log and keep prior data.
      // eslint-disable-next-line no-console
      console.warn("[ActiveVehicle] refresh failed");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const setActive = useCallback(async (vehicleId: string) => {
    // Optimistic flip — revert on failure.
    const prev = vehicles;
    setVehicles((vs) => vs.map((v) => ({ ...v, isDefault: v.id === vehicleId })));
    try {
      const r = await fetch(`${API_BASE}/api/users/me/default-vehicle`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed to set active vehicle");
      }
    } catch (err: any) {
      setVehicles(prev);
      toast.error(err?.message || "Could not switch active vehicle");
    }
  }, [vehicles]);

  const value = useMemo<ActiveVehicleState>(() => {
    const eligible = vehicles.filter((v) => v.isEligibleForDefault);
    const active = vehicles.find((v) => v.isDefault) ?? null;
    return {
      loading,
      hasAnyVehicle: eligible.length > 0,
      activeVehicle: active,
      eligibleVehicles: eligible,
      allVehicles: vehicles,
      setActive,
      refresh,
    };
  }, [vehicles, loading, setActive, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveVehicle(): ActiveVehicleState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActiveVehicle must be used inside <ActiveVehicleProvider>");
  return v;
}
