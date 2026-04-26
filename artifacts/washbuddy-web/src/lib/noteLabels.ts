/**
 * Role-aware section header for booking notes. The viewer's role
 * determines the perspective; the note's authorRole determines the
 * subject. Names never appear in the header — they go in metadata text
 * underneath ("Added by James, Apr 26"), per the design spec.
 *
 * Mapping:
 *   viewer=provider, author=PROVIDER → "Notes"        (own org's note)
 *   viewer=provider, author=DRIVER   → "Notes from driver"
 *   viewer=provider, author=FLEET    → "Notes from fleet"
 *   viewer=driver,   author=PROVIDER → "Notes from provider"
 *   viewer=driver,   author=DRIVER   → "Your notes"
 *   viewer=driver,   author=FLEET    → "Notes from fleet"   (driver's fleet admin booked on their behalf)
 *   anything else                   → "Notes"
 */

export type NoteAuthorRole = "PROVIDER" | "DRIVER" | "FLEET";
export type NoteViewerRole = "PROVIDER" | "DRIVER" | "ADMIN";

export function noteSectionLabel(viewer: NoteViewerRole, author: NoteAuthorRole | string | null | undefined): string {
  const a = (author || "PROVIDER") as NoteAuthorRole;
  if (viewer === "PROVIDER" || viewer === "ADMIN") {
    if (a === "DRIVER") return "Notes from driver";
    if (a === "FLEET") return "Notes from fleet";
    return "Notes";
  }
  if (viewer === "DRIVER") {
    if (a === "PROVIDER") return "Notes from provider";
    if (a === "FLEET") return "Notes from fleet";
    return "Your notes";
  }
  return "Notes";
}

/** "Added by James, Apr 26" — small metadata under the section label. */
export function noteMetaLine(
  note: { author?: { firstName?: string | null; lastName?: string | null } | null; createdAt?: string | Date | null },
  formatDate: (d: string | Date) => string,
): string | null {
  const name = [note.author?.firstName, note.author?.lastName].filter(Boolean).join(" ").trim();
  if (!name && !note.createdAt) return null;
  if (name && note.createdAt) return `Added by ${name}, ${formatDate(note.createdAt as any)}`;
  if (name) return `Added by ${name}`;
  if (note.createdAt) return `Added ${formatDate(note.createdAt as any)}`;
  return null;
}

/** Group an array of notes by authorRole, preserving original order
 * within each group. The notes API returns notes in createdAt asc; this
 * keeps that order inside each group so a multi-author conversation
 * stays readable. */
export function groupNotesByAuthorRole<T extends { authorRole?: string | null }>(
  notes: T[],
): Array<{ role: NoteAuthorRole; notes: T[] }> {
  const order: NoteAuthorRole[] = [];
  const buckets = new Map<NoteAuthorRole, T[]>();
  for (const n of notes) {
    const role = ((n.authorRole || "PROVIDER") as NoteAuthorRole);
    if (!buckets.has(role)) {
      buckets.set(role, []);
      order.push(role);
    }
    buckets.get(role)!.push(n);
  }
  return order.map((role) => ({ role, notes: buckets.get(role)! }));
}
