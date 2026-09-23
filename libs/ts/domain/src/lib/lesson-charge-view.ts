/**
 * Grouping scheduled charges for the screen Katie reads before money moves
 * (#81).
 *
 * The daily job plans a charge, then takes it. Both happen without anybody
 * watching, so the only thing standing between a wrong rule and a wrong charge
 * is that somebody saw it coming. This decides what "coming" means.
 *
 * The groups are ordered by how much attention they need, not chronologically:
 * a failed charge is money the studio has already earned and not collected, so
 * it outranks anything still in the future.
 */
import type { LessonScheduledCharge } from './lesson-scheduled-charge';

export interface LessonChargeGroups {
  /** Failed — earned, not collected, and nothing retries on its own. */
  failed: LessonScheduledCharge[];
  /** Due now or overdue and still not taken, usually for want of a card. */
  dueNow: LessonScheduledCharge[];
  /** Planned, not yet due. This is the window in which Katie can stop one. */
  upcoming: LessonScheduledCharge[];
  /** Settled one way or another: paid, cancelled or waived. */
  settled: LessonScheduledCharge[];
}

/** Total of a set of charges, in cents. */
export function totalCents(charges: LessonScheduledCharge[]): number {
  return charges.reduce((sum, c) => sum + c.amountCents, 0);
}

/**
 * Split charges into the groups the billing screen shows.
 *
 * `settled` is capped by the caller, not here — the others are all actionable
 * and must never be truncated.
 */
export function groupLessonCharges(
  charges: LessonScheduledCharge[],
  now: Date = new Date()
): LessonChargeGroups {
  const groups: LessonChargeGroups = {
    failed: [],
    dueNow: [],
    upcoming: [],
    settled: [],
  };

  for (const charge of charges) {
    if (charge.status === 'failed') {
      groups.failed.push(charge);
    } else if (charge.status === 'scheduled') {
      // "Due" here means the job would take it on its next run. A charge sat
      // in this group for days is a signal in itself — almost always a family
      // with no card on file.
      if (charge.dueAt.getTime() <= now.getTime()) groups.dueNow.push(charge);
      else groups.upcoming.push(charge);
    } else if (charge.status === 'charging') {
      // In flight. Shown with the due ones so it is never invisible, but it
      // can no longer be stopped.
      groups.dueNow.push(charge);
    } else {
      groups.settled.push(charge);
    }
  }

  const byDueAsc = (a: LessonScheduledCharge, b: LessonScheduledCharge) =>
    a.dueAt.getTime() - b.dueAt.getTime();
  const byDueDesc = (a: LessonScheduledCharge, b: LessonScheduledCharge) =>
    b.dueAt.getTime() - a.dueAt.getTime();

  groups.failed.sort(byDueDesc);
  groups.dueNow.sort(byDueAsc);
  groups.upcoming.sort(byDueAsc);
  groups.settled.sort(byDueDesc);

  return groups;
}

/**
 * Can a human still stop this charge?
 *
 * `scheduled` because the money has not moved, and `failed` because a failed
 * charge now holds its lessons (#102) — waiving or cancelling it is the only
 * way to release them when the studio decides not to collect. `charging` is
 * out: the money is moving as we speak.
 */
export function canStopCharge(
  charge: Pick<LessonScheduledCharge, 'status'>
): boolean {
  return charge.status === 'scheduled' || charge.status === 'failed';
}

/**
 * The one-word state, for a chip. `charging` deliberately does not say "in
 * progress" — from Katie's side the money is gone and the only question left
 * is whether it lands.
 */
export function shortChargeStatus(
  charge: Pick<LessonScheduledCharge, 'status'>
): string {
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    charging: 'Being charged now',
    paid: 'Paid',
    failed: 'Failed',
    cancelled: 'Cancelled',
    waived: 'Waived',
  };
  return labels[charge.status] ?? charge.status;
}

/**
 * The part a chip cannot carry: why it failed, or why it was waived. Empty
 * when there is nothing to add beyond the state itself.
 */
export function chargeStatusDetail(
  charge: Pick<LessonScheduledCharge, 'status' | 'lastError' | 'waivedReason'>
): string {
  if (charge.status === 'failed' && charge.lastError) return charge.lastError;
  if (charge.status === 'waived' && charge.waivedReason) {
    return charge.waivedReason;
  }
  return '';
}

/**
 * How a charge's state reads to Katie, in her terms rather than the model's.
 *
 * `charging` deliberately does not say "in progress" — from her side the money
 * is gone and the only question is whether it lands.
 */
export function describeChargeStatus(
  charge: Pick<LessonScheduledCharge, 'status' | 'lastError' | 'waivedReason'>
): string {
  switch (charge.status) {
    case 'scheduled':
      return 'Scheduled';
    case 'charging':
      return 'Being charged now';
    case 'paid':
      return 'Paid';
    case 'failed':
      return charge.lastError ? `Failed: ${charge.lastError}` : 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'waived':
      return charge.waivedReason
        ? `Waived: ${charge.waivedReason}`
        : 'Waived';
    default:
      return charge.status;
  }
}
