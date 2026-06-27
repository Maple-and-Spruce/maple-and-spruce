/**
 * Craft Club member domain types
 *
 * A Craft Club member pays a flat recurring monthly fee for scheduled studio
 * access (e.g. stained glass). Materials are charged separately at the Square
 * POS — the subscription itself is a flat monthly price only.
 *
 * Billing runs through the Square Subscriptions API: Square owns the recurring
 * charge, retries, and dunning; we mirror the resulting state here via webhooks.
 */

/** Flat monthly Craft Club price, in cents ($30.00/month). */
export const CRAFT_CLUB_MONTHLY_PRICE_CENTS = 3000;

/**
 * Craft Club membership lifecycle status.
 *
 * The natural progression is `approved → active`, with `requested` as the
 * pre-approval intake state and `past_due` / `paused` / `cancelled` as the
 * post-subscription states mirrored from Square.
 */
export type CraftClubMemberStatus =
  | 'requested' // Signed up but not on the approved list — awaiting admin review
  | 'approved' // Admin pre-approved; eligible to subscribe; no active subscription yet
  | 'active' // Square subscription is active and billing
  | 'past_due' // A Square charge failed; subscription at risk
  | 'paused' // Admin paused the subscription
  | 'cancelled'; // Cancelled by the member or an admin

/**
 * Craft Club member entity.
 *
 * `email` (lowercased) is the natural unique key — there is at most one member
 * record per email. Square identifiers are populated once the member subscribes.
 */
export interface CraftClubMember {
  id: string;
  /** Lowercased email — the natural unique key for a member. */
  email: string;
  /** Member name (collected at signup, optional when pre-approved by email). */
  name?: string;
  /** Member phone (optional). */
  phone?: string;
  /** Membership lifecycle status. */
  status: CraftClubMemberStatus;
  /** Square customer ID (created/reused at subscribe time). */
  squareCustomerId?: string;
  /** Square card-on-file ID used by the subscription. */
  squareCardId?: string;
  /** Square subscription ID (the recurring-billing record). */
  squareSubscriptionId?: string;
  /** When an admin approved this email. */
  approvedAt?: Date;
  /** UID of the admin who approved this email. */
  approvedBy?: string;
  /** When the member first activated a subscription. */
  subscribedAt?: Date;
  /** When the subscription was cancelled. */
  cancelledAt?: Date;
  /**
   * End of the current paid period, mirrored from Square. After a cancel,
   * access continues until this date.
   */
  currentPeriodEndsAt?: Date;
  /** Free-form admin notes. */
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new member record (admin pre-approval, signup request,
 * or subscribe). The server stamps `id`, `createdAt`, and `updatedAt`.
 */
export type CreateCraftClubMemberInput = Omit<
  CraftClubMember,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a member. `email` is immutable (it's the natural key), so
 * it cannot be changed through an update.
 */
export type UpdateCraftClubMemberInput = Partial<
  Omit<CraftClubMember, 'id' | 'createdAt' | 'updatedAt' | 'email'>
> & {
  id: string;
};

/** A member with a live (billing or grace-period) subscription. */
export function isCraftClubMemberActive(member: CraftClubMember): boolean {
  return member.status === 'active' || member.status === 'past_due';
}

/**
 * Whether a member is eligible to start a subscription. Only pre-approved
 * members (or previously-cancelled ones who were re-approved) may subscribe.
 */
export function canSubscribeToCraftClub(member: CraftClubMember): boolean {
  return member.status === 'approved' || member.status === 'cancelled';
}

/** Whether the record is still awaiting admin approval. */
export function isCraftClubAccessRequest(member: CraftClubMember): boolean {
  return member.status === 'requested';
}

/**
 * Customer-safe projection of a member, returned by the self-service endpoints.
 * Deliberately omits internal Square identifiers (customer/card/subscription
 * IDs) so they never reach the browser.
 */
export interface CraftClubMemberPublicView {
  email: string;
  name?: string;
  status: CraftClubMemberStatus;
  subscribedAt?: Date;
  cancelledAt?: Date;
  currentPeriodEndsAt?: Date;
}

/** Format a Craft Club date (e.g. period end) for emails, in Eastern time. */
export function formatCraftClubDate(date?: Date): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Project a member to its customer-safe view. */
export function toCraftClubMemberPublicView(
  member: CraftClubMember
): CraftClubMemberPublicView {
  return {
    email: member.email,
    name: member.name,
    status: member.status,
    subscribedAt: member.subscribedAt,
    cancelledAt: member.cancelledAt,
    currentPeriodEndsAt: member.currentPeriodEndsAt,
  };
}
