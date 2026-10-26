/**
 * Class waitlist domain types
 *
 * Lightweight informal waitlist: customers add their email when a class is
 * full and we broadcast-email everyone if a spot opens (no ordering, no
 * reservation). Stored as a subcollection of the class for auto-cleanup
 * on class delete.
 */

export interface ClassWaitlistEntry {
  /**
   * Document id: the lowercased email, plus the hour for a private-hours
   * entry, so signups are idempotent per class or per hour.
   */
  id: string;
  classId: string;
  email: string;
  /**
   * Private-hours classes: the hour this person is waiting for. Absent means
   * the whole class (seat classes) or any hour (private hours).
   */
  slotStart?: Date;
  createdAt: Date;
}

export type CreateClassWaitlistEntryInput = {
  classId: string;
  email: string;
  slotStart?: Date;
};

/**
 * Who to email when a private hour reopens: everyone waiting on that hour
 * plus everyone waiting for any hour, once per address.
 */
export function waitlistEntriesForHour(
  entries: ReadonlyArray<ClassWaitlistEntry>,
  slotStart: Date
): ClassWaitlistEntry[] {
  const t = slotStart.getTime();
  const seen = new Set<string>();
  return entries.filter((e) => {
    const matches = !e.slotStart || new Date(e.slotStart).getTime() === t;
    if (!matches) return false;
    const key = e.email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
