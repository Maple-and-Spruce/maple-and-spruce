/**
 * Music Together API request/response types
 *
 * Shared between the public Webflow checkout widget and the Cloud Functions.
 * Dates cross the wire as ISO strings (e.g. child DOBs); the server parses them.
 */
import type {
  MusicTogetherSection,
  MusicTogetherSemester,
  CreateMusicTogetherSemesterInput,
  UpdateMusicTogetherSemesterInput,
  MusicTogetherRegistration,
  MusicTogetherScheduledCharge,
  MusicTogetherChargeStatus,
  CreateMusicTogetherSectionInput,
  UpdateMusicTogetherSectionInput,
  MusicTogetherSectionStatus,
  MusicTogetherInterest,
  MusicTogetherInterestDemand,
  MusicTogetherWaitlistEntry,
  MusicTogetherDemoRsvp,
} from '@maple/ts/domain';

// ============================================================================
// Semester admin CRUD (authenticated read; admin writes)
// ============================================================================

// No filters — semesters are returned in full (status is derived client-side).
export type GetMusicTogetherSemestersRequest = Record<string, never>;

export interface GetMusicTogetherSemestersResponse {
  semesters: MusicTogetherSemester[];
}

export type CreateMusicTogetherSemesterRequest =
  CreateMusicTogetherSemesterInput;

export interface CreateMusicTogetherSemesterResponse {
  semester: MusicTogetherSemester;
}

export type UpdateMusicTogetherSemesterRequest =
  UpdateMusicTogetherSemesterInput;

export interface UpdateMusicTogetherSemesterResponse {
  semester: MusicTogetherSemester;
}

// ============================================================================
// Section admin CRUD (authenticated read; admin writes)
// ============================================================================

export interface GetMusicTogetherSectionsRequest {
  /** Optionally scope to a single semester. */
  semesterId?: string;
}

/** Per-section registration counts (capacity statuses: pending + confirmed). */
export interface MusicTogetherSectionCounts {
  /** Registered families (one per registration). */
  families: number;
  /** Registered children summed across those families. */
  children: number;
}

export interface GetMusicTogetherSectionsResponse {
  sections: MusicTogetherSection[];
  /** Registration counts keyed by section id; sections with none are omitted. */
  counts: Record<string, MusicTogetherSectionCounts>;
}

export type CreateMusicTogetherSectionRequest = CreateMusicTogetherSectionInput;

export interface CreateMusicTogetherSectionResponse {
  section: MusicTogetherSection;
}

export type UpdateMusicTogetherSectionRequest = UpdateMusicTogetherSectionInput;

export interface UpdateMusicTogetherSectionResponse {
  section: MusicTogetherSection;
}

export interface DuplicateMusicTogetherSectionRequest {
  /** ID of the source section to copy. */
  sourceSectionId: string;
}

export interface DuplicateMusicTogetherSectionResponse {
  /** The new section: hidden + enrollment-paused, name suffixed, sessions copied. */
  section: MusicTogetherSection;
}

// ============================================================================
// Roster (admin — enrolled families + payment/charge status)
// ============================================================================

export interface GetMusicTogetherRosterRequest {
  sectionId: string;
}

/** One enrolled family, with its scheduled charges and a past-due flag. */
export interface MusicTogetherRosterEntry {
  registration: MusicTogetherRegistration;
  charges: MusicTogetherScheduledCharge[];
  /** True when any scheduled charge has failed (needs manual follow-up). */
  pastDue: boolean;
}

export interface GetMusicTogetherRosterResponse {
  section: MusicTogetherSection;
  entries: MusicTogetherRosterEntry[];
  /**
   * Waitlist / interested families for this section (ordered by signup time).
   * Includes email-only "coming soon" captures as well as full waitlist
   * signups, so the admin can notify everyone when registration opens.
   */
  waitlist: MusicTogetherWaitlistEntry[];
}

// ============================================================================
// Get Public Section (public — widget loads section + pricing)
// ============================================================================

export interface GetPublicMusicTogetherSectionRequest {
  sectionId: string;
}

/** Public, customer-safe view of a section plus live availability. */
export interface PublicMusicTogetherSection {
  id: string;
  name: string;
  description?: string;
  sessions: { dateTime: string }[];
  priceFullCents: number;
  installmentPlan?: { amountCents: number; dueAt: string }[];
  capacityFamilies: number;
  spotsRemaining: number;
  /** Whether registration is open right now (window active + seats available). */
  enrollmentOpen: boolean;
  /** ISO instant registration opens, when scheduled and not yet open. */
  enrollmentOpensAt?: string;
  location?: string;
  room?: string;
}

export interface GetPublicMusicTogetherSectionResponse {
  section: PublicMusicTogetherSection;
}

// ============================================================================
// Create Registration (public — checkout, with payment)
// ============================================================================

