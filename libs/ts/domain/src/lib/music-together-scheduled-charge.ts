/**
 * Music Together scheduled charge domain types
 *
 * A scheduled charge is one future installment a family owes after the
 * registration-time payment — materialized as its own document so the Week-5
 * (and any later) auto-charge job can query "what's due now" directly:
 * `where status == 'scheduled' and dueAt <= now`. This mirrors the codebase's
 * "materialize the schedule as documents" convention (lessons `seriesId`).
 *
 * One registration on the installments plan produces N-1 of these (the first
 * installment is charged at registration time, not scheduled).
 *
 * Overcharge safety is enforced by three layers: the `status` lease here
 * (`scheduled → charging → paid | failed`), a stable `idempotencyKey`, and the
 * cancel guard (cancelling a registration flips its charges to `cancelled`).
 */

/**
 * Lifecycle of a scheduled charge.
 * `scheduled → charging → paid | failed`; `cancelled` is terminal and set when
 * the owning registration is cancelled so the charge job skips it.
 */
export type MusicTogetherChargeStatus =
  | 'scheduled' // Due in the future; awaiting the charge job
  | 'charging' // Lease held by an in-flight attempt (prevents overlap)
  | 'paid' // Successfully charged
  | 'failed' // Declined/errored — needs manual resolution
  | 'cancelled'; // Registration cancelled; do not charge

/** Statuses the charge job must skip (already terminal or in flight). */
export const MT_TERMINAL_CHARGE_STATUSES: readonly MusicTogetherChargeStatus[] =
  ['paid', 'failed', 'cancelled'];

/**
 * A future card-on-file charge for one installment of one registration.
 */
export interface MusicTogetherScheduledCharge {
  id: string;
  registrationId: string;
  sectionId: string;
  /** 1-based index of this installment within the registration's plan (2 = the second installment). */
  installmentNumber: number;
  amountCents: number;
  /** When the charge becomes due. */
  dueAt: Date;
  status: MusicTogetherChargeStatus;
  /**
   * Stable Square idempotency key (e.g. `mt-charge-{id}`). Never time-based —
   * a retry with the same key returns the original payment instead of charging
   * again. The charge document id is itself stable, so derive the key from it.
   */
  idempotencyKey: string;
  /** Square payment ID once charged. */
  squarePaymentId?: string;
  /** Failure detail surfaced to admins when `status === 'failed'`. */
  lastError?: string;
  /** When the charge reached a terminal state (paid/failed/cancelled). */
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a scheduled charge. The server stamps `id`, `createdAt`,
 * `updatedAt`, and (since the key derives from the id) `idempotencyKey`.
 */
export type CreateMusicTogetherScheduledChargeInput = Omit<
  MusicTogetherScheduledCharge,
  'id' | 'idempotencyKey' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a scheduled charge (status transitions, payment result).
 */
export type UpdateMusicTogetherScheduledChargeInput = Partial<
  Omit<
    MusicTogetherScheduledCharge,
    'id' | 'registrationId' | 'sectionId' | 'idempotencyKey' | 'createdAt' | 'updatedAt'
  >
> & {
  id: string;
};

/** Derive the stable idempotency key for a charge from its document id. */
export function mtChargeIdempotencyKey(chargeId: string): string {
  return `mt-charge-${chargeId}`;
}

/** Whether the charge is still awaiting its first/next attempt. */
export function mtChargeIsPending(
  charge: Pick<MusicTogetherScheduledCharge, 'status'>
): boolean {
  return charge.status === 'scheduled';
}

/**
 * Whether any of a registration's scheduled charges failed — the "past due"
 * signal surfaced to admins on the roster.
 */
export function mtHasFailedCharge(
  charges: Pick<MusicTogetherScheduledCharge, 'status'>[]
): boolean {
  return charges.some((c) => c.status === 'failed');
}

/**
 * The soonest charge a customer could still act on by updating their card —
 * one that is `scheduled` (upcoming) or `failed` (needs a new card). Returns
 * the earliest such charge by due date, or undefined when nothing is
 * actionable (all paid/cancelled). Drives the "your $X charge on DATE will use
 * the new card" context on the self-service manage page.
 */
export function mtNextActionableCharge(
  charges: MusicTogetherScheduledCharge[]
): MusicTogetherScheduledCharge | undefined {
  return charges
    .filter((c) => c.status === 'scheduled' || c.status === 'failed')
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
}
