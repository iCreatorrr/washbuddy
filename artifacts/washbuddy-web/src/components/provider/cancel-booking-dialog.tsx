/**
 * Provider-side cancellation confirmation dialog.
 *
 * The provider clicks "Cancel Booking" on a Daily Board row → this
 * dialog asks WHY before submitting. The reason drives the customer-
 * side notification text on the server (see notifyBookingCancelled).
 *
 * The four reason codes are duplicated server-side as
 * VALID_CANCELLATION_REASONS in routes/bookings.ts — keep them in
 * sync if the list ever changes.
 */

import React, { useState } from "react";
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

export function CancelBookingDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: CancellationReasonCode, note: string) => void | Promise<void>;
  isPending?: boolean;
}) {
  const [reason, setReason] = useState<CancellationReasonCode | null>(null);
  const [note, setNote] = useState<string>("");

  // Reset selection whenever the dialog re-opens — providers should
  // never see a stale prior selection on a fresh cancel.
  React.useEffect(() => {
    if (open) {
      setReason(null);
      setNote("");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || isPending) return;
    onSubmit(reason, note.trim());
  };

  return (
    // Fixed full-viewport backdrop + centered card. p-4 on the backdrop
    // keeps the card off the screen edges at narrow widths so the close
    // button never hugs the gutter.
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
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
            <p className="text-sm text-slate-500 mt-0.5">Why is this booking being cancelled?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 -mr-1 -mt-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

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
              Note for our records (optional)
            </label>
            <textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Anything worth remembering?"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 p-4 border-t border-slate-100 bg-slate-50">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-initial" disabled={isPending}>
            Keep booking
          </Button>
          <Button
            type="submit"
            disabled={!reason || isPending}
            isLoading={isPending}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            Cancel booking
          </Button>
        </div>
      </form>
    </div>
  );
}
