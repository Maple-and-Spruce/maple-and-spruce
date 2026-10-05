/**
 * Paying ahead for a block of lessons (legacy #864).
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

/**
 * Lesson ids the length production actually produces.
 *
 * A materialised lesson is `sched-{20-char schedule id}-{YYYY-MM-DD}`, and the
 * charge id built from one of those plus a 20-character student id is what
 * pushed the Square idempotency key past its 45-character limit (#99). Short
 * fixture ids kept the key under the limit, so the suite stayed green while
 * every real charge was rejected — the ids have to have the real shape for the
 * mock's length check to mean anything.
 */
function realisticLessonId(studentId: string, index: number): string {
  const day = String(index + 1).padStart(2, '0');
  return `sched-${studentId.padEnd(20, 'x').slice(0, 20)}-2026-11-${day}`;
}

/**
 * A lesson already taught, `weeksAgo` back (#128). `status` so a caller can
 * seed the "nobody marked it taught" case as well as the billable one.
 */
async function seedTaughtLesson(
  studentId: string,
  id: string,
  weeksAgo: number,
  status = 'rendered'
): Promise<void> {
  await setFirestoreDoc('lessons', id, {
    studentId,
    teacherId: 'instructor-x',
    scheduledAt: new Date(Date.now() - weeksAgo * 7 * DAY),
    durationMinutes: 30,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function seedLessons(studentId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await setFirestoreDoc('lessons', realisticLessonId(studentId, i), {
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

describe('Charging a block of lessons now (legacy #864)', () => {
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

  it("prices from the primary teacher's rate for the student's instrument", async () => {
    // The teacher has priced fiddle; the studio default is RATE_CENTS. The
    // teacher's rate is what the screen showed and what must be taken.
    await setFirestoreDoc('instructors', 'instructor-rated', {
      name: 'Rated Teacher',
      email: 'rated-teacher@example.com',
      status: 'active',
      lessonRates: { fiddle: { '30-min-full': 5000 } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await seedStudent('stu-teacher-rate', { primaryTeacherId: 'instructor-rated' });
    await seedLessons('stu-teacher-rate', 2);

    const result = await chargeNow({
      studentId: 'stu-teacher-rate',
      lessonCount: 2,
      expectedAmountCents: 2 * 5000,
    });

    expect(result.status).toBe(200);
    expect(result.data?.charge.amountCents).toBe(2 * 5000);
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
  describe('a lesson already on an invoice', () => {
    it('is never also charged to the card', async () => {
      // Invoicing is explicit now, so an invoice is a deliberate ask. Charging
      // the same lesson would bill the family twice for one lesson (#101).
      await seedStudent('stu-invoiced');
      await seedLessons('stu-invoiced', 4);
      const firstLesson = realisticLessonId('stu-invoiced', 0);

      await setFirestoreDoc('invoices', 'inv-stu-invoiced', {
        studentId: 'stu-invoiced',
        status: 'sent',
        lineItems: [
          {
            id: 'line-1',
            description: '30-min lesson',
            quantity: 1,
            unitAmountCents: 4125,
            subtotalCents: 4125,
            lessonId: firstLesson,
          },
        ],
        totalCents: 4125,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const named = await chargeNow({
        studentId: 'stu-invoiced',
        lessonIds: [firstLesson],
      });
      expect(named.status).not.toBe(200);

      // And counting forward skips it rather than silently including it.
      const forward = await chargeNow({
        studentId: 'stu-invoiced',
        lessonCount: 3,
      });
      expect(forward.status).toBe(200);
      expect(forward.data?.charge.lessonIds).not.toContain(firstLesson);
      expect(forward.data?.charge.lessonIds).toHaveLength(3);
    }, 120000);
  });

  describe('collecting for teaching already given (#128)', () => {
    it('charges a lesson that was taught weeks ago and never paid for', async () => {
      await seedStudent('stu-owed');
      await seedTaughtLesson('stu-owed', 'lesson-owed-1', 3);

      const result = await chargeNow({
        studentId: 'stu-owed',
        lessonIds: ['lesson-owed-1'],
        note: 'Caught up on Sep 3',
      });

      expect(result.status).toBe(200);
      expect(result.data?.charge.status).toBe('paid');
      expect(result.data?.charge.lessonIds).toEqual(['lesson-owed-1']);
      expect(result.data?.charge.amountCents).toBe(RATE_CENTS);
      // The same record an automatic charge writes, so the charges screen,
      // teacher payouts and the next planning run need no special case.
      expect(result.data?.charge.source).toBe('manual');
    }, 120000);

    it('charges a past lesson and an upcoming one in a single payment', async () => {
      await seedStudent('stu-mixed');
      await seedTaughtLesson('stu-mixed', 'lesson-mixed-past', 2);
      await seedLessons('stu-mixed', 2);

      const upcoming = realisticLessonId('stu-mixed', 0);
      const result = await chargeNow({
        studentId: 'stu-mixed',
        lessonIds: ['lesson-mixed-past', upcoming],
      });

      expect(result.status).toBe(200);
      expect(result.data?.charge.amountCents).toBe(2 * RATE_CENTS);
      expect(result.data?.charge.lessonIds).toHaveLength(2);
      expect(result.data?.charge.lessonIds).toContain('lesson-mixed-past');
      expect(result.data?.charge.lessonIds).toContain(upcoming);
    }, 120000);

    it('never sweeps a past lesson into a count-based charge', async () => {
      // The safety property, proven against the real function: "charge the next
      // two" sells teaching still to come. A debt has to be ticked by name.
      await seedStudent('stu-count');
      await seedTaughtLesson('stu-count', 'lesson-count-past', 2);
      await seedLessons('stu-count', 3);

      const result = await chargeNow({
        studentId: 'stu-count',
        lessonCount: 2,
      });

      expect(result.status).toBe(200);
      expect(result.data?.charge.lessonIds).not.toContain('lesson-count-past');
      expect(result.data?.charge.lessonIds).toHaveLength(2);
    }, 120000);

    it('charges for a past lesson nobody marked taught — it happened (#157)', async () => {
      await seedStudent('stu-unmarked');
      await seedTaughtLesson(
        'stu-unmarked',
        'lesson-unmarked',
        2,
        'scheduled'
      );

      const result = await chargeNow({
        studentId: 'stu-unmarked',
        lessonIds: ['lesson-unmarked'],
      });

      expect(result.status).toBe(200);
      expect(result.data?.charge.lessonIds).toEqual(['lesson-unmarked']);
    }, 120000);

    it('refuses a past lesson that was cancelled', async () => {
      await seedStudent('stu-called-off');
      await seedTaughtLesson(
        'stu-called-off',
        'lesson-called-off',
        2,
        'cancelled'
      );

      const result = await chargeNow({
        studentId: 'stu-called-off',
        lessonIds: ['lesson-called-off'],
      });

      expect(result.status).toBe(400);
    }, 120000);

    it('will not charge the card for a past lesson a live invoice already asks for', async () => {
      await seedStudent('stu-owed-invoiced');
      await seedTaughtLesson('stu-owed-invoiced', 'lesson-owed-inv', 2);
      await setFirestoreDoc('invoices', 'inv-owed', {
        studentId: 'stu-owed-invoiced',
        status: 'sent',
        lineItems: [
          {
            id: 'line-1',
            description: '30-min lesson',
            lessonId: 'lesson-owed-inv',
            quantity: 1,
            unitAmountCents: RATE_CENTS,
            subtotalCents: RATE_CENTS,
          },
        ],
        totalCents: RATE_CENTS,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await chargeNow({
        studentId: 'stu-owed-invoiced',
        lessonIds: ['lesson-owed-inv'],
      });

      expect(result.status).toBe(400);
    }, 120000);
  });
});
