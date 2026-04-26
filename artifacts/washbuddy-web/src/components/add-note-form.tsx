/**
 * Append-only "Add a note" affordance. Used on:
 *   - Driver-side booking detail (CustomerBody) — viewerRole="DRIVER"
 *   - Provider-side booking detail (ProviderBody) — viewerRole="PROVIDER"
 *   - Daily Board expanded row (provider) — viewerRole="PROVIDER"
 *
 * The server's POST /api/bookings/:id/notes auths both providers and
 * the booking's customer (driver) and freezes authorRole at the row
 * (PROVIDER / DRIVER / FLEET) — so a single submit path covers all
 * three surfaces, only the surrounding copy changes.
 */

import React, { useState } from "react";
import { Card, Button } from "@/components/ui";
import { StickyNote, Send } from "lucide-react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

type ViewerRole = "DRIVER" | "PROVIDER";

interface Props {
  bookingId: string;
  onSubmitted: () => void;
  /** Tunes the placeholder + the "visible to..." help text. Defaults
   * to driver framing for backward compatibility. */
  viewerRole?: ViewerRole;
}

export function AddNoteForm({ bookingId, onSubmitted, viewerRole = "DRIVER" }: Props) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isProvider = viewerRole === "PROVIDER";
  const placeholder = isProvider
    ? "Internal note for your team (e.g. left-side panel needs touch-up wax)"
    : "Anything the provider should know? (e.g. running 5 min late)";
  const helpText = isProvider
    ? "Internal note — visible to your team only. The driver does not see provider notes."
    : "Notes are visible to the provider and can't be edited once added.";

  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/api/bookings/${bookingId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed to add note");
      }
      toast.success("Note added");
      setContent("");
      setOpen(false);
      onSubmitted();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <StickyNote className="h-4 w-4" /> + Add a note
      </button>
    );
  }
  return (
    <Card className={`p-4 ${isProvider ? "border-slate-200 bg-slate-50/40" : "border-amber-100 bg-amber-50/30"}`}>
      <p className={`text-xs mb-2 ${isProvider ? "text-slate-600" : "text-amber-800"}`}>{helpText}</p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 2000))}
        autoFocus
        rows={3}
        placeholder={placeholder}
        className={`w-full rounded-lg p-2 text-sm bg-white focus:outline-none resize-none ${isProvider ? "border border-slate-300 focus:border-primary" : "border border-amber-200 focus:border-amber-400"}`}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-[11px] text-slate-500">{content.length}/2000</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setOpen(false); setContent(""); }}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!content.trim() || submitting} isLoading={submitting} className="gap-1">
            <Send className="h-3.5 w-3.5" /> Send
          </Button>
        </div>
      </div>
    </Card>
  );
}
