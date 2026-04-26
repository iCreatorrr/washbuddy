/**
 * Kebab menu for editing/deleting a single note. Visible only when the
 * caller decides — typically when the note's authorRole is PROVIDER and
 * the viewer is from the same provider org. Driver- and fleet-authored
 * notes never get this affordance (append-only enforcement is the
 * server's job; we just don't render the controls here).
 *
 * The edit flow swaps the note's text for an inline textarea; submit
 * PATCHes; cancel reverts. Delete confirms inline (one-click reveal,
 * second click confirms) to keep the surface compact on Daily Board
 * rows where dialogs would dominate.
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

interface Props {
  note: Note;
  onChanged: () => void;
}

export function NoteActionsMenu({ note, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [submitting, setSubmitting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(note.content); }, [note.content]);

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

  const submitEdit = async () => {
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
      setEditing(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitDelete = async () => {
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/api/notes/${note.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Failed to delete note");
      }
      toast.success("Note deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
      setConfirmingDelete(false);
      setOpen(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
          rows={3}
          autoFocus
          className="w-full border border-slate-200 rounded-md p-2 text-sm bg-white focus:border-primary focus:outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-1">
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setDraft(note.content); }}>Cancel</Button>
          <Button size="sm" onClick={submitEdit} disabled={!draft.trim() || submitting} isLoading={submitting} className="gap-1">
            <Check className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
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
                onClick={() => { setOpen(false); setEditing(true); }}
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
