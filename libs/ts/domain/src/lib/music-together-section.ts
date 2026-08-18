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

/**
 * Length of a single Music Together class, in minutes. MT classes are always
 * 45 minutes, so sections don't store a per-session duration; the calendar
 * sync (`onMusicTogetherSectionWrite`) uses this to compute each event's end
 * time.
 */
export const MT_CLASS_DURATION_MINUTES = 45;

/**
 * Studio address used in family-facing copy when a section doesn't set its own
 * `location`. Sections meet at the studio by default.
 *
 * DEMOS DELIBERATELY DO NOT USE THIS — a demo's `location` is required free
 * text precisely because demos are regularly held offsite (a public library, a
 * partner space). Never fall back to this for a demo.
 */
export const MT_DEFAULT_LOCATION =
  'Maple & Spruce Folk Arts Collective, 688 Beulah Rd, Morgantown, WV 26508';

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

/**
 * Section status — DERIVED, never stored. Computed from the explicit controls
 * (`visible` / `enrollmentActive` / the enrollment window) plus the current
 * time and registered family count. See `mtSectionDerivedStatus`. We deliberately
 * don't persist a hand-set status: admins flip explicit toggles/dates, and the
 * overall state falls out of those.
 */
export type MusicTogetherSectionStatus =
  | 'draft' // Not visible — hidden from the calendar, public site, and Webflow
  | 'upcoming' // Visible, enrollment scheduled but not open yet
  | 'open' // Enrolling now, seats available
  | 'full' // Enrollment window active but at capacity
  | 'closed' // Visible, enrollment not active / window has passed
  | 'completed'; // All sessions are in the past

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
  /**
   * Whether the section is publicly visible — shown on the public calendar and
   * Music Together site, and synced to Webflow. Registration can still be
   * closed while a section is visible (see `enrollmentActive`). This is the
   * "show it" control. Default false (hidden).
   */
  visible: boolean;
  /**
   * Live registration on/off switch, ad-platform style. When false, registration
   * is closed regardless of the schedule below; pausing always wins. This is the
   * "open for registration" control. Default false.
   */
  enrollmentActive: boolean;
  /**
   * Optional scheduled open — registration won't open before this instant even
   * when `enrollmentActive` is true. Reaching it opens enrollment automatically
   * (the gate is evaluated on each read; no cron needed).
   */
  enrollmentOpensAt?: Date;
  /**
   * Optional scheduled close — registration closes at this instant. Blank means
   * no scheduled close (only `enrollmentActive` gates it).
   */
  enrollmentClosesAt?: Date;
  location?: string;
  room?: string;
  /**
   * The semester (term) this section belongs to, if organized under one. See
   * `MusicTogetherSemester`. Optional so existing/standalone sections keep
   * working; new sections created through the admin are grouped under a
   * semester.
   */
  semesterId?: string;
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

/**
 * Whether the enrollment WINDOW is active (ad-platform semantics): the live
 * toggle is on AND `now` is within `[enrollmentOpensAt, enrollmentClosesAt)`.
 * Blank dates mean "no bound on that side". Ignores capacity — see
 * `mtSectionEnrollmentOpen`.
 */
export function mtSectionEnrollmentWindowActive(
  section: Pick<
    MusicTogetherSection,
    'enrollmentActive' | 'enrollmentOpensAt' | 'enrollmentClosesAt'
  >,
  now: Date
): boolean {
  if (!section.enrollmentActive) return false;
  if (section.enrollmentOpensAt && now < section.enrollmentOpensAt) return false;
  if (section.enrollmentClosesAt && now >= section.enrollmentClosesAt)
    return false;
  return true;
}

/**
 * Whether a family can register right now: the enrollment window is active AND
 * (when a family count is supplied) the section is under capacity. The
 * create-registration function still enforces capacity transactionally, so it
 * may call this without a count for the window-only check.
 */
export function mtSectionEnrollmentOpen(
  section: Pick<
    MusicTogetherSection,
    | 'enrollmentActive'
    | 'enrollmentOpensAt'
    | 'enrollmentClosesAt'
    | 'capacityFamilies'
  >,
  now: Date,
  familyCount?: number
): boolean {
  if (!mtSectionEnrollmentWindowActive(section, now)) return false;
  if (familyCount !== undefined && familyCount >= section.capacityFamilies) {
    return false;
  }
  return true;
}

/** Whether the section can still accept another family (window active + seat). */
export function mtSectionHasAvailability(
  section: Pick<
    MusicTogetherSection,
    | 'enrollmentActive'
    | 'enrollmentOpensAt'
    | 'enrollmentClosesAt'
    | 'capacityFamilies'
  >,
  familyCount: number,
  now: Date = new Date()
): boolean {
  return mtSectionEnrollmentOpen(section, now, familyCount);
}

/**
 * The overall section status shown in the admin UI — DERIVED, never stored.
 * Computed from the explicit controls + `now` + the registered family count.
 *
 * - `draft` — not visible (hidden everywhere)
 * - `completed` — visible, but every session is in the past
 * - `open` — enrollment window active, seats available
 * - `full` — enrollment window active but at capacity
 * - `upcoming` — visible, enrollment scheduled (opens later) but not open yet
 * - `closed` — visible, enrollment not active / window has passed
 */
export function mtSectionDerivedStatus(
  section: Pick<
    MusicTogetherSection,
    | 'visible'
    | 'enrollmentActive'
    | 'enrollmentOpensAt'
    | 'enrollmentClosesAt'
    | 'capacityFamilies'
    | 'sessions'
  >,
  now: Date,
  familyCount?: number
): MusicTogetherSectionStatus {
  if (!section.visible) return 'draft';

  const sessions = section.sessions ?? [];
  const allSessionsPast =
    sessions.length > 0 &&
    sessions.every((s) => s.dateTime.getTime() <= now.getTime());
  if (allSessionsPast) return 'completed';

  if (mtSectionEnrollmentWindowActive(section, now)) {
    if (familyCount !== undefined && familyCount >= section.capacityFamilies) {
      return 'full';
    }
    return 'open';
  }

  if (
    section.enrollmentActive &&
    section.enrollmentOpensAt &&
    now < section.enrollmentOpensAt
  ) {
    return 'upcoming';
  }
  return 'closed';
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
