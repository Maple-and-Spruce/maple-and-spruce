/**
 * Instructor domain types
 *
 * Represents instructors who teach classes/workshops at Maple & Spruce.
 * Implements Payee interface for payment tracking.
 *
 * Instructors have a different payment structure than Artists:
 * - Artists receive commission on product sales
 * - Instructors receive payment per class (flat, hourly, or percentage)
 */

import type { Payee } from './payee';

/**
 * How an instructor is paid for teaching
 */
export type InstructorPayRateType = 'flat' | 'hourly' | 'percentage';

/**
 * How a contract instructor was set up to be paid.
 *
 * - `square-payroll`: onboarded as a Square Payroll contractor, which collects
 *   their tax info itself.
 * - `w9-on-file`: paid through Square Bill Pay, with a W-9 collected by us.
 */
export type InstructorPaymentSetupMethod = 'square-payroll' | 'w9-on-file';

export const INSTRUCTOR_PAYMENT_SETUP_METHODS: readonly InstructorPaymentSetupMethod[] =
  ['square-payroll', 'w9-on-file'];

export const INSTRUCTOR_PAYMENT_SETUP_METHOD_LABELS: Record<
  InstructorPaymentSetupMethod,
  string
> = {
  'square-payroll': 'Square Payroll contractor',
  'w9-on-file': 'W-9 on file (Square Bill Pay)',
};

/**
 * What has been done to clear a contract instructor to teach.
 *
 * Every date is a calendar date, `YYYY-MM-DD`: the day a thing happened, not
 * an instant. A string keeps it timezone-independent and lets it cross the
 * callable wire unchanged (a `Date` arrives on the client as a string anyway).
 *
 * There is deliberately no stored "ready" flag — it would drift from the
 * dates. Use {@link instructorReadiness}. Admin-only: never public, never
 * synced to Webflow.
 */
export interface InstructorReadiness {
  /** The independent contractor agreement was signed. */
  contractorAgreement?: {
    signedOn: string;
    /** Where the signed copy lives: a link, or a note such as "paper, in the office binder". */
    reference?: string;
  };
  /** The background check came back clear. Run outside this system; this is the record of it. */
  backgroundCheck?: {
    clearedOn: string;
  };
  /** The instructor can be paid: tax info collected one way or the other. */
  paymentSetup?: {
    completedOn: string;
    method: InstructorPaymentSetupMethod;
  };
}

/** One thing that must be done before a contract instructor can teach. */
export type InstructorReadinessItem =
  | 'contractor-agreement'
  | 'background-check'
  | 'payment-setup';

export const INSTRUCTOR_READINESS_ITEMS: readonly InstructorReadinessItem[] = [
  'contractor-agreement',
  'background-check',
  'payment-setup',
];

export const INSTRUCTOR_READINESS_ITEM_LABELS: Record<
  InstructorReadinessItem,
  string
> = {
  'contractor-agreement': 'Contractor agreement',
  'background-check': 'Background check',
  'payment-setup': 'Payment setup',
};

/**
 * Whether an instructor is cleared to teach.
 *
 * - `not-applicable`: not a paid contractor, so nothing is tracked.
 * - `ready`: all three items are recorded.
 * - `not-ready`: `missing` lists what is still outstanding, in checklist order.
 */
export type InstructorReadinessStatus =
  | { kind: 'not-applicable' }
  | { kind: 'ready' }
  | { kind: 'not-ready'; missing: InstructorReadinessItem[] };

/**
 * Instructor entity - implements Payee interface
 */
export interface Instructor extends Payee {
  /**
   * Firebase Auth UID of the portal user who IS this instructor, when they
   * have a login. Set only for lesson teachers who manage their own lessons
   * in the portal (scoped-roles epic #49) — most instructors (class-only
   * payees) have no login and leave this unset. Used to enforce
   * "lesson teachers manage only their own lessons".
   */
  uid?: string;
  /** Instructor's bio for class pages (teaching-focused) */
  bio?: string;
  /** Areas of expertise (e.g., ['weaving', 'natural dyeing']) */
  specialties?: string[];
  /**
   * Payment rate in cents (for flat/hourly) or decimal (for percentage).
   * - flat: per-class payment in cents (e.g., 5000 = $50 per class)
   * - hourly: per-hour payment in cents (e.g., 2500 = $25/hour)
   * - percentage: decimal of class revenue (e.g., 0.70 = 70% to instructor)
   */
  payRate?: number;
  /** How payRate is interpreted */
  payRateType?: InstructorPayRateType;
  /**
   * Webflow CMS item ID for instructor profile sync.
   * @see docs/decisions/ADR-016-webflow-integration-strategy.md
   */
  webflowItemId?: string;
  /**
   * A paid 1099 contractor, who must be cleared (see `readiness`) before
   * teaching. Explicit rather than inferred from `payRate`: staff can have a
   * pay rate without being contractors, and a new contractor may not have a
   * rate agreed yet. Unset means "not tracked", so existing records raise no
   * warnings until someone opts them in. Admin-only.
   */
  isContractor?: boolean;
  /** Contractor onboarding record. Admin-only. */
  readiness?: InstructorReadiness;
}