/** One child on the registration form; `name` is the first name, `dob` an ISO date string. */
export interface MusicTogetherChildPayload {
  name: string;
  dob: string;
}

export interface CreateMusicTogetherRegistrationRequest {
  sectionId: string;
  /** Enrolling adult's first name (shared with Music Together Worldwide). */
  adultFirstName: string;
  /** Enrolling adult's last name (shared with Music Together Worldwide). */
  adultLastName: string;
  /**
   * Parent/guardian name(s). Optional; the server falls back to the adult's
   * first + last name when omitted. Kept for backward compatibility.
   */
  parentNames?: string[];
  /** Enrolled children (first name + DOB). At least one, at most three. */
  children: MusicTogetherChildPayload[];
  email: string;
  phone: string;
  /** Full mailing/street address. */
  address: string;
  /** Special needs, allergies, or other accommodation notes. Internal use only. */
  accommodations?: string;
  /** 'full' = one charge; 'installments' = first charge now + scheduled rest. */
  paymentPlan: 'full' | 'installments';
  policiesAccepted: boolean;
  /** Privacy notice consent (adult contact details shared with Music Together Worldwide). */
  privacyConsent: boolean;
  /** Card-on-file authorization — required when paymentPlan is 'installments'. */
  cardOnFileAuth?: boolean;
  /** Nonce from the Square Web Payments SDK card tokenization. */
  paymentNonce: string;
  /**
   * STORE-intent verification token from `verifyBuyer` — REQUIRED for the
   * installment plan (the card is vaulted on file; real Square rejects the
   * vault without it). Unused for pay-in-full.
   */
  cardVerificationToken?: string;
  notes?: string;
}

export interface CreateMusicTogetherRegistrationResponse {
  registrationId: string;
  status: 'confirmed';
  /** Amount charged at registration (full price, or the first installment). */
  amountChargedCents: number;
  /** Number of scheduled future charges created (0 for pay-in-full). */
  scheduledChargeCount: number;
  /** Last 4 of the card on file, when one was stored (installments). */
  cardLast4?: string;
  squareReceiptUrl?: string;
}

// ============================================================================
// Charge due installments (admin trigger for the scheduled job)
// ============================================================================

export interface ChargeMusicTogetherInstallmentsRequest {
  /** When set, only reports what would be charged — takes no payments. */
  dryRun?: boolean;
}

/** One charge a dry run would have processed. */
export interface MusicTogetherDueChargePreview {
  chargeId: string;
  registrationId: string;
  amountCents: number;
  installmentNumber: number;
}

export interface MusicTogetherInstallmentChargeResult {
  /** Charges that were due (status scheduled, dueAt ≤ now). */
  due: number;
  /** Successfully charged. */
  charged: number;
  /** Failed (declined/errored) — parent emailed, surfaced to admin. */
  failed: number;
  /** Skipped because the lease was already taken or the reg isn't chargeable. */
  skipped: number;
  dryRun: boolean;
  /** Populated only on a dry run. */
  wouldCharge?: MusicTogetherDueChargePreview[];
}

// ============================================================================
// Cancel Registration (admin — refund + cancel scheduled charges)
// ============================================================================

export interface CancelMusicTogetherRegistrationRequest {
  registrationId: string;
  /**
   * Explicit refund amount in cents (admin discretion — full or partial). When
   * omitted, the program's policy refund is applied (amount paid − the $25 fee
   * before the first class; $0 on/after). Must be an integer between 0 and the
   * total amount captured for the registration (registration-time charge plus
   * any installments already paid); a value above that is rejected. The
   * policy-default path (omit this field) is what a customer self-service
   * cancellation uses.
   */
  refundCents?: number;
}

export interface CancelMusicTogetherRegistrationResponse {
  registrationId: string;
  status: 'cancelled' | 'refunded';
  /** Amount refunded in cents (0 when non-refundable / nothing to refund). */
  refundCents: number;
  /** First Square refund id (the registration-time charge, when refunded). */
  refundId?: string;
  /**
   * All Square refund ids issued. A partial/full refund on an installment
   * registration can span more than one payment (registration charge + a paid
   * installment), so there may be more than one.
   */
  refundIds?: string[];
  /** How many scheduled future charges were cancelled. */
  cancelledChargeCount: number;
}

// ============================================================================
// Join Waitlist (public — shown when a section is full)
// ============================================================================

export interface AddToMusicTogetherWaitlistRequest {
  sectionId: string;
  /**
   * Family name. Optional — the email-only "coming soon" capture omits it,
   * while the full-section waitlist form collects it.
   */
  name?: string;
  email: string;
  /** "What days/times work for you?" */
  availability?: string;
}

export interface AddToMusicTogetherWaitlistResponse {
  /** False when the email was already on the list (idempotent no-op). */
  added: boolean;
}

// ============================================================================
// Demo classes (public RSVP — free try-a-class; admin read)
// ============================================================================

