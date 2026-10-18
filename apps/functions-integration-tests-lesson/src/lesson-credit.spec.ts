/**
 * Cancel a lesson and reschedule it with a credit (#209), against real
 * Firestore.
 *
 * The contract Katie relies on: the family's payment for the cancelled lesson
 * now pays for the replacement, and nothing else about the money changes — the
 * charge keeps its amount, status and idempotency key; the invoice keeps its
 * status and total. The unit tests cover the decisions; these cover that the
 * documents really end up that way, and that a retry books nothing twice.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateLessonRequest,
  CreateLessonResponse,
  CreateStudentRequest,
  CreateStudentResponse,
  UpdateLessonRequest,
  UpdateLessonResponse,
  RescheduleLessonWithCreditRequest,
  RescheduleLessonWithCreditResponse,
} from '@maple/ts/firebase/api-types';

const TEACHER_ID = 'instructor-credit-teacher';

async function seedAllDayBlocks(teacherId: string): Promise<void> {
  for (let dow = 0; dow < 7; dow++) {
    await setFirestoreDoc('lessonBlocks', `blk-${teacherId}-${dow}`, {
      teacherId,
      dayOfWeek: dow,
      startMinutes: 0,
      endMinutes: 1440,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

function etWeekday(d: Date): number {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/New_York',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

/** The fields these tests read back, decoded from the emulator. */
interface StoredDoc {
  status?: string;
  cancelledFor?: string | null;
  virtual?: boolean;
  room?: string | null;
  creditForLessonId?: string;
  lessonIds?: string[];
  amountCents?: number;
  idempotencyKey?: string;
  totalCents?: number;
  lineItems?: Array<{ lessonId?: string }>;
}

async function readDoc(collection: string, id: string): Promise<StoredDoc | null> {
  return (await getFirestoreDoc(collection, id)) as StoredDoc | null;
}

const blockFor = (d: Date) => `blk-${TEACHER_ID}-${etWeekday(d)}`;