/**
 * Whether an instructor is cleared to teach. Derived from `readiness`, never
 * stored.
 */
export function instructorReadiness(
  instructor: Pick<Instructor, 'isContractor' | 'readiness'>
): InstructorReadinessStatus {
  if (!instructor.isContractor) {
    return { kind: 'not-applicable' };
  }

  const r = instructor.readiness ?? {};
  const done: Record<InstructorReadinessItem, boolean> = {
    'contractor-agreement': !!r.contractorAgreement?.signedOn,
    'background-check': !!r.backgroundCheck?.clearedOn,
    'payment-setup': !!r.paymentSetup?.completedOn && !!r.paymentSetup.method,
  };
  const missing = INSTRUCTOR_READINESS_ITEMS.filter((item) => !done[item]);

  return missing.length === 0 ? { kind: 'ready' } : { kind: 'not-ready', missing };
}

/**
 * The instructor without its admin-only onboarding fields, for a reader who
 * is not an admin (a lesson teacher listing colleagues). Whether a colleague
 * has cleared a background check is not theirs to see.
 */
export function withoutContractorReadiness(instructor: Instructor): Instructor {
  const { isContractor: _isContractor, readiness: _readiness, ...rest } = instructor;
  return rest;
}

/** "contractor agreement and background check" — the missing items, as prose. */
export function describeMissingReadiness(
  missing: readonly InstructorReadinessItem[]
): string {
  const words = missing.map((item) =>
    INSTRUCTOR_READINESS_ITEM_LABELS[item].toLowerCase()
  );
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * Input for creating a new instructor (no id, timestamps auto-generated)
 */
export type CreateInstructorInput = Omit<
  Instructor,
  'id' | 'createdAt' | 'updatedAt' | 'webflowItemId'
>;

/**
 * Input for updating an instructor (all fields optional except id)
 */
export type UpdateInstructorInput = Partial<
  Omit<Instructor, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Public-facing instructor information for website display.
 * Excludes sensitive data like email, payment rates, notes, and timestamps.
 */
export interface PublicInstructor {
  id: string;
  name: string;
  bio?: string;
  specialties?: string[];
  photoUrl?: string;
}

/**
 * Convert a full Instructor to PublicInstructor by stripping sensitive fields.
 * Note: Only call this for active instructors - filtering should happen at query level.
 */
export function toPublicInstructor(instructor: Instructor): PublicInstructor {
  return {
    id: instructor.id,
    name: instructor.name,
    bio: instructor.bio,
    specialties: instructor.specialties,
    photoUrl: instructor.photoUrl,
  };
}

/**
 * Calculate instructor payment for a class.
 *
 * @param instructor The instructor being paid
 * @param classDurationMinutes Duration of the class in minutes
 * @param classRevenueCents Total revenue from class registrations in cents
 * @returns Payment amount in cents, or undefined if pay rate not configured
 */
export function calculateInstructorPayment(
  instructor: Instructor,
  classDurationMinutes: number,
  classRevenueCents: number
): number | undefined {
  if (instructor.payRate === undefined || !instructor.payRateType) {
    return undefined;
  }

  switch (instructor.payRateType) {
    case 'flat':
      // payRate is flat amount in cents
      return instructor.payRate;
    case 'hourly':
      // payRate is hourly rate in cents
      const hours = classDurationMinutes / 60;
      return Math.round(instructor.payRate * hours);
    case 'percentage':
      // payRate is decimal percentage (e.g., 0.70 = 70%)
      return Math.round(classRevenueCents * instructor.payRate);
    default:
      return undefined;
  }
}
