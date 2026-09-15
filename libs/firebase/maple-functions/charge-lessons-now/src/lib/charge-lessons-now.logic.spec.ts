import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { chargeLessonsNowLogic } from './charge-lessons-now.logic';
import type { ChargeNowDeps } from './charge-lessons-now.logic';
import type {
  Lesson,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';

const NOW = new Date('2026-03-10T12:00:00Z');
const RATE = 4125;
const rate = () => RATE;

function student(over: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    name: 'Robin Ashfield',
    instrument: 'violin',
    status: 'active',
    primaryContactName: 'Morgan Ashfield',
    primaryContactEmail: 'morgan@example.com',
    squareCustomerId: 'sq-cust-1',
    squareCardId: 'sq-card-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Student;
}

function lesson(id: string, daysFromNow: number): Lesson {
  return {
    id,
    studentId: 'student-1',
    teacherId: 'teacher-1',
    scheduledAt: new Date(NOW.getTime() + daysFromNow * 86_400_000),
    durationMinutes: 30,
    status: 'scheduled',
    createdAt: NOW,
    updatedAt: NOW,
  } as Lesson;
}

function failedCharge(): LessonScheduledCharge {
  return {
    id: 'chg-student-1-lesson-1',
    studentId: 'student-1',
    ruleId: 'rule-1',
    lessonIds: ['lesson-1', 'lesson-2'],
    amountCents: 2 * RATE,
    dueAt: NOW,
    status: 'failed',
    idempotencyKey: 'lesson-chg-student-1-lesson-1',
    lastError: 'CARD_DECLINED',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('chargeLessonsNowLogic', () => {
  let deps: {
    [K in keyof ChargeNowDeps]: MockedFunction<ChargeNowDeps[K]>;
  };

  const lessons = Array.from({ length: 6 }, (_, i) => lesson(`lesson-${i + 1}`, i + 1));

  beforeEach(() => {
    deps = {
      claimByCreate: vi.fn().mockResolvedValue(true),
      claimRetry: vi.fn().mockResolvedValue(true),
      findCharge: vi.fn().mockResolvedValue(undefined),
      markPaid: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      charge: vi.fn().mockResolvedValue('sq-payment-1'),
    } as never;
  });

  const run = (over: Record<string, unknown> = {}) =>
    chargeLessonsNowLogic(
      {
        student: student(),
        lessons,
        existingCharges: [],
        uid: 'admin-1',
        ...over,
      } as never,
      deps as never,
      rate,
      NOW
    );

  it('charges the next four lessons by default and records the payment', async () => {
    const outcome = await run();

    expect(outcome).toMatchObject({
      ok: true,
      chargeId: 'chg-student-1-lesson-1',
      squarePaymentId: 'sq-payment-1',
      amountCents: 4 * RATE,
    });
    expect(deps.charge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 4 * RATE,
        cardId: 'sq-card-1',
        customerId: 'sq-cust-1',
        idempotencyKey: 'lesson-chg-student-1-lesson-1',
      })
    );
    expect(deps.markPaid).toHaveBeenCalledWith(
      'chg-student-1-lesson-1',
      'sq-payment-1'
    );
  });

  it('claims the charge BEFORE taking the money', async () => {
    const order: string[] = [];
    deps.claimByCreate.mockImplementation(async () => {
      order.push('claim');
      return true;
    });
    deps.charge.mockImplementation(async () => {
      order.push('charge');
      return 'sq-payment-1';
    });

    await run();

    expect(order).toEqual(['claim', 'charge']);
  });

  it('does not charge when the claim is lost to another click', async () => {
    deps.claimByCreate.mockResolvedValue(false);

    const outcome = await run();

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'already-claimed' },
    });
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('records a declined card as failed rather than losing it', async () => {
    deps.charge.mockRejectedValue(new Error('CARD_DECLINED'));

    const outcome = await run();

    expect(outcome).toMatchObject({
      ok: false,
      chargeId: 'chg-student-1-lesson-1',
      refusal: { kind: 'payment-failed', message: 'CARD_DECLINED' },
    });
    expect(deps.markFailed).toHaveBeenCalledWith(
      'chg-student-1-lesson-1',
      'CARD_DECLINED'
    );
    expect(deps.markPaid).not.toHaveBeenCalled();
  });

  it('refuses a Hope student outright — they bill through the EMA portal', async () => {
    const outcome = await run({ student: student({ isHopeScholarship: true }) });

    expect(outcome).toEqual({ ok: false, refusal: { kind: 'not-chargeable' } });
    expect(deps.claimByCreate).not.toHaveBeenCalled();
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('refuses an inactive student', async () => {
    const outcome = await run({ student: student({ status: 'inactive' }) });

    expect(outcome).toEqual({ ok: false, refusal: { kind: 'not-chargeable' } });
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('refuses when there is no card on file', async () => {
    const outcome = await run({ student: student({ squareCardId: undefined }) });

    expect(outcome).toEqual({ ok: false, refusal: { kind: 'no-card' } });
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('refuses when the total moved since the admin saw it', async () => {
    const outcome = await run({ expectedAmountCents: 1000 });

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'amount-changed', actualCents: 4 * RATE },
    });
    expect(deps.charge).not.toHaveBeenCalled();
  });

  it('charges when the total still matches what was shown', async () => {
    const outcome = await run({ expectedAmountCents: 4 * RATE });
    expect(outcome).toMatchObject({ ok: true });
  });

  it('honours an explicit lesson selection', async () => {
    const outcome = await run({ lessonIds: ['lesson-3', 'lesson-4'] });

    expect(outcome).toMatchObject({ ok: true, amountCents: 2 * RATE });
    expect(deps.claimByCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'chg-student-1-lesson-3',
        lessonIds: ['lesson-3', 'lesson-4'],
        chargedByUid: 'admin-1',
      })
    );
  });

  it('will not charge lessons another charge already covers', async () => {
    const covering: LessonScheduledCharge = {
      ...failedCharge(),
      status: 'paid',
    };

    const outcome = await run({
      existingCharges: [covering],
      lessonIds: ['lesson-1'],
    });

    expect(outcome).toEqual({
      ok: false,
      refusal: { kind: 'plan', problem: 'already-covered' },
    });
    expect(deps.charge).not.toHaveBeenCalled();
  });

  describe('retrying a failed charge', () => {
    it('reuses the original idempotency key, so Square cannot charge twice', async () => {
      deps.findCharge.mockResolvedValue(failedCharge());

      const outcome = await run({ retryChargeId: 'chg-student-1-lesson-1' });

      expect(outcome).toMatchObject({ ok: true, amountCents: 2 * RATE });
      expect(deps.charge).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'lesson-chg-student-1-lesson-1',
          amountCents: 2 * RATE,
        })
      );
      expect(deps.claimByCreate).not.toHaveBeenCalled();
    });

    it('refuses to retry a charge that is not failed', async () => {
      deps.findCharge.mockResolvedValue({
        ...failedCharge(),
        status: 'paid',
      });

      const outcome = await run({ retryChargeId: 'chg-student-1-lesson-1' });

      expect(outcome).toEqual({ ok: false, refusal: { kind: 'not-retryable' } });
      expect(deps.charge).not.toHaveBeenCalled();
    });

    it('refuses when another retry already claimed it', async () => {
      deps.findCharge.mockResolvedValue(failedCharge());
      deps.claimRetry.mockResolvedValue(false);

      const outcome = await run({ retryChargeId: 'chg-student-1-lesson-1' });

      expect(outcome).toEqual({ ok: false, refusal: { kind: 'already-claimed' } });
      expect(deps.charge).not.toHaveBeenCalled();
    });
  });
});
