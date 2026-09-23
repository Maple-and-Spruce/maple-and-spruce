import { describe, expect, it } from 'vitest';
import {
  MAX_SQUARE_IDEMPOTENCY_KEY_LENGTH,
  chargeCoversItsLessons,
  coveredLessonIds,
  lessonChargeIdempotencyKey,
  releaseLessonFromCharge,
  squareIdempotencyKeyFor,
} from './lesson-scheduled-charge';

/** The shape real ids take: a Firestore student id and a materialised lesson id. */
const REAL_CHARGE_ID =
  'chg-QKl2MzDofrGGKTOKwjDN-sched-CB9jfaPgnHobrjfEnqBo-2026-09-28';

describe('the Square idempotency key', () => {
  it('fits inside Square’s 45-character limit for a real charge id', () => {
    // The limit Square enforces, and the bug it caused: the old key was
    // `lesson-{chargeId}` — 69 characters here — so Square rejected every
    // lesson charge with "Field must not be greater than 45 length" (#99).
    const key = lessonChargeIdempotencyKey(REAL_CHARGE_ID);
    expect(key.length).toBeLessThanOrEqual(MAX_SQUARE_IDEMPOTENCY_KEY_LENGTH);
  });

  it('is stable for a charge, which is what makes a retry safe', () => {
    expect(lessonChargeIdempotencyKey(REAL_CHARGE_ID)).toBe(
      lessonChargeIdempotencyKey(REAL_CHARGE_ID)
    );
  });

  it('differs between charges, so one payment cannot stand in for another', () => {
    const keys = new Set(
      ['a', 'b', 'chg-stu-1-l1', 'chg-stu-1-l2', REAL_CHARGE_ID].map(
        lessonChargeIdempotencyKey
      )
    );
    expect(keys.size).toBe(5);
  });

  it('keeps a stored key that Square would accept', () => {
    const charge = { id: REAL_CHARGE_ID, idempotencyKey: 'lc-0123456789abcdef' };
    expect(squareIdempotencyKeyFor(charge)).toBe('lc-0123456789abcdef');
  });

  it('re-derives a stored key that Square would reject', () => {
    // Charges written before #99 carry the long key. Reusing it on Try again
    // fails exactly as the first attempt did, so those are re-derived — still
    // deterministically, so a charge that did reach Square still matches.
    const charge = {
      id: REAL_CHARGE_ID,
      idempotencyKey: `lesson-${REAL_CHARGE_ID}`,
    };
    expect(squareIdempotencyKeyFor(charge)).toBe(
      lessonChargeIdempotencyKey(REAL_CHARGE_ID)
    );
    expect(squareIdempotencyKeyFor(charge).length).toBeLessThanOrEqual(
      MAX_SQUARE_IDEMPOTENCY_KEY_LENGTH
    );
  });
});

describe('which charges speak for their lessons', () => {
  it.each(['scheduled', 'charging', 'paid', 'waived', 'cancelled'] as const)(
    'a %s charge covers its lessons',
    (status) => {
      expect(chargeCoversItsLessons({ status })).toBe(true);
    }
  );

  it('a failed charge covers its lessons too, until someone deals with it', () => {
    // Not because the money arrived — it did not — but because the charge
    // exists and holds those lessons. Treating them as unbilled aborted the
    // daily job (#100) and allowed overlapping charges (#102).
    expect(chargeCoversItsLessons({ status: 'failed' })).toBe(true);
    expect(
      coveredLessonIds([{ status: 'failed', lessonIds: ['l1', 'l2'] }])
    ).toEqual(new Set(['l1', 'l2']));
  });
});

describe('releasing a cancelled lesson from a charge', () => {
  it('reprices the block by its own average', () => {
    // By the charge's average, not by re-resolving the student's rate: the
    // charge carries the price the family agreed to, and a rate change since
    // then must not silently reprice the block.
    expect(
      releaseLessonFromCharge(
        { lessonIds: ['l1', 'l2', 'l3', 'l4'], amountCents: 12000 },
        'l2'
      )
    ).toEqual({ action: 'release', amountCents: 9000 });
  });

  it('cancels the charge when its last lesson goes', () => {
    expect(
      releaseLessonFromCharge({ lessonIds: ['l1'], amountCents: 3000 }, 'l1')
    ).toEqual({ action: 'cancel' });
  });

  it('never prices a block below nothing', () => {
    expect(
      releaseLessonFromCharge({ lessonIds: ['l1', 'l2'], amountCents: 0 }, 'l1')
    ).toEqual({ action: 'release', amountCents: 0 });
  });
});
