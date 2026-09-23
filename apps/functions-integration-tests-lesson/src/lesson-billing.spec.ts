/**
 * Lesson auto-billing, end to end against real Firestore + the Square mock (#81).
 *
 * The unit tests in `run-lesson-billing.logic.spec.ts` cover the decisions.
 * These cover what only a real database can show, and it is the difference
 * between "charges once" and "charges a family twice":
 *
 *   1. The **deterministic charge id** really does collide on a re-plan, so a
 *      second run of the job creates nothing new.
 *   2. A charge that has been taken really cannot then be waived or cancelled
 *      out from under the payment.
 *
 * A green emulator run is NOT proof of a Firestore composite index (see the
 * firebase-functions rule) — the analyzer covers that separately.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, EMULATOR_CONFIG } from '@maple/firebase/integration-test-utils';
import type {
  GetLessonBillingRequest,
  GetLessonBillingResponse,
  RunLessonBillingRequest,
  RunLessonBillingResult,
  SaveLessonBillingRuleRequest,
  SaveLessonBillingRuleResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  UpdateLessonScheduledChargeRequest,
  UpdateLessonScheduledChargeResponse,
} from '@maple/ts/firebase/api-types';

const TEACHER_ID = 'instructor-billing-teacher';
const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;
const DAY = 86_400_000;

/** `count` weekly lessons, the first `firstOffsetDays` from now. */
async function seedLessons(
  studentId: string,
  count: number,
  firstOffsetDays: number
): Promise<void> {
  const first = Date.now() + firstOffsetDays * DAY;
  for (let i = 0; i < count; i++) {
    await setFirestoreDoc('lessons', `${studentId}-lesson-${i + 1}`, {
      studentId,
      teacherId: TEACHER_ID,
      scheduledAt: new Date(first + i * 7 * DAY),
      durationMinutes: 30,
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

async function seedStudent(
  id: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await setFirestoreDoc('students', id, {
    name: `Billing ${id}`,
    instrument: 'violin',
    isAdultStudent: false,
    primaryTeacherId: TEACHER_ID,
    isHopeScholarship: false,
    primaryContactName: 'Parent',
    primaryContactEmail: `${id}@test.com`,
    status: 'active',
    registeredLessonLength: '30-min-full',
    squareCustomerId: 'cus_mock_1',
    squareCardId: 'ccof:mock-card-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

/** The callable error envelope comes back as an object, not a string. */
function errorText(result: { error?: unknown }): string {
  return JSON.stringify(result.error ?? '');
}

function billing(
  idToken: string,
  studentId?: string
): Promise<{ status: number; data?: GetLessonBillingResponse }> {
  return callFunction<GetLessonBillingRequest, GetLessonBillingResponse>({
    functionName: 'getLessonBilling',
    data: studentId ? { studentId } : {},
    idToken,
  });
}

function runBilling(
  idToken: string,
  dryRun = false
): Promise<{ status: number; data?: RunLessonBillingResult }> {
  return callFunction<RunLessonBillingRequest, RunLessonBillingResult>({
    functionName: 'triggerLessonBilling',
    data: { dryRun },
    idToken,
  });
}

describe('Lesson billing (#81)', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // A rate has to resolve, or every charge prices at zero and is skipped.
    await setFirestoreDoc('appConfig', 'lessonRates', {
      rateByLength: { '30-min-full': 4125 },
      updatedAt: new Date(),
    });
  }, 30000);

  describe('saveLessonBillingRule', () => {
    it('creates a rule, then edits that same rule rather than making a second', async () => {
      const created = await callFunction<
        SaveLessonBillingRuleRequest,
        SaveLessonBillingRuleResponse
      >({
        functionName: 'saveLessonBillingRule',
        data: {
          name: 'Standard 4-lesson block',
          cadence: 'every-n-lessons',
          lessonsPerCharge: 4,
          anchor: 'before-first',
          anchorOffsetDays: -1,
          isDefault: true,
        },
        idToken: adminUser.idToken,
      });

      expect(created.status).toBe(200);
      expect(created.data?.rule.id).toBeTruthy();

      const edited = await callFunction<
        SaveLessonBillingRuleRequest,
        SaveLessonBillingRuleResponse
      >({
        functionName: 'saveLessonBillingRule',
        data: {
          id: created.data?.rule.id,
          name: 'Standard 4-lesson block (edited)',
        } as SaveLessonBillingRuleRequest,
        idToken: adminUser.idToken,
      });

      expect(edited.data?.rule.id).toBe(created.data?.rule.id);
      expect(edited.data?.rule.name).toBe('Standard 4-lesson block (edited)');
      // The cadence it was created with survives a partial edit.
      expect(edited.data?.rule.lessonsPerCharge).toBe(4);
    }, 30000);

    it('refuses a rule that would charge months away from the teaching', async () => {
      const result = await callFunction<SaveLessonBillingRuleRequest>({
        functionName: 'saveLessonBillingRule',
        data: {
          name: 'Way off',
          cadence: 'every-n-lessons',
          lessonsPerCharge: 4,
          anchor: 'before-first',
          anchorOffsetDays: -90,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
      expect(errorText(result)).toMatch(/within 14 days/i);
    }, 30000);

    it('refuses a rule that charges for zero lessons', async () => {
      const result = await callFunction<SaveLessonBillingRuleRequest>({
        functionName: 'saveLessonBillingRule',
        data: {
          name: 'Zero',
          cadence: 'every-n-lessons',
          lessonsPerCharge: 0,
          anchor: 'before-first',
          anchorOffsetDays: -1,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
      expect(errorText(result)).toMatch(/at least one lesson/i);
    }, 30000);

    it('rejects an unauthenticated caller', async () => {
      const result = await callFunction({ functionName: 'getLessonBilling' });
      expect(result.status).toBe(401);
    }, 30000);
  });

  describe('runLessonBilling', () => {
    const STUDENT = 'student-billing-private';
    const HOPE_STUDENT = 'student-billing-hope';

    beforeAll(async () => {
      await seedStudent(STUDENT);
      await seedStudent(HOPE_STUDENT, { isHopeScholarship: true });
      // First lesson tomorrow, so the "day before the first" charge is due now.
      await seedLessons(STUDENT, 4, 1);
      await seedLessons(HOPE_STUDENT, 4, 1);
    }, 30000);

    it('takes no money on a dry run, and writes nothing', async () => {
      const result = await runBilling(adminUser.idToken, true);

      expect(result.status).toBe(200);
      expect(result.data?.dryRun).toBe(true);

      const after = await billing(adminUser.idToken);
      expect(after.data?.charges).toHaveLength(0);
    }, 60000);

    it('plans and charges once; a second run does neither again', async () => {
      const first = await runBilling(adminUser.idToken);

      expect(first.status).toBe(200);
      expect(first.data?.chargesPlanned).toBe(1); // the Hope student is not billed
      expect(first.data?.charged).toBe(1);

      const second = await runBilling(adminUser.idToken);

      // Nothing new is planned and nothing is taken again. The four lessons are
      // filtered out *before* blocking, because the paid charge already covers
      // them (legacy #864) — so planning never reaches the deterministic-id collision
      // that used to be what stopped it. The covered count is what makes a
      // steady-state run distinguishable from one that planned nothing by
      // mistake.
      expect(second.data?.chargesPlanned).toBe(0);
      expect(second.data?.lessonsAlreadyCovered).toBe(4);
      expect(second.data?.charged).toBe(0);

      const charges = (await billing(adminUser.idToken)).data?.charges ?? [];
      expect(charges).toHaveLength(1);
      expect(charges[0].studentId).toBe(STUDENT);
      expect(charges[0].status).toBe('paid');
      expect(charges[0].amountCents).toBe(4 * 4125);
      expect(charges[0].squarePaymentId).toBeTruthy();
    }, 60000);

    it('never plans a charge for a Hope student', async () => {
      // Hope bills through EMA. A charge here would bill a family for teaching
      // the state is paying for.
      const result = await billing(adminUser.idToken, HOPE_STUDENT);
      expect(result.data?.charges).toHaveLength(0);
    }, 30000);

    it('refuses to waive a charge that has already been paid', async () => {
      const charges = (await billing(adminUser.idToken, STUDENT)).data?.charges;

      const result = await callFunction<
        UpdateLessonScheduledChargeRequest,
        UpdateLessonScheduledChargeResponse
      >({
        functionName: 'updateLessonScheduledCharge',
        data: {
          id: charges?.[0].id ?? '',
          status: 'waived',
          waivedReason: 'too late',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
      expect(errorText(result)).toMatch(/already paid/i);
    }, 30000);
  });

  describe('stopping a charge before it is taken', () => {
    const STUDENT = 'student-billing-waive';

    it('waives a scheduled charge, and a later run leaves it alone', async () => {
      await seedStudent(STUDENT);
      // Far enough out that the charge is planned but not yet due.
      await seedLessons(STUDENT, 4, 30);

      await runBilling(adminUser.idToken);

      const planned = (await billing(adminUser.idToken, STUDENT)).data?.charges;
      expect(planned).toHaveLength(1);
      expect(planned?.[0].status).toBe('scheduled');

      const waived = await callFunction<
        UpdateLessonScheduledChargeRequest,
        UpdateLessonScheduledChargeResponse
      >({
        functionName: 'updateLessonScheduledCharge',
        data: {
          id: planned?.[0].id ?? '',
          status: 'waived',
          waivedReason: 'Comped — makeup for a lesson we cancelled',
        },
        idToken: adminUser.idToken,
      });

      expect(waived.status).toBe(200);
      expect(waived.data?.charge.status).toBe('waived');
      expect(waived.data?.charge.waivedReason).toMatch(/Comped/);
      // Who comped it has to survive on the record.
      expect(waived.data?.charge.waivedByUid).toBe(adminUser.uid);

      // A waived charge is terminal — a later run must not resurrect it or
      // plan a replacement for the same block.
      const rerun = await runBilling(adminUser.idToken);
      expect(rerun.data?.chargesPlanned).toBe(0);

      const after = (await billing(adminUser.idToken, STUDENT)).data?.charges;
      expect(after).toHaveLength(1);
      expect(after?.[0].status).toBe('waived');
    }, 60000);
  });
  describe('a failed charge holds its lessons', () => {
    const DECLINED = 'student-billing-declined';
    const NEIGHBOUR = 'student-billing-neighbour';

    it('does not re-plan them, and does not stop the run for anyone else', async () => {
      // The outage this closes (#100, #102): a failed charge left its lessons
      // looking unbilled, so the next run re-planned the same block, collided
      // with the failed charge's deterministic id, and threw — taking billing
      // for EVERY student down with it, every day, until someone noticed.
      await seedStudent(DECLINED);
      await seedLessons(DECLINED, 4, 1);

      await fetch(`${SQUARE_MOCK}/_mock/decline-next-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CARD_DECLINED' }),
      });

      const first = await runBilling(adminUser.idToken);
      expect(first.status).toBe(200);
      expect(first.data?.chargeFailed).toBe(1);

      const failed = (await billing(adminUser.idToken, DECLINED)).data?.charges;
      expect(failed).toHaveLength(1);
      expect(failed?.[0].status).toBe('failed');

      // A second student, billed for the first time on the run after the
      // failure: proof the failure is contained rather than fatal.
      await seedStudent(NEIGHBOUR);
      await seedLessons(NEIGHBOUR, 4, 1);

      const second = await runBilling(adminUser.idToken);
      expect(second.status).toBe(200);
      expect(second.data?.planningFailed).toBe(0);

      const neighbour = (await billing(adminUser.idToken, NEIGHBOUR)).data
        ?.charges;
      expect(neighbour).toHaveLength(1);
      expect(neighbour?.[0].status).toBe('paid');

      // And the declined student still has exactly one charge — no duplicate
      // block was planned over the lessons the failed charge names.
      const still = (await billing(adminUser.idToken, DECLINED)).data?.charges;
      expect(still).toHaveLength(1);
      expect(still?.[0].id).toBe(failed?.[0].id);
    }, 120000);

    it('can be waived, which is how an admin closes it out', async () => {
      // Waive and cancel accept `failed` now: with the lessons held by the
      // charge, this is the only way to say "we are not collecting this".
      const failed = (await billing(adminUser.idToken, DECLINED)).data
        ?.charges?.[0];

      const waived = await callFunction<
        UpdateLessonScheduledChargeRequest,
        UpdateLessonScheduledChargeResponse
      >({
        functionName: 'updateLessonScheduledCharge',
        data: {
          id: failed?.id ?? '',
          status: 'waived',
          waivedReason: 'Card never went through; comped',
        },
        idToken: adminUser.idToken,
      });

      expect(waived.status).toBe(200);
      expect(waived.data?.charge.status).toBe('waived');
    }, 60000);
  });
  describe('cancelling a lesson inside a planned charge', () => {
    const STUDENT = 'student-billing-cancel';

    it('takes the lesson out of the charge and reprices it', async () => {
      // A cancelled lesson used to stay inside its planned charge, so the
      // family was billed for teaching everyone had agreed would not
      // happen (#105).
      await seedStudent(STUDENT);
      // Far enough out that the charge is planned but not yet due.
      await seedLessons(STUDENT, 4, 30);

      await runBilling(adminUser.idToken);
      const planned = (await billing(adminUser.idToken, STUDENT)).data
        ?.charges?.[0];
      expect(planned?.status).toBe('scheduled');
      expect(planned?.lessonIds).toHaveLength(4);
      expect(planned?.amountCents).toBe(4 * 4125);

      const cancelled = await callFunction<
        UpdateLessonRequest,
        UpdateLessonResponse
      >({
        functionName: 'updateLesson',
        data: { id: `${STUDENT}-lesson-1`, status: 'cancelled' },
        idToken: adminUser.idToken,
      });
      expect(cancelled.status).toBe(200);

      const after = (await billing(adminUser.idToken, STUDENT)).data
        ?.charges?.[0];
      expect(after?.lessonIds).toEqual([
        `${STUDENT}-lesson-2`,
        `${STUDENT}-lesson-3`,
        `${STUDENT}-lesson-4`,
      ]);
      expect(after?.amountCents).toBe(3 * 4125);
      expect(after?.status).toBe('scheduled');
    }, 120000);

    it('cancels the charge outright when its last lesson goes', async () => {
      const SOLO = 'student-billing-cancel-solo';
      await seedStudent(SOLO);
      await seedLessons(SOLO, 4, 30);

      await runBilling(adminUser.idToken);
      const planned = (await billing(adminUser.idToken, SOLO)).data?.charges?.[0];
      expect(planned?.lessonIds).toHaveLength(4);

      for (let i = 1; i <= 4; i++) {
        await callFunction<UpdateLessonRequest, UpdateLessonResponse>({
          functionName: 'updateLesson',
          data: { id: `${SOLO}-lesson-${i}`, status: 'cancelled' },
          idToken: adminUser.idToken,
        });
      }

      const after = (await billing(adminUser.idToken, SOLO)).data?.charges?.[0];
      expect(after?.status).toBe('cancelled');
    }, 120000);
  });
});
