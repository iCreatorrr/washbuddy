import React, { useState, useEffect } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { Star, AlertTriangle, Sparkles, ChevronDown, MessageSquare, Camera, StickyNote, Package } from "lucide-react";
import { formatCurrency, formatDate, formatVehicleClass } from "@/lib/utils";
import { toast } from "sonner";
import { PhotoPrompt } from "./photo-prompt";
import { BODY_TYPE_ICON, BODY_TYPE_STYLE, deriveSizeClassFromLengthInches, normalizeBodyType, type BodyType } from "@/lib/vehicleBodyType";
import { groupNotesByAuthorRole, noteSectionLabel, noteMetaLine } from "@/lib/noteLabels";
import { resolveBookingDisplayName } from "@/lib/bookingDisplay";
import { NoteEditor, NoteKebabMenu } from "@/components/note-actions-menu";
import { AddNoteForm } from "@/components/add-note-form";

const API_BASE = import.meta.env.VITE_API_URL || "";

const VEHICLE_CLASS_BADGE: Record<string, { label: string; color: string }> = {
  SMALL:       { label: "S",  color: "bg-slate-200 text-slate-700" },
  MEDIUM:      { label: "M",  color: "bg-blue-200 text-blue-700" },
  LARGE:       { label: "L",  color: "bg-indigo-200 text-indigo-700" },
  EXTRA_LARGE: { label: "XL", color: "bg-purple-200 text-purple-700" },
};

function classBadgeFor(booking: any): { label: string; color: string } {
  const fromVehicle = booking.vehicle?.lengthInches != null ? deriveSizeClassFromLengthInches(booking.vehicle.lengthInches) : null;
  const key = fromVehicle || booking.fleetPlaceholderClass || "MEDIUM";
  return VEHICLE_CLASS_BADGE[key] || VEHICLE_CLASS_BADGE.MEDIUM;
}

/** Resolve the body type for a booking: prefers vehicle.bodyType, falls
 * back to OTHER for bookings without a vehicle (fleet-placeholder rows).
 * Returns the type plus its style + icon so callers can render the accent
 * (small left stripe / chip) without re-deriving. */
function bodyAccentFor(booking: any): { type: BodyType; style: typeof BODY_TYPE_STYLE[BodyType]; Icon: typeof BODY_TYPE_ICON[BodyType] } {
  const type = normalizeBodyType(booking.vehicle?.bodyType ?? null);
  return { type, style: BODY_TYPE_STYLE[type], Icon: BODY_TYPE_ICON[type] };
}