describe('Reschedule a lesson with credit (#209)', () => {
  let admin: TestUser;
  let studentId: string;
  /** Each test takes its own hour, so rooms never collide across tests. */
  let hour = 14;

  async function bookLesson(): Promise<string> {
    const at = new Date(Date.UTC(2027, 2, 2, hour++, 0));
    const result = await callFunction<CreateLessonRequest, CreateLessonResponse>({
      functionName: 'lessons/createLesson',
      data: {
        studentId,
        teacherId: TEACHER_ID,
        scheduledAt: at,
        durationMinutes: 30,
        status: 'scheduled',
        blockId: blockFor(at),
      },
      idToken: admin.idToken,
    });
    expect(result.status).toBe(200);
    return result.data!.lesson.id;
  }

  function reschedule(lessonId: string, reason?: 'weather') {
    const at = new Date(Date.UTC(2027, 2, 9, hour++, 0));
    return callFunction<
      RescheduleLessonWithCreditRequest,
      RescheduleLessonWithCreditResponse
    >({
      functionName: 'lessons/rescheduleLessonWithCredit',
      data: {
        lessonId,
        scheduledAt: at,
        blockStrategy: { mode: 'existing', blockId: blockFor(at) },
        reason,
      },
      idToken: admin.idToken,
    });
  }

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
    await seedAllDayBlocks(TEACHER_ID);
    const student = await callFunction<CreateStudentRequest, CreateStudentResponse>({
      functionName: 'people/createStudent',
      data: {
        name: 'Test Student',
        instrument: 'violin',
        isAdultStudent: false,
        primaryTeacherId: TEACHER_ID,
        isHopeScholarship: false,
        primaryContactName: 'Robin Ashfield',
        primaryContactEmail: 'robin@example.com',
        status: 'active',
      },
      idToken: admin.idToken,
    });
    studentId = student.data!.student.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('cancels the lesson and books a replacement that names it', async () => {
    const lessonId = await bookLesson();

    const result = await reschedule(lessonId);

    expect(result.status).toBe(200);
    expect(result.data?.coverage).toBe('none');
    expect(result.data?.replacement.id).toBe(`${lessonId}-credit`);

    const original = await readDoc('lessons', lessonId);
    const replacement = await readDoc('lessons', `${lessonId}-credit`);
    expect(original?.status).toBe('cancelled');
    expect(replacement?.status).toBe('scheduled');
    expect(replacement?.creditForLessonId).toBe(lessonId);
  });

  it('moves a paid card charge onto the replacement and changes nothing else', async () => {
    const lessonId = await bookLesson();
    const chargeId = `chg-${studentId}-${lessonId}`;
    const paidAt = new Date('2027-02-25T12:00:00Z');
    await setFirestoreDoc('lessonScheduledCharges', chargeId, {
      studentId,
      ruleId: 'manual',
      source: 'manual',
      lessonIds: ['other-lesson', lessonId],
      amountCents: 8250,
      dueAt: paidAt,
      status: 'paid',
      idempotencyKey: 'lc-credit-0000001',
      squarePaymentId: 'pay-credit-1',
      resolvedAt: paidAt,
      createdAt: paidAt,
      updatedAt: paidAt,
    });

    const result = await reschedule(lessonId);

    expect(result.status).toBe(200);
    expect(result.data?.coverage).toBe('charge');
    const charge = await readDoc('lessonScheduledCharges', chargeId);
    expect(charge?.lessonIds).toEqual(['other-lesson', `${lessonId}-credit`]);
    expect(charge?.amountCents).toBe(8250);
    expect(charge?.status).toBe('paid');
    expect(charge?.idempotencyKey).toBe('lc-credit-0000001');
  });

  it('moves an invoice line onto the replacement, keeping the invoice as it was', async () => {
    const lessonId = await bookLesson();
    const invoiceId = `inv-credit-${lessonId}`;
    await setFirestoreDoc('invoices', invoiceId, {
      studentId,
      status: 'paid',
      // Already in Square, so the sync trigger has nothing to send.
      squareInvoiceId: 'sq-inv-credit-1',
      lineItems: [
        {
          id: 'line-1',
          description: 'Lesson',
          lessonId,
          quantity: 1,
          unitAmountCents: 4125,
          subtotalCents: 4125,
        },
      ],
      totalCents: 4125,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await reschedule(lessonId);

    expect(result.status).toBe(200);
    expect(result.data?.coverage).toBe('invoice');
    const invoice = await readDoc('invoices', invoiceId);
    expect(invoice?.lineItems?.[0].lessonId).toBe(`${lessonId}-credit`);
    expect(invoice?.status).toBe('paid');
    expect(invoice?.totalCents).toBe(4125);
  });

  it('a repeated request books no second replacement', async () => {
    const lessonId = await bookLesson();

    const first = await reschedule(lessonId);
    const second = await reschedule(lessonId);

    expect(second.status).toBe(200);
    expect(second.data?.replacement.id).toBe(first.data?.replacement.id);
    expect(
      new Date(second.data!.replacement.scheduledAt).getTime(),
    ).toBe(new Date(first.data!.replacement.scheduledAt).getTime());
  });

  it('refuses to credit the replacement itself', async () => {
    const lessonId = await bookLesson();
    await reschedule(lessonId);

    const again = await reschedule(`${lessonId}-credit`);

    expect(again.status).not.toBe(200);
  });

  it('a weather reschedule says so on the cancelled lesson (#210)', async () => {
    const lessonId = await bookLesson();

    const result = await reschedule(lessonId, 'weather');

    expect(result.status).toBe(200);
    expect((await readDoc('lessons', lessonId))?.cancelledFor).toBe('weather');
    expect((await readDoc('lessons', `${lessonId}-credit`))?.cancelledFor ?? null).toBeNull();
  });

  describe('held online (#210)', () => {
    const at = new Date(Date.UTC(2027, 2, 16, 15, 0));

    function book(): Promise<{ status: number; data?: CreateLessonResponse }> {
      return callFunction<CreateLessonRequest, CreateLessonResponse>({
        functionName: 'lessons/createLesson',
        data: {
          studentId,
          teacherId: TEACHER_ID,
          scheduledAt: at,
          durationMinutes: 30,
          status: 'scheduled',
          room: 'spruce',
          blockId: blockFor(at),
        },
        idToken: admin.idToken,
      });
    }

    function setVirtual(id: string, virtual: boolean) {
      return callFunction<UpdateLessonRequest, UpdateLessonResponse>({
        functionName: 'lessons/updateLesson',
        data: { id, virtual },
        idToken: admin.idToken,
      });
    }

    it('frees the room, keeps the lesson on the calendar, and takes the room back only if it is free', async () => {
      const first = await book();
      expect(first.status).toBe(200);
      const onlineId = first.data!.lesson.id;

      // The room is taken, so a second lesson at that time is refused.
      expect((await book()).status).not.toBe(200);

      expect((await setVirtual(onlineId, true)).status).toBe(200);
      // The trigger keeps the event (the teacher's week) but drops the room.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const event = await readDoc('calendarEvents', `lesson-${onlineId}`);
      expect(event).not.toBeNull();
      expect(event?.room ?? null).toBeNull();
      expect((await readDoc('lessons', onlineId))?.virtual).toBe(true);

      // Now the room is free for someone else...
      const second = await book();
      expect(second.status).toBe(200);

      // ...so the online lesson cannot come back into it.
      expect((await setVirtual(onlineId, false)).status).not.toBe(200);
    });
  });
});
