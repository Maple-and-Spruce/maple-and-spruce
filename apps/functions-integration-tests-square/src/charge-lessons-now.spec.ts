/**
 * Paying ahead for a block of lessons (#864).
 *
 * What has to be true here cannot be proven by unit tests: that the charge
 * document and the Square payment agree, that a second click cannot take a
 * second payment, and that a declined card leaves a record someone can act on.
 *
 * The Square mock returns the ORIGINAL payment when an idempotency key is
 * reused, the way real Square does. Without that this suite would pass on a
 * double charge.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  callFunction,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  ChargeLessonsNowRequest,
  ChargeLessonsNowResponse,
} from '@maple/ts/firebase/api-types';

// From the shared config, which applies EMULATOR_PORT_OFFSET. Reading
// SQUARE_MOCK_SERVER_PORT directly fell back to 9997 in a worktree, where the
// mock listens on an offset port, so every test here failed locally with
// ECONNREFUSED — the same trap link-student-card.spec.ts already documents.
const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

const RATE_CENTS = 4125;
const DAY = 86_400_000;

/** Far enough ahead that the suite never straddles midnight. */
function futureLesson(n: number): Date {
  return new Date(Date.now() + (n + 1) * 7 * DAY);
}

async function seedStudent(
  id: string,
  over: Record<string, unknown> = {}
): Promise<void> {
  await setFirestoreDoc('students', id, {
    name: 'Delphine Cray',
    instrument: 'fiddle',
    isAdultStudent: true,
    primaryTeacherId: 'instructor-x',
    primaryContactName: 'Delphine Cray',
    primaryContactEmail: 'delphine.cray@example.com',
    isHopeScholarship: false,
    status: 'active',
    registeredLessonLength: '30-min-full',
    squareCustomerId: 'cus_adult',
    squareCardId: 'ccof:adult',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });
}