const SOURCE_BADGE: Record<string, { label: string; variant: string; className?: string }> = {
  PLATFORM: { label: "WashBuddy", variant: "default" },
  DIRECT: { label: "Direct", variant: "secondary" },
  WALK_IN: { label: "Walk-in", variant: "outline", className: "text-orange-600 border-orange-300" },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PROVIDER_CONFIRMED: { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" },
  CHECKED_IN: { label: "Checked In", className: "bg-amber-100 text-amber-700 border-amber-200" },
  IN_SERVICE: { label: "In Progress", className: "bg-green-100 text-green-700 border-green-200" },
  COMPLETED_PENDING_WINDOW: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  COMPLETED: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  SETTLED: { label: "Complete", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

/** Render the bay label without the doubled "Bay Bay 3" — bay names are
 * usually stored as "Bay 3" already, so a leading "Bay: " label collapses
 * the prefix to just "Bay 3". Falls back to "Bay: Unassigned". */
function stripBayPrefix(name: string | null | undefined): string {
  if (!name) return "Bay: Unassigned";
  const trimmed = name.trim();
  if (/^bay\b/i.test(trimmed)) return trimmed;
  return `Bay: ${trimmed}`;
}

function ElapsedTimer({ startedAt, durationMins }: { startedAt: string; durationMins: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const pct = elapsed / (durationMins * 60);
  const color = pct < 0.75 ? "text-green-600" : pct < 1 ? "text-amber-600" : "text-red-600";

  return <span className={`text-sm font-mono font-bold ${color}`}>{mins}:{String(secs).padStart(2, "0")}</span>;
}

export function BookingCard({
  booking,
  onStatusChange,
  rowExpanded,
  onToggleExpanded,
}: {
  booking: any;
  onStatusChange: () => void;
  // Optional — when the parent owns expansion state (Daily Board does
  // this so it survives refetches), defer to it. Falls back to local
  // state for any caller that hasn't migrated yet.
  rowExpanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = rowExpanded ?? localExpanded;
  const setExpanded = (next: boolean | ((p: boolean) => boolean)) => {
    if (onToggleExpanded) onToggleExpanded();
    else setLocalExpanded(next);
  };
  const [actionLoading, setActionLoading] = useState(false);
  const [showPhotoPrompt, setShowPhotoPrompt] = useState<"BEFORE" | "AFTER" | null>(null);
  // Which note in this booking is currently being edited inline. The
  // editor replaces the note's text region (full-width); the kebab
  // stays put. Null when nothing is being edited.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const b = booking;
  const vc = classBadgeFor(b);
  const accent = bodyAccentFor(b);
  const src = SOURCE_BADGE[b.bookingSource] || SOURCE_BADGE.PLATFORM;
  const st = STATUS_BADGE[b.status] || STATUS_BADGE.PROVIDER_CONFIRMED;
  const displayName = resolveBookingDisplayName(b);
  const time = new Date(b.scheduledStartAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: b.locationTimezone });
  const BodyIcon = accent.Icon;

  const handleTransition = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const endpoint = newStatus === "CHECKED_IN" ? "checkin" : newStatus === "IN_SERVICE" ? "start-service" : "complete";
      const res = await fetch(`${API_BASE}/api/bookings/${b.id}/${endpoint}`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      toast.success(newStatus === "CHECKED_IN" ? "Vehicle checked in" : newStatus === "IN_SERVICE" ? "Wash started" : "Wash completed");
      onStatusChange();
    } catch { toast.error("Action failed. Please retry."); }
    finally { setActionLoading(false); }
  };

  // Mobile-first source accent: walk-in gets an orange left stripe,
  // direct gets a slate one, platform stays uncoloured (the body-type
  // stripe still wins when present). At md+ we restore the source text
  // badge; on mobile the stripe carries the signal alone.
  const sourceStripe =
    b.bookingSource === "WALK_IN" ? "bg-orange-400" :
    b.bookingSource === "DIRECT" ? "bg-slate-300" : null;
  // Status dot for "in flight" rows on mobile: replaces the verbose
  // "Checked In" / "In Progress" / "Complete" badge that ate ~80px of
  // row width. Provider-confirmed rows still live under the Upcoming
  // header so they need no dot.
  const statusDot =
    b.status === "CHECKED_IN" ? "bg-amber-400" :
    b.status === "IN_SERVICE" ? "bg-green-500" :
    (b.status === "COMPLETED" || b.status === "COMPLETED_PENDING_WINDOW" || b.status === "SETTLED") ? "bg-emerald-500" :
    null;

  // "NEW" badge: arrived in the last hour and not cancelled. Pure
  // function of (createdAt, status, now) — re-evaluated every render,
  // no localStorage. Within a long-lived Daily Board view, the badge
  // self-fades after 60 min as React refetches and re-derives.
  const isCancelled = b.status === "CUSTOMER_CANCELLED" || b.status === "PROVIDER_CANCELLED" || b.status === "PROVIDER_DECLINED" || b.status === "EXPIRED" || b.status === "NO_SHOW";
  const isNew = (() => {
    if (isCancelled) return false;
    if (!b.createdAt) return false;
    const created = new Date(b.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    return Date.now() - created < 60 * 60 * 1000;
  })();

  return (
    <Card className="relative border hover:border-primary/30 transition-colors overflow-hidden">
      {/* Stacked left stripes: body-type (vehicle visual signal) takes
          priority when there's a vehicle; otherwise booking-source stripe
          (walk-in vs direct vs platform) carries the visual id. */}
      {b.vehicle?.bodyType ? (
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent.style.stripe}`} aria-hidden />
      ) : sourceStripe ? (
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${sourceStripe}`} aria-hidden />
      ) : null}
      {/* Collapsed row — mobile keeps it ruthless: time, size avatar,
          name (flex-1 truncate), bay (md+), source badge (md+), status
          dot, chevron. Tags/addons/elapsed-timer all move to expanded. */}
      <div className={`flex items-center gap-2 px-4 py-3 cursor-pointer ${b.vehicle?.bodyType || sourceStripe ? "pl-5" : ""}`} onClick={() => setExpanded(!expanded)}>
        <span className="text-sm font-medium text-slate-600 w-[58px] sm:w-[70px] shrink-0">{time}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${vc.color}`}>
          <span className="text-xs font-bold">{vc.label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            {/* "NEW" badge sits inline with the customer name so it
                doesn't claim a separate column at narrow widths. The
                wrapper p truncates if the combined width overflows; the
                badge itself stays whole. */}
            {isNew && (
              <span
                className="inline-flex items-center align-[1px] mr-1.5 px-1.5 py-px rounded-full text-[10px] font-bold leading-none bg-orange-500 text-white shrink-0"
                title="Booked in the last hour"
              >
                NEW
              </span>
            )}
            {displayName}
          </p>
          {(() => {
            const parts = [b.fleetName, b.vehicle?.unitNumber].filter(Boolean) as string[];
            if (parts.length === 0) return null;
            return <p className="text-xs text-slate-500 truncate">{parts.join(" · ")}</p>;
          })()}
        </div>
        <span className="text-xs w-[80px] truncate hidden md:block" title={b.washBay?.name ? `Bay: ${b.washBay.name}` : "No bay assigned"}>
          {b.washBay?.name
            ? <span className="text-slate-600 font-medium">{b.washBay.name}</span>
            : <span className="text-orange-500">Unassigned</span>}
        </span>
        {/* Source badge: md+ only — on mobile the left stripe conveys it
            without text. Walk-in / Direct / Platform all stay legible at
            tablet width and up. */}
        <Badge className={`text-[10px] shrink-0 hidden md:inline-flex ${src.className || ""}`} variant={src.variant as any}>{src.label}</Badge>
        {/* Status: text badge at md+ for full clarity, dot-only on mobile.
            The Upcoming-section header already says "Scheduled" so we
            drop the badge for PROVIDER_CONFIRMED at every breakpoint. */}
        {b.status !== "PROVIDER_CONFIRMED" && (
          <>
            <Badge className={`text-[10px] shrink-0 hidden md:inline-flex ${st.className}`}>{st.label}</Badge>
            {statusDot && (
              <span
                className={`md:hidden h-2 w-2 rounded-full shrink-0 ${statusDot}`}
                aria-label={st.label}
                title={st.label}
              />
            )}
          </>
        )}
        {b.status === "IN_SERVICE" && b.serviceStartedAtUtc && (
          <span className="hidden md:inline">
            <ElapsedTimer startedAt={b.serviceStartedAtUtc} durationMins={30} />
          </span>
        )}
        {/* Tags + add-on count: md+ only. The badges are useful context but
            on a 375px row they push the customer name to truncate. They
            still surface in the expanded view. */}
        <div className="hidden md:flex gap-0.5 w-[48px] shrink-0">
          {b.clientTags?.includes("VIP") && <Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
          {b.clientTags?.includes("SERVICE_RECOVERY") && <AlertTriangle className="h-4 w-4 text-red-400" />}
          {b.clientTags?.includes("NEW_CLIENT") && <Sparkles className="h-4 w-4 text-green-400" />}
          {(b.addOnCount ?? b.addOns?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-500" title={`${b.addOnCount ?? b.addOns?.length} add-on(s)`}>
              <Package className="h-3.5 w-3.5" />{b.addOnCount ?? b.addOns?.length}
            </span>
          )}
        </div>
        {/* Chevron is its own button so clicking the icon (not just the row
            body) toggles expand without travelling to the row's onClick. */}
        <button
          type="button"
          aria-label={expanded ? "Collapse row" : "Expand row"}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="p-1 -mr-1 rounded-md hover:bg-slate-100 transition-colors shrink-0"
        >
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          {/* Service name lives here in the expanded view (it's no
              longer in the collapsed row). Surface as the first line
              so an operator who clicked the row to see "what is this"
              sees the answer immediately. */}
          <div className="text-sm font-semibold text-slate-900">{b.serviceNameSnapshot}</div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Vehicle: {b.vehicle?.unitNumber || formatVehicleClass(b.fleetPlaceholderClass) || "N/A"}</span>
            <span>{stripBayPrefix(b.washBay?.name)}</span>
            <span>Price: {formatCurrency(b.totalPriceMinor, b.currencyCode)}</span>
            {b.discountAmountMinor > 0 && <span className="text-green-600">Discount: -{formatCurrency(b.discountAmountMinor)}</span>}
          </div>

          {/* Tags + elapsed timer: surfaced in the expanded view because
              mobile collapsed row dropped them to keep the customer name
              from truncating. md+ still has them in the collapsed row but
              they read fine here too. */}
          {(b.clientTags?.length > 0 || (b.addOnCount ?? b.addOns?.length ?? 0) > 0 || (b.status === "IN_SERVICE" && b.serviceStartedAtUtc)) && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {b.clientTags?.includes("VIP") && (
                <span className="inline-flex items-center gap-1 text-amber-600 font-semibold"><Star className="h-3.5 w-3.5 fill-amber-400" />VIP</span>
              )}
              {b.clientTags?.includes("SERVICE_RECOVERY") && (
                <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />Service recovery</span>
              )}
              {b.clientTags?.includes("NEW_CLIENT") && (
                <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><Sparkles className="h-3.5 w-3.5" />New client</span>
              )}
              {b.status === "IN_SERVICE" && b.serviceStartedAtUtc && (
                <span className="inline-flex items-center gap-1 text-slate-600">Elapsed: <ElapsedTimer startedAt={b.serviceStartedAtUtc} durationMins={30} /></span>
              )}
            </div>
          )}

          {/* "Booked by" line — only for off-platform bookings, since
              for platform bookings the customer name in the primary
              label already attributes the booking. Walk-in / direct
              bookings hide who actually entered the booking otherwise. */}
          {(b.isOffPlatform || b.bookingSource === "WALK_IN" || b.bookingSource === "DIRECT") && b.assignedOperator && (
            <p className="text-xs text-slate-400">
              Booked by {[b.assignedOperator.firstName, b.assignedOperator.lastName].filter(Boolean).join(" ") || "operator"}
              {" · "}{b.bookingSource === "WALK_IN" ? "Walk-in" : b.bookingSource === "DIRECT" ? "Direct" : "Off-platform"}
            </p>
          )}

          {Array.isArray(b.washNotes) && b.washNotes.length > 0 && (
            <div className="space-y-2">
              {groupNotesByAuthorRole(b.washNotes).map(({ role, notes }) => {
                const incoming = role !== "PROVIDER";
                const wrap = incoming
                  ? "rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-1.5"
                  : "rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5";
                const labelClr = incoming ? "text-amber-800" : "text-slate-500";
                const iconClr = incoming ? "text-amber-700" : "text-slate-500";
                const textClr = incoming ? "text-amber-900" : "text-slate-700";
                return (
                  <div key={role} className={wrap}>
                    <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold ${labelClr}`}>
                      <StickyNote className={`h-3 w-3 ${iconClr}`} /> {noteSectionLabel("PROVIDER", role)}
                    </div>
                    {notes.map((n: any) => {
                      const meta = noteMetaLine(n, (d) => formatDate(typeof d === "string" ? d : d.toISOString(), "MMM d"));
                      // Daily Board is scoped to the operator's own
                      // location; every viewer is same-org for the
                      // bookings surfaced here, so PROVIDER notes get
                      // the kebab unconditionally.
                      const editable = role === "PROVIDER";
                      const isEditing = editingNoteId === n.id;
                      return (
                        <div key={n.id} className="flex items-start gap-1">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <NoteEditor
                                note={n}
                                onSaved={() => { setEditingNoteId(null); onStatusChange(); }}
                                onCancel={() => setEditingNoteId(null)}
                              />
                            ) : (
                              <>
                                <p className={`text-sm whitespace-pre-wrap ${textClr}`}>{n.content}</p>
                                {meta && <p className="text-[10px] text-slate-500 mt-0.5">{meta}</p>}
                              </>
                            )}
                          </div>
                          {editable && !isEditing && (
                            <NoteKebabMenu
                              noteId={n.id}
                              onRequestEdit={() => setEditingNoteId(n.id)}
                              onDeleted={onStatusChange}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Provider add-note. Renders unconditionally on Daily Board
              (every viewer here is same-org by definition — the
              endpoint scopes to the operator's location), so an
              operator can attach a note even on bookings that don't
              have one yet. onStatusChange refetches the day's data so
              the new note appears in the list inline. */}
          <div className="pt-1">
            <AddNoteForm bookingId={b.id} onSubmitted={onStatusChange} viewerRole="PROVIDER" />
          </div>

          {Array.isArray(b.addOns) && b.addOns.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-slate-600">
                <Package className="h-3 w-3" /> Add-ons
              </div>
              <ul className="text-sm text-slate-700 space-y-0.5">
                {b.addOns.map((a: any) => (
                  <li key={a.id} className="flex justify-between">
                    <span>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</span>
                    <span className="font-medium text-slate-900">{formatCurrency(a.totalMinor ?? a.priceMinor * (a.quantity ?? 1))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {b.photoCount > 0 && <span className="flex items-center gap-1"><Camera className="h-3 w-3" />{b.photoCount} photos</span>}
            {b.messageCount > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{b.messageCount} messages</span>}
          </div>

          {showPhotoPrompt && (
            <PhotoPrompt bookingId={b.id} photoType={showPhotoPrompt}
              onComplete={async () => {
                const wasType = showPhotoPrompt;
                setShowPhotoPrompt(null);
                if (wasType === "BEFORE") await handleTransition("IN_SERVICE");
                else onStatusChange(); // AFTER — status already changed
              }} />
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {b.status === "PROVIDER_CONFIRMED" && (
              <Button size="sm" onClick={() => handleTransition("CHECKED_IN")} isLoading={actionLoading} className="bg-blue-600 hover:bg-blue-700 text-white">Check In</Button>
            )}
            {b.status === "CHECKED_IN" && (
              <Button size="sm" onClick={() => setShowPhotoPrompt("BEFORE")} isLoading={actionLoading} className="bg-green-600 hover:bg-green-700 text-white">Start Wash</Button>
            )}
            {b.status === "IN_SERVICE" && (
              <Button size="sm" onClick={async () => { await handleTransition("COMPLETED_PENDING_WINDOW"); setShowPhotoPrompt("AFTER"); }} isLoading={actionLoading} className="bg-emerald-700 hover:bg-emerald-800 text-white">Complete Wash</Button>
            )}
            {!b.isOffPlatform && (
              <Button size="sm" variant="outline" className="gap-1"><MessageSquare className="h-3.5 w-3.5" />Message Driver</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
