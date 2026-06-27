/**
 * Music Together section domain types
 *
 * A Music Together (MT) section is one term of the early-childhood music
 * program that families register for. MT is a SEPARATE business (Stephanie's
 * single-member LLC) with its own Square account — see the per-program payment
 * routing in `@maple/firebase/square` (MT_SQUARE_KEYS) and the program plan in
 * `docs/reference/music-together-plan.md`.
 *
 * A section has a fixed family capacity (8) and offers two payment options:
 * pay in full, or two equal installments where the second auto-charges at the
 * start of week 5 (see `week5ChargeAt`).
 */

/** Default per-section family capacity. */
export const MT_DEFAULT_CAPACITY_FAMILIES = 8;
/** Pay-in-full tuition, in cents ($252.00). */
export const MT_PRICE_FULL_CENTS = 25200;
/**
 * Each installment when paying in two parts, in cents ($132.00).
 *
 * Note: two installments total $264 — $12 MORE than paying in full ($252).
 * This is intentional per the program spec (a small pay-in-full incentive),
 * not a rounding error. If the prices are ever meant to net the same, revisit
 * both constants together.
 */
export const MT_INSTALLMENT_CENTS = 13200;
/** Number of installments on the installment plan. */
export const MT_INSTALLMENT_COUNT = 2;

/** One scheduled weekly meeting of a section. */
export interface MusicTogetherSession {
  dateTime: Date;
}

/** Section lifecycle status. */
export type MusicTogetherSectionStatus =
  | 'draft' // Not yet open for registration
  | 'open' // Accepting registrations
  | 'closed' // Registration closed (full, or term started)
  | 'completed'; // Term finished

/**
 * Music Together section entity — one bookable term of the program.
 */
export interface MusicTogetherSection {
  id: string;
  /** Display name, e.g. "Spring 2026 — Tuesdays 10am". */
  name: string;
  description?: string;
  /** Weekly meeting times for the term. */
  sessions: MusicTogetherSession[];
  /** Maximum number of families (not children). Defaults to 8. */
  capacityFamilies: number;
  /** Pay-in-full price in cents. */
  priceFullCents: number;
  /** Installment amount in cents (charged `installmentCount` times). */
  installmentCents: number;
  /** Number of installments on the two-payment plan. */
  installmentCount: number;
  /**
   * When the second installment auto-charges (start of week 5). Set explicitly
   * per section rather than derived, so the scheduled charge job has a single
   * unambiguous anchor regardless of how sessions are scheduled.
   */
  week5ChargeAt: Date;
  status: MusicTogetherSectionStatus;
  location?: string;
  room?: string;
  /** Webflow CMS item ID, once synced to the public site. */
  webflowItemId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a section. The server stamps `id`, `createdAt`,
 * `updatedAt`.
 */
export type CreateMusicTogetherSectionInput = Omit<
  MusicTogetherSection,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a section.
 */
export type UpdateMusicTogetherSectionInput = Partial<
  Omit<MusicTogetherSection, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * The earliest session start, used as the indexed sort key for upcoming
 * sections. Returns `undefined` when a section has no sessions yet.
 */
export function mtSectionFirstSessionAt(
  section: Pick<MusicTogetherSection, 'sessions'>
): Date | undefined {
  if (!section.sessions || section.sessions.length === 0) {
    return undefined;
  }
  return section.sessions.reduce(
    (earliest, s) => (s.dateTime < earliest ? s.dateTime : earliest),
    section.sessions[0].dateTime
  );
}

/**
 * Spots (families) remaining given the current confirmed/pending family count.
 * Never negative.
 */
export function mtSpotsRemaining(
  section: Pick<MusicTogetherSection, 'capacityFamilies'>,
  familyCount: number
): number {
  return Math.max(0, section.capacityFamilies - familyCount);
}

/** Whether the section can still accept another family. */
export function mtSectionHasAvailability(
  section: Pick<MusicTogetherSection, 'capacityFamilies' | 'status'>,
  familyCount: number
): boolean {
  return section.status === 'open' && familyCount < section.capacityFamilies;
}
