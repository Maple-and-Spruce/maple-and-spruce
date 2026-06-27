/**
 * Music Together registration domain types
 *
 * One document per family enrolled in a Music Together section. Unlike class
 * `Registration` (email-keyed, single attendee row), MT registrations are
 * family-shaped: one or more parents and one or more children with DOBs (the
 * licensee report needs parent name, child name, child DOB per section).
 *
 * Payments route to MT's separate Square account. On the installments plan the
 * first installment is charged at registration and a card is vaulted; the
 * remaining installments are materialized as `MusicTogetherScheduledCharge`
 * documents that the auto-charge job processes on their due dates (see
 * `docs/reference/music-together-plan.md`).
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

/** An enrolled child (for the licensee report). */
export interface MusicTogetherChild {
  name: string;
  /** Date of birth. */
  dob: Date;
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
  /**
   * Number of scheduled card-on-file charges created for this registration
   * (the installments after the first). 0 for pay-in-full. The charges
   * themselves live in `musicTogetherScheduledCharges`, keyed by
   * `registrationId`; this is a denormalized convenience count for admin views.
   */
  scheduledChargeCount?: number;
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

/** Whether this registration has scheduled card-on-file charges outstanding. */
export function mtRegistrationHasScheduledCharges(
  registration: Pick<MusicTogetherRegistration, 'scheduledChargeCount'>
): boolean {
  return (registration.scheduledChargeCount ?? 0) > 0;
}
