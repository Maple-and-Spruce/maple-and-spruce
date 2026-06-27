/**
 * Music Together registration domain types
 *
 * One document per family enrolled in a Music Together section. Unlike class
 * `Registration` (email-keyed, single attendee row), MT registrations are
 * family-shaped: one or more parents and one or more children with DOBs (the
 * licensee report needs parent name, child name, child DOB per section).
 *
 * Payments route to MT's separate Square account. The installment plan vaults
 * a card on file at registration and self-charges the second installment at
 * `installment2.dueAt` (the section's week-5 anchor). Overcharge safety is
 * enforced by the `installment2.status` lease + the stable `idempotencyKey`
 * (see `docs/reference/music-together-plan.md`).
 */

/** How the family chose to pay. */
export type MusicTogetherPaymentPlan =
  | 'full' // One charge of priceFullCents
  | 'installments'; // installmentCount charges; card on file for the rest

/** Registration lifecycle status. */
export type MusicTogetherRegistrationStatus =
  | 'pending' // Reserved in a transaction; payment not yet confirmed
  | 'confirmed' // Payment succeeded; family is enrolled
  | 'cancelled' // Cancelled (may be partially refunded)
  | 'refunded'; // Refund issued

/**
 * State of a scheduled installment charge. The progression
 * `scheduled → charging → paid | failed` is driven by the Week-5 charge job;
 * `cancelled` is set when the registration is cancelled so the job skips it.
 * This status is one of the three overcharge-safety layers (the others being
 * the stable Square idempotency key and the cancel guard).
 */
export type MusicTogetherInstallmentStatus =
  | 'scheduled' // Due in the future; awaiting the charge job
  | 'charging' // Lease held by an in-flight charge attempt
  | 'paid' // Successfully charged
  | 'failed' // Charge declined/errored — needs manual resolution
  | 'cancelled'; // Registration cancelled; do not charge

/** An enrolled child (for the licensee report). */
export interface MusicTogetherChild {
  name: string;
  /** Date of birth. */
  dob: Date;
}

/**
 * A future auto-charge against the family's card on file. Present only on the
 * installments plan.
 */
export interface MusicTogetherInstallment {
  status: MusicTogetherInstallmentStatus;
  /** When the charge becomes due — the section's week-5 anchor at creation. */
  dueAt: Date;
  amountCents: number;
  /**
   * Stable Square idempotency key (e.g. `mt-installment2-{registrationId}`).
   * Never time-based — a retry with the same key returns the original payment
   * instead of charging again.
   */
  idempotencyKey: string;
  /** Square payment ID once charged. */
  squarePaymentId?: string;
  /** Failure detail surfaced to admins when `status === 'failed'`. */
  lastError?: string;
  /** When the charge reached a terminal state (paid/failed/cancelled). */
  resolvedAt?: Date;
}

/**
 * Music Together registration entity — one enrolled family.
 */
export interface MusicTogetherRegistration {
  id: string;
  sectionId: string;
  /** Parent/guardian name(s). At least one. */
  parentNames: string[];
  /** Enrolled children with DOBs. At least one. */
  children: MusicTogetherChild[];
  email: string;
  phone: string;
  address: string;
  paymentPlan: MusicTogetherPaymentPlan;
  /** When the family accepted the program policies. */
  policiesAcceptedAt: Date;
  /**
   * When the family authorized storing a card for the second charge. Set only
   * on the installments plan.
   */
  cardOnFileAuthAt?: Date;
  /** Amount charged at registration (full price, or installment 1). In cents. */
  pricePaidCents: number;
  /** Square customer ID (created/reused at registration). */
  squareCustomerId?: string;
  /** Square card-on-file ID used by the second installment. */
  squareCardId?: string;
  /** Square payment ID for the registration-time charge. */
  squarePaymentId?: string;
  /** Square order ID for the registration-time charge. */
  squareOrderId?: string;
  /** Square receipt URL for the registration-time charge. */
  squareReceiptUrl?: string;
  /** The scheduled second installment. Present only on the installments plan. */
  installment2?: MusicTogetherInstallment;
  status: MusicTogetherRegistrationStatus;
  notes?: string;
  confirmationSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a registration. The server stamps `id`, `createdAt`,
 * `updatedAt`, and `confirmationSentAt`.
 */
export type CreateMusicTogetherRegistrationInput = Omit<
  MusicTogetherRegistration,
  'id' | 'createdAt' | 'updatedAt' | 'confirmationSentAt'
>;

/**
 * Input for updating a registration. `sectionId` is immutable.
 */
export type UpdateMusicTogetherRegistrationInput = Partial<
  Omit<MusicTogetherRegistration, 'id' | 'createdAt' | 'updatedAt' | 'sectionId'>
> & {
  id: string;
};

/** Whether the family is enrolled (will attend). */
export function isMtRegistrationConfirmed(
  registration: Pick<MusicTogetherRegistration, 'status'>
): boolean {
  return registration.status === 'confirmed';
}

/** Statuses that count toward a section's family capacity. */
export const MT_CAPACITY_STATUSES: readonly MusicTogetherRegistrationStatus[] = [
  'pending',
  'confirmed',
];

/**
 * Whether a registration still has a live second installment that the charge
 * job should consider (scheduled, not yet terminal).
 */
export function mtHasPendingInstallment(
  registration: Pick<MusicTogetherRegistration, 'installment2'>
): boolean {
  return registration.installment2?.status === 'scheduled';
}
