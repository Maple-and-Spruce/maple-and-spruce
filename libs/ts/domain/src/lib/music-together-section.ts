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

/**
 * Form-prefill defaults only — every amount is configurable per semester on
 * the section document. Admins can override any of these when creating a
 * section; nothing here is enforced as a fixed price.
 */
/** Default per-section family capacity. */
export const MT_DEFAULT_CAPACITY_FAMILIES = 8;
/** Default pay-in-full tuition, in cents ($252.00). */
export const MT_PRICE_FULL_CENTS = 25200;
/** Default per-installment amount used to prefill the plan, in cents ($132.00). */
export const MT_DEFAULT_INSTALLMENT_CENTS = 13200;
/** Default number of installments used to prefill the plan. */
export const MT_DEFAULT_INSTALLMENT_COUNT = 2;

/** One scheduled weekly meeting of a section. */
export interface MusicTogetherSession {
  dateTime: Date;
}

/**
 * One installment in a section's configurable payment plan. The plan is an
 * ordered list: the first item is charged at registration (via the Web
 * Payments nonce); the rest become scheduled card-on-file charges (see
 * `MusicTogetherScheduledCharge`). Amounts and dates are set per semester, so
 * a section can offer 1, 2, or N installments totaling whatever the admin
 * chooses (the total need not equal `priceFullCents` — paying in full may be
 * a discount).
 */
export interface MusicTogetherInstallmentPlanItem {
  amountCents: number;
  /** When this installment is charged. The first item is effectively "now". */
  dueAt: Date;
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
  /**
   * Configurable installment plan offered for this semester. Ordered: the
   * first item is charged at registration, later items become scheduled
   * card-on-file charges on their `dueAt`. Absent or empty ⇒ pay-in-full only.
   */
  installmentPlan?: MusicTogetherInstallmentPlanItem[];
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

/**
 * Whether this section offers an installment option (a plan with at least two
 * charges — a single charge is just pay-in-full by card).
 */
export function mtSectionOffersInstallments(
  section: Pick<MusicTogetherSection, 'installmentPlan'>
): boolean {
  return (section.installmentPlan?.length ?? 0) >= 2;
}

/** Total of all installments in a plan, in cents. */
export function mtInstallmentPlanTotalCents(
  plan: MusicTogetherInstallmentPlanItem[] | undefined
): number {
  return (plan ?? []).reduce((sum, item) => sum + item.amountCents, 0);
}
