/**
 * Two pieces for note mutation:
 *   - NoteKebabMenu: the ⋮ trigger + dropdown (Edit / Delete). Parent
 *     owns the "is this note in edit mode?" flag — so when the user
 *     clicks Edit, the parent can swap the note's text region for a
 *     full-width <NoteEditor>, leaving the kebab itself in place.
 *   - NoteEditor: a controlled textarea + Save/Cancel block that
 *     replaces a single note's display text inline. POSTs the PATCH
 *     directly so callers don't have to thread mutation logic through.
 *
 * Driver- and fleet-authored notes never get either component
 * (append-only enforcement is the server's job; we just don't render
 * the controls).
 */

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MoreVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Note {
  id: string;
  content: string;
}

export function NoteKebabMenu({
  noteId,
  onRequestEdit,
  onDeleted,
}: {
  noteId: string;
  onRequestEdit: () => void;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const submitDelete = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/api/notes/${noteId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed to delete note");
      }
      toast.success("Note deleted");
      onDeleted();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
      setConfirmingDelete(false);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); setConfirmingDelete(false); }}
        aria-label="Note actions"
        className="p-1 -mr-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-sm">
          {!confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => { setOpen(false); onRequestEdit(); }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600 border-t border-slate-100"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs text-slate-600">Delete this note? This can't be undone.</p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600 inline-flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={submitDelete}
                  disabled={submitting}
                  className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline editor that replaces the note's text region. Auto-grows
 * with content (no `resize-none` lock); Save/Cancel sit underneath
 * right-aligned so the destructive option is the right-most. */
export function NoteEditor({
  note,
  onSaved,
  onCancel,
}: {
  note: Note;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(note.content);
  const [submitting, setSubmitting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow as the user types — keeps the editing UX equivalent to
  // long-form notes that originally used the inline-textarea kebab
  // version. Re-runs on every keystroke so the height tracks content.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 80)}px`;
  }, [draft]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/api/notes/${note.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed to update note");
      }
      toast.success("Note updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
        autoFocus
        onClick={(e) => e.stopPropagation()}
        className="w-full min-h-[80px] border border-slate-300 rounded-md p-2 text-sm bg-white focus:border-primary focus:outline-none resize-none leading-relaxed"
      />
      <div className="flex justify-end items-center gap-2 mt-2">
        <span className="text-[11px] text-slate-400 mr-auto">{draft.length}/2000</span>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!draft.trim() || submitting} isLoading={submitting} className="gap-1">
          <Check className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  );
}

/** Backward-compatible wrapper for any caller that hasn't migrated to
 * the split components yet. Renders the kebab; when Edit is clicked
 * the editor pops up next to it (legacy behavior). New callers should
 * use NoteKebabMenu + NoteEditor directly so the editor can replace
 * the note's text region. */
export function NoteActionsMenu({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <NoteEditor
        note={note}
        onSaved={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <NoteKebabMenu
      noteId={note.id}
      onRequestEdit={() => setEditing(true)}
      onDeleted={onChanged}
    />
  );
}
