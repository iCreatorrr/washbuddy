/**
 * Cancellation confirmation dialog. Two modes:
 *   - mode="reason" (default): provider-side, requires picking a reason
 *     code + optional internal note before submit.
 *   - mode="confirm": driver-side, simple Keep/Cancel without reason
 *     capture. The onSubmit callback receives reasonCode=null and
 *     note="".
 *
 * The component portals into document.body so it escapes any
 * transform/filter/perspective ancestor (framer-motion containers,
 * motion.div rows on Daily Board, etc) — without the portal, the
 * "fixed" backdrop gets clipped to the motion container's bounds and
 * the user sees a half-rendered dialog trapped inside a card.
 *
 * The four reason codes are duplicated server-side as
 * VALID_CANCELLATION_REASONS in routes/bookings.ts — keep them in
 * sync if the list ever changes. Customer-facing display strings
 * live in lib/cancellationReasons.ts so notification + booking-detail
 * + My Bookings card all read the same source of truth.
 */

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { AlertTriangle, X } from "lucide-react";

export type CancellationReasonCode =
  | "CUSTOMER_REQUESTED"
  | "PROVIDER_UNAVAILABLE"
  | "CUSTOMER_NO_SHOW"
  | "OTHER";

interface ReasonOption {
  code: CancellationReasonCode;
  label: string;
  helper: string;
}

const REASON_OPTIONS: ReasonOption[] = [
  { code: "CUSTOMER_REQUESTED", label: "Customer requested cancellation", helper: "Customer called or messaged us to cancel" },
  { code: "PROVIDER_UNAVAILABLE", label: "Unable to provide service", helper: "Equipment issue, staff shortage, weather, etc." },
  { code: "CUSTOMER_NO_SHOW", label: "Customer no-show", helper: "Didn't arrive" },
  { code: "OTHER", label: "Other", helper: "" },
];

export type CancelDialogMode = "reason" | "confirm";

export function CancelBookingDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  mode = "reason",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: CancellationReasonCode | null, note: string) => void | Promise<void>;
  isPending?: boolean;
  mode?: CancelDialogMode;
}) {
  const [reason, setReason] = useState<CancellationReasonCode | null>(null);
  const [note, setNote] = useState<string>("");

  // Reset selection on every open. Without this, a provider who
  // dismissed an earlier dialog would see the prior selection — the
  // wrong default for a destructive action.
  useEffect(() => {
    if (open) {
      setReason(null);
      setNote("");
    }
  }, [open]);

  // Body scroll lock + escape key. Both are scoped to the dialog
  // being open so they don't leak when it closes.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isPending, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const submitEnabled = mode === "confirm" ? true : !!reason;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitEnabled || isPending) return;
    onSubmit(mode === "reason" ? reason : null, note.trim());
  };

  const dialog = (
    // Fixed full-viewport backdrop. Items-end on mobile gives a bottom-
    // sheet feel; items-center centers as a modal on tablet+. p-4 on
    // the backdrop keeps the card off the screen edges.
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!isPending) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="h-10 w-10 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="cancel-dialog-title" className="text-base font-bold text-slate-900 leading-tight">Cancel this booking?</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {mode === "reason" ? "Why is this booking being cancelled?" : "This action can't be undone."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={isPending}
            className="p-1 -mr-1 -mt-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "reason" && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
            {REASON_OPTIONS.map((opt) => {
              const selected = reason === opt.code;
              return (
                <label
                  key={opt.code}
                  className={`block rounded-xl border-2 p-3 cursor-pointer transition-colors ${
                    selected ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="cancel-reason"
                      value={opt.code}
                      checked={selected}
                      onChange={() => setReason(opt.code)}
                      className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 leading-tight">{opt.label}</p>
                      {opt.helper && <p className="text-xs text-slate-500 mt-0.5">{opt.helper}</p>}
                    </div>
                  </div>
                </label>
              );
            })}

            <div className="pt-2">
              <label htmlFor="cancel-note" className="block text-xs font-medium text-slate-600 mb-1">
                Add a message for the customer (optional)
              </label>
              <textarea
                id="cancel-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. Sorry — our machine is down today. Could you book Wednesday?"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Visible to the customer in their cancellation notification.
              </p>
            </div>
          </div>
        )}

        {/* Button order: Keep booking is the SAFE default — primary on
            top (mobile) and right (desktop). Cancel booking is the
            secondary destructive action: muted text below on mobile,
            outlined red on the left on desktop. flex-col-reverse +
            sm:flex-row puts Keep above Cancel on mobile. */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 p-4 border-t border-slate-100 bg-slate-50">
          <Button
            type="submit"
            disabled={!submitEnabled || isPending}
            isLoading={isPending}
            variant="outline"
            className="flex-1 sm:order-1 sm:flex-initial border-red-200 text-red-700 hover:bg-red-50 hover:border-red-300"
          >
            Cancel booking
          </Button>
          <Button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 sm:order-2 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
          >
            Keep booking
          </Button>
        </div>
      </form>
    </div>
  );

  return createPortal(dialog, document.body);
}
