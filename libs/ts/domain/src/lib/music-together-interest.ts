/**
 * Music Together cross-section interest list domain types
 *
 * A BROADER demand-gauging signal than the per-section waitlist
 * (`MusicTogetherWaitlistEntry`). A family joins a single interest list — not
 * tied to one section — and checks off every section they'd take if a spot
 * opened, plus free-text preferences. It works even when nothing is full
 * (pre-launch demand gathering) and tells the admin which section times to add.
 *
 * Why a separate top-level collection (`musicTogetherInterest/{emailKey}`)
 * rather than generalizing the per-section waitlist: the waitlist entry lives
 * in a per-section subcollection, ordered per section so offers can be made in
 * turn. An interest entry references MANY sections and must be aggregated
 * across all of them ("which sections have the most interest") — a per-section
 * subcollection can't hold that without duplicating the row under every
 * section. One doc per family, keyed by lowercased email, keeps signups
 * idempotent and the demand roll-up a single collection scan.
 */

/** One family's cross-section interest submission. */
export interface MusicTogetherInterest {
  /** Document id — the lowercased email, making signups idempotent. */
  id: string;
  name: string;
  email: string;
  /**
   * Section ids the family would take if a spot opened. May be empty when a
   * family is interested in the program generally but none of the current
   * times work (their preferred times live in `alternateTimesNote`).
   */
  interestedSectionIds: string[];
  /**
   * "If you checked multiple classes, which one(s) are you most interested
   * in?" — free text.
   */
  preferenceNote?: string;
  /**
   * "What other days/times would work best for you if we add another
   * section?" — free text.
   */
  alternateTimesNote?: string;
  /** "Additional Notes" — free text. */
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating/updating an interest entry. The server keys the doc by
 * email and stamps timestamps.
 */
export type CreateMusicTogetherInterestInput = {
  name: string;
  email: string;
  interestedSectionIds: string[];
  preferenceNote?: string;
  alternateTimesNote?: string;
  notes?: string;
};

/** Per-section interest tally, used by the admin demand view. */
export interface MusicTogetherInterestDemand {
  sectionId: string;
  /** How many interest entries checked this section. */
  count: number;
}

/**
 * Roll up interest entries into a per-section demand count, highest first.
 * Only counts sections that appear in at least one entry.
 */
export function mtInterestDemandBySection(
  entries: Pick<MusicTogetherInterest, 'interestedSectionIds'>[]
): MusicTogetherInterestDemand[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const sectionId of entry.interestedSectionIds ?? []) {
      counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([sectionId, count]) => ({ sectionId, count }))
    .sort((a, b) => b.count - a.count || a.sectionId.localeCompare(b.sectionId));
}