async function seedLessons(studentId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await setFirestoreDoc('lessons', `${studentId}-lesson-${i}`, {
      studentId,
      teacherId: 'instructor-x',
      scheduledAt: futureLesson(i),
      durationMinutes: 30,
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

describe('Charging a block of lessons now (#864)', () => {
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

    await setFirestoreDoc('appConfig', 'lessonRates', {
      rateByLength: { '30-min-full': RATE_CENTS },
      updatedAt: new Date(),
    });
  }, 30000);

  beforeEach(async () => {
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
  });

  const chargeNow = (data: ChargeLessonsNowRequest) =>
    callFunction<ChargeLessonsNowRequest, ChargeLessonsNowResponse>({
      functionName: 'chargeLessonsNow',
      data,
      idToken: adminUser.idToken,
    });

  it('takes one payment and records it as a paid charge', async () => {
    await seedStudent('stu-prepay');
    await seedLessons('stu-prepay', 6);

    const result = await chargeNow({
      studentId: 'stu-prepay',
      lessonCount: 4,
      note: 'Spring block',
    });

    expect(result.status).toBe(200);
    const charge = result.data?.charge;
    expect(charge?.status).toBe('paid');
    expect(charge?.amountCents).toBe(4 * RATE_CENTS);
    expect(charge?.lessonIds).toHaveLength(4);
    expect(charge?.squarePaymentId).toBeTruthy();
    expect(charge?.source).toBe('manual');
    expect(charge?.note).toBe('Spring block');

    // The document really is there, not just in the response.
    const stored = await getFirestoreDoc('lessonScheduledCharges', charge!.id);
    expect(stored).toBeTruthy();

    // Exactly one payment reached Square.
    const requests = await (
      await fetch(`${SQUARE_MOCK}/_mock/requests`)
    ).json();
    const payments = (requests.requests as Array<{ path: string; method: string }>)
      .filter((r) => r.method === 'POST' && r.path === '/v2/payments');
    expect(payments).toHaveLength(1);
  }, 90000);

  it('charging the same lessons twice does not take a second payment', async () => {
    await seedStudent('stu-twice');
    await seedLessons('stu-twice', 4);

    const first = await chargeNow({ studentId: 'stu-twice', lessonCount: 2 });
    expect(first.status).toBe(200);

    // Same lessons again. The charge document already exists at its
    // deterministic id, so the claim is lost and nothing reaches Square.
    const second = await chargeNow({
      studentId: 'stu-twice',
      lessonIds: first.data!.charge.lessonIds,
    });
    expect(second.status).not.toBe(200);

    const charges = await listFirestoreDocs('lessonScheduledCharges');
    const mine = charges.filter(
      (c) => c.data['studentId'] === 'stu-twice'
    );
    expect(mine).toHaveLength(1);
  }, 90000);

  it('moves past lessons already paid for when counting the next ones', async () => {
    await seedStudent('stu-next');
    await seedLessons('stu-next', 8);

    const first = await chargeNow({ studentId: 'stu-next', lessonCount: 2 });
    const second = await chargeNow({ studentId: 'stu-next', lessonCount: 2 });

    expect(second.status).toBe(200);
    const overlap = first.data!.charge.lessonIds.filter((id) =>
      second.data!.charge.lessonIds.includes(id)
    );
    expect(overlap).toEqual([]);
  }, 90000);

  it('refuses a Hope student — they bill through the EMA portal', async () => {
    await seedStudent('stu-hope', { isHopeScholarship: true });
    await seedLessons('stu-hope', 4);

    const result = await chargeNow({ studentId: 'stu-hope', lessonCount: 2 });

    expect(result.status).not.toBe(200);
    const charges = await listFirestoreDocs('lessonScheduledCharges');
    expect(
      charges.filter((c) => c.data['studentId'] === 'stu-hope')
    ).toHaveLength(0);
  }, 90000);

  it('refuses a student with no card on file, without creating a charge', async () => {
    await seedStudent('stu-nocard', { squareCardId: null, squareCustomerId: null });
    await seedLessons('stu-nocard', 4);

    const result = await chargeNow({ studentId: 'stu-nocard', lessonCount: 2 });

    expect(result.status).not.toBe(200);
    const charges = await listFirestoreDocs('lessonScheduledCharges');
    expect(
      charges.filter(
        (c) => c.data['studentId'] === 'stu-nocard'
      )
    ).toHaveLength(0);
  }, 90000);

  it('refuses when the total no longer matches what the admin was shown', async () => {
    await seedStudent('stu-drift');
    await seedLessons('stu-drift', 4);

    const result = await chargeNow({
      studentId: 'stu-drift',
      lessonCount: 2,
      expectedAmountCents: 1,
    });

    expect(result.status).not.toBe(200);
    const charges = await listFirestoreDocs('lessonScheduledCharges');
    expect(
      charges.filter((c) => c.data['studentId'] === 'stu-drift')
    ).toHaveLength(0);
  }, 90000);

  describe('a declined card', () => {
    it('leaves a failed charge, and the retry can take it', async () => {
      await seedStudent('stu-declined');
      await seedLessons('stu-declined', 4);

      await fetch(`${SQUARE_MOCK}/_mock/decline-next-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CARD_DECLINED' }),
      });

      const declined = await chargeNow({
        studentId: 'stu-declined',
        lessonCount: 2,
      });
      expect(declined.status).not.toBe(200);

      const charges = await listFirestoreDocs('lessonScheduledCharges');
      const failed = charges.find(
        (c) => c.data['studentId'] === 'stu-declined'
      ) as { id: string; status: string; lastError?: string } | undefined;

      // The money did not move, but the attempt is on the record — which is
      // what lets Katie tell a family their card was declined.
      expect(failed?.data['status']).toBe('failed');
      expect(failed?.data['lastError']).toBeTruthy();

      const retried = await chargeNow({
        studentId: 'stu-declined',
        retryChargeId: failed!.id,
      });

      expect(retried.status).toBe(200);
      expect(retried.data?.charge.status).toBe('paid');
      expect(retried.data?.charge.squarePaymentId).toBeTruthy();
      expect(retried.data?.charge.lastError).toBeFalsy();
    }, 120000);
  });
});