export interface AddMusicTogetherDemoRsvpRequest {
  /** Human-readable demo slot label the family chose (e.g. "Sat Aug 3 · 10:00 AM"). */
  demoSlot: string;
  name: string;
  email: string;
}

export interface AddMusicTogetherDemoRsvpResponse {
  /** False when the email had already RSVP'd (the slot/name were updated). */
  added: boolean;
}

// No parameters — returns every demo RSVP for the admin viewer.
export type GetMusicTogetherDemoRsvpsRequest = Record<string, never>;

export interface GetMusicTogetherDemoRsvpsResponse {
  /** All demo RSVPs, ordered by signup time. */
  rsvps: MusicTogetherDemoRsvp[];
}

// ============================================================================
// Self-service payment-method management (installment families — magic link)
// ============================================================================

/**
 * Request a magic-link email to update the card on file for an installment
 * registration (so the Week-5 charge hits the right card).
 */
export interface RequestMusicTogetherManageLinkRequest {
  email: string;
}

export interface RequestMusicTogetherManageLinkResponse {
  /**
   * Always true — the response is deliberately uniform whether or not the email
   * has a manageable installment registration, to avoid leaking who is
   * enrolled.
   */
  ok: true;
}

/** The next upcoming/failed installment, shown for context on the manage page. */
export interface MusicTogetherManageInstallment {
  amountCents: number;
  /** Presentation-ready amount, e.g. "$95.00". */
  amountLabel: string;
  /** ISO date string of when the charge is due. */
  dueAt: string;
  /** Presentation-ready due date, e.g. "September 15, 2026". */
  dueLabel: string;
  status: MusicTogetherChargeStatus;
}

/** Customer-safe snapshot of a registration for the manage page. */
export interface MusicTogetherManageView {
  registrationId: string;
  sectionName: string;
  /** Enrolling adult's name, for a friendly greeting. */
  parentName: string;
  /**
   * The soonest installment still awaiting payment (scheduled or failed), when
   * one exists — lets the page say which charge the new card will cover.
   */
  nextInstallment?: MusicTogetherManageInstallment;
}

/** Exchange a single-use magic-link token for a session. */
export interface StartMusicTogetherManageSessionRequest {
  token: string;
}

export interface StartMusicTogetherManageSessionResponse {
  /** Short-lived session token; pass on every subsequent management call. */
  sessionToken: string;
  registration: MusicTogetherManageView;
}

/** Replace the card on file behind an installment registration. */
export interface UpdateMusicTogetherPaymentMethodRequest {
  sessionToken: string;
  /** New nonce from the Square Web Payments SDK card tokenization. */
  paymentNonce: string;
  /**
   * STORE-intent verification token from `verifyBuyer` — required to vault the
   * new card on file (real Square rejects the vault without it).
   */
  cardVerificationToken?: string;
}

export interface UpdateMusicTogetherPaymentMethodResponse {
  registration: MusicTogetherManageView;
  /** Last 4 digits of the new card on file, for display. */
  cardLast4?: string;
}

// ============================================================================
// Public section options (public — drives the interest form checkboxes)
// ============================================================================

export interface GetPublicMusicTogetherSectionsRequest {
  /** Reserved for future filtering (e.g. by semester). */
  semesterId?: string;
}

/** Minimal, customer-safe section descriptor for the interest checkbox list. */
export interface PublicMusicTogetherSectionOption {
  id: string;
  name: string;
  /** Earliest session start, ISO string; absent when no sessions are set. */
  firstSessionAt?: string;
  location?: string;
  /** Derived status (open / full / upcoming / closed / completed). */
  status: MusicTogetherSectionStatus;
}

export interface GetPublicMusicTogetherSectionsResponse {
  sections: PublicMusicTogetherSectionOption[];
}

// ============================================================================
// Cross-section interest list (public submit + admin read)
// ============================================================================

export interface AddMusicTogetherInterestRequest {
  name: string;
  email: string;
  /** Section ids the family would take if a spot opened (may be empty). */
  interestedSectionIds: string[];
  /** "If you checked multiple classes, which one(s) most interested in?" */
  preferenceNote?: string;
  /** "What other days/times would work best if we add another section?" */
  alternateTimesNote?: string;
  /** "Additional Notes" */
  notes?: string;
}

export interface AddMusicTogetherInterestResponse {
  /** False when the email already had an interest entry (it was updated). */
  added: boolean;
}

export interface GetMusicTogetherInterestRequest {
  // No parameters — returns the full interest list for the admin demand view.
  _?: never;
}

export interface GetMusicTogetherInterestResponse {
  /** All interest entries, most recent first. */
  entries: MusicTogetherInterest[];
  /** Per-section interest tally, highest demand first. */
  demand: MusicTogetherInterestDemand[];
  /** Section id → display name, for rendering the demand table + checkboxes. */
  sectionNames: Record<string, string>;
}
