/**
 * The daily automatic charge is paused (#157): nobody's card is charged unless
 * someone presses the button.
 */
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findRules: vi.fn(),
  planCharges: vi.fn(),
  chargeDue: vi.fn(),
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: () => ({ value: () => '' }),
  defineString: () => ({ value: () => '' }),
}));

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn(),
  SQUARE_SECRET_NAMES: [],
  SQUARE_STRING_NAMES: [],
}));

vi.mock('@maple/firebase/database', () => ({
  LessonBillingRuleRepository: { findAll: mocks.findRules },
  LessonScheduledChargeRepository: {},
  LessonRepository: {},
  StudentRepository: {},
  InvoiceRepository: {},
  LessonRatesConfigRepository: {},
  InstructorRepository: {},
}));

vi.mock('./run-lesson-billing.logic', () => ({
  planCharges: mocks.planCharges,
  chargeDue: mocks.chargeDue,
}));

import { LESSON_AUTOPAY_PAUSED, runLessonBilling } from './run-lesson-billing';

describe('runLessonBilling schedule (#157)', () => {
  it('is paused', () => {
    expect(LESSON_AUTOPAY_PAUSED).toBe(true);
  });

  it('plans nothing and charges nothing when it fires', async () => {
    // onSchedule is mocked to hand back the handler itself.
    await (runLessonBilling as unknown as () => Promise<void>)();

    expect(mocks.findRules).not.toHaveBeenCalled();
    expect(mocks.planCharges).not.toHaveBeenCalled();
    expect(mocks.chargeDue).not.toHaveBeenCalled();
  });
});
