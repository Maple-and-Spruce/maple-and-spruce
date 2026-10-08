/**
 * The point of these tests is the guard, not the write.
 *
 * Hope pays only for services rendered. If a no-show ever reaches a submission
 * the studio has claimed public money for a lesson nobody attended, so the
 * check lives on the server and is proven here rather than trusted to whatever
 * the UI happens to send.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findProducts: vi.fn(async () => [] as unknown[]),
  findTaught: vi.fn(),
  findClaims: vi.fn(),
  findOrders: vi.fn(),
  findLesson: vi.fn(),
  findStudent: vi.fn(),
  findSubmission: vi.fn(),
  record: vi.fn(),
}));

// Unwrap the fluent builder so the spec drives the handler directly, the same
// way the other function specs in this repo do.
vi.mock('@maple/firebase/functions', () => {
  const builder = {
    requiringRole: () => builder,
    usingSecrets: () => builder,
    usingStrings: () => builder,
    withOptions: () => builder,
    handle: <TReq, TRes>(handler: (d: TReq, c: unknown) => Promise<TRes>) =>
      handler,
  };
  return {
    Functions: { endpoint: builder },
    Role: { Admin: 'admin' },
    throwInvalidArgument: (message: string) => {
      throw new Error(`invalid-argument: ${message}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: { findById: mocks.findLesson, findAll: mocks.findTaught },
  HopeOrderRepository: { findAll: mocks.findOrders },
  StudentRepository: { findById: mocks.findStudent },
  HopeProductRepository: { findAll: mocks.findProducts },
  HopeSubmissionRepository: {
    findById: mocks.findSubmission,
    findByLessonIds: mocks.findClaims,
    record: mocks.record,
  },
}));

import { recordHopeSubmissions } from './record-hope-submissions';

type Handler = (
  data: unknown,
  context?: unknown
) => Promise<{
  recordedLessonIds: string[];
  skipped: Array<{ lessonId: string; reason: string }>;
}>;

const handler = recordHopeSubmissions as unknown as Handler;

const renderedLesson = {
  id: 'lesson-1',
  studentId: 'student-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date('2026-08-01T15:00:00Z'),
  durationMinutes: 30,
  status: 'rendered',
};

const hopeStudent = {
  id: 'student-1',
  name: 'Rowan',
  isHopeScholarship: true,
  registeredLessonLength: '30-min-full',
  hopeProductId: 'prod-1',
};

// The student's EMA product. Prices come only from data like this, edited on
// the Hope Billing page, never from a table in code.
const violin30 = {
  id: 'prod-1',
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3250,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLesson.mockResolvedValue(renderedLesson);
  mocks.findTaught.mockResolvedValue([renderedLesson]);
  mocks.findClaims.mockResolvedValue(new Map());
  // One order with room, priced like the old 30-min-full tier, so the
  // pre-order tests still read as they did.
  mocks.findOrders.mockResolvedValue([
    {
      id: 'order-1',
      studentId: 'student-1',
      productId: 'prod-1',
      priceCents: 4125,
      lessonCount: 4,
      orderedOn: new Date('2026-07-01T00:00:00Z'),
    },
  ]);
  mocks.findStudent.mockResolvedValue(hopeStudent);
  mocks.findProducts.mockResolvedValue([violin30]);
  mocks.findSubmission.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
});

describe('recordHopeSubmissions', () => {
  it("records a claim for a rendered Hope lesson at its order's price", async () => {
    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual(['lesson-1']);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    const [payload] = mocks.record.mock.calls[0];
    expect(payload).toMatchObject({
      lessonId: 'lesson-1',
      status: 'submitted',
      rateCents: 4125, // order-1's price
      recordedByUid: 'admin-1',
    });
  });

  it('refuses to invoice a lesson no EMA order has room for', async () => {
    mocks.findOrders.mockResolvedValue([]);

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/Record the family’s order first/);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('stamps the order and its price on the invoice', async () => {
    mocks.findOrders.mockResolvedValue([
      {
        id: 'order-9',
        studentId: 'student-1',
        productId: 'prod-guitar-30',
        priceCents: 3250,
        lessonCount: 8,
        orderedOn: new Date('2026-07-01T00:00:00Z'),
      },
    ]);

    await handler({ lessonIds: ['lesson-1'], status: 'submitted' }, { uid: 'admin-1' });

    const [payload] = mocks.record.mock.calls[0];
    expect(payload).toMatchObject({ orderId: 'order-9', rateCents: 3250 });
  });

  it("claims at the student's EMA product price, not the old length table", async () => {
    // Marking paid does not need an order; the rate falls back to the product.
    mocks.findOrders.mockResolvedValue([]);
    // A 30-minute guitar lesson: the length table said $41.25, EMA pays $30.
    mocks.findStudent.mockResolvedValue({
      ...hopeStudent,
      hopeProductId: 'prod-guitar-30',
    });
    mocks.findProducts.mockResolvedValue([
      {
        id: 'prod-guitar-30',
        emaProductId: '137571',
        name: 'Guitar 30 minutes',
        priceCents: 3000,
        active: true,
      },
    ]);

    await handler({ lessonIds: ['lesson-1'], status: 'paid' }, { uid: 'admin-1' });

    const [payload] = mocks.record.mock.calls[0];
    expect(payload.rateCents).toBe(3000);
  });

  describe('a student on no EMA product (#83)', () => {
    beforeEach(() => {
      mocks.findStudent.mockResolvedValue({
        ...hopeStudent,
        hopeProductId: undefined,
      });
    });

    it('skips the claim rather than stamping a guessed price', async () => {
      // Marking paid with no order and no product: nothing prices the lesson.
      // Before, the length table stamped $41.25 here.
      mocks.findOrders.mockResolvedValue([]);

      const result = await handler(
        { lessonIds: ['lesson-1'], status: 'paid' },
        { uid: 'admin-1' }
      );

      expect(mocks.record).not.toHaveBeenCalled();
      expect(result.recordedLessonIds).toEqual([]);
      expect(result.skipped).toEqual([
        {
          lessonId: 'lesson-1',
          reason:
            'This lesson has no price. Put the student on an EMA product first.',
        },
      ]);
    });

    it('treats a product id that no longer resolves as no product', async () => {
      mocks.findOrders.mockResolvedValue([]);
      mocks.findStudent.mockResolvedValue({
        ...hopeStudent,
        hopeProductId: 'deleted-product',
      });

      const result = await handler(
        { lessonIds: ['lesson-1'], status: 'rejected' },
        { uid: 'admin-1' }
      );

      expect(mocks.record).not.toHaveBeenCalled();
      expect(result.skipped[0].reason).toMatch(/EMA product first/);
    });

    it('still invoices against an order, which carries its own price', async () => {
      const result = await handler(
        { lessonIds: ['lesson-1'], status: 'submitted' },
        { uid: 'admin-1' }
      );

      expect(result.recordedLessonIds).toEqual(['lesson-1']);
      expect(mocks.record.mock.calls[0][0].rateCents).toBe(4125);
    });

    it('still updates an existing claim at the rate it was stamped at', async () => {
      mocks.findOrders.mockResolvedValue([]);
      mocks.findSubmission.mockResolvedValue({
        lessonId: 'lesson-1',
        rateCents: 3250,
        submittedAt: new Date('2026-08-05T00:00:00Z'),
        status: 'submitted',
      });

      const result = await handler(
        { lessonIds: ['lesson-1'], status: 'paid' },
        { uid: 'admin-1' }
      );

      expect(result.recordedLessonIds).toEqual(['lesson-1']);
      expect(mocks.record.mock.calls[0][0].rateCents).toBe(3250);
    });

    it('skips only the unpriced lessons in a batch', async () => {
      mocks.findOrders.mockResolvedValue([]);
      mocks.findLesson.mockImplementation(async (id: string) => ({
        ...renderedLesson,
        id,
        studentId: id === 'lesson-priced' ? 'student-2' : 'student-1',
      }));
      mocks.findStudent.mockImplementation(async (id: string) =>
        id === 'student-2'
          ? { ...hopeStudent, id }
          : { ...hopeStudent, hopeProductId: undefined }
      );

      const result = await handler(
        { lessonIds: ['lesson-priced', 'lesson-unpriced'], status: 'paid' },
        { uid: 'admin-1' }
      );

      expect(result.recordedLessonIds).toEqual(['lesson-priced']);
      expect(result.skipped.map((s) => s.lessonId)).toEqual(['lesson-unpriced']);
      expect(mocks.record.mock.calls[0][0].rateCents).toBe(3250);
    });
  });

  it('refuses to claim a no-show — Hope pays only for services rendered', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'no-show',
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.recordedLessonIds).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/rendered/i);
  });

  it('claims a past lesson nobody marked taught — it happened (#157)', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'scheduled',
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'paid' },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual(['lesson-1']);
  });

  it('refuses to claim a lesson still to come', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 7 * 86_400_000),
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'paid' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toMatch(/still to come/);
  });

  it('refuses to claim a cancelled lesson', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'cancelled',
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(1);
  });

  it('refuses to claim for a student who is not on Hope', async () => {
    mocks.findStudent.mockResolvedValue({
      ...hopeStudent,
      isHopeScholarship: false,
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toMatch(/not on the hope/i);
  });

  it('skips a bad lesson without losing the rest of the batch', async () => {
    // Katie submits a term at a time. One stale id must not cost her the
    // other thirty-nine claims.
    mocks.findLesson.mockImplementation(async (id: string) =>
      id === 'lesson-bad' ? undefined : { ...renderedLesson, id }
    );

    const result = await handler(
      {
        lessonIds: ['lesson-1', 'lesson-bad', 'lesson-2'],
        status: 'submitted',
      },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual(['lesson-1', 'lesson-2']);
    expect(result.skipped).toEqual([
      { lessonId: 'lesson-bad', reason: 'Lesson not found' },
    ]);
  });

  it('keeps the originally claimed rate when marking a claim paid', async () => {
    // A rate change must not retroactively restate what EMA was actually told.
    mocks.findSubmission.mockResolvedValue({
      lessonId: 'lesson-1',
      rateCents: 3250,
      submittedAt: new Date('2026-08-05T00:00:00Z'),
      status: 'submitted',
    });

    await handler(
      { lessonIds: ['lesson-1'], status: 'paid' },
      { uid: 'admin-1' }
    );

    const [payload] = mocks.record.mock.calls[0];
    expect(payload.rateCents).toBe(3250);
    expect(payload.status).toBe('paid');
    expect(payload.paidAt).toBeInstanceOf(Date);
  });

  it('records why EMA rejected a claim, so a resubmission can fix it', async () => {
    await handler(
      {
        lessonIds: ['lesson-1'],
        status: 'rejected',
        rejectionReason: 'Provider not yet approved for guitar',
      },
      { uid: 'admin-1' }
    );

    const [payload] = mocks.record.mock.calls[0];
    expect(payload.status).toBe('rejected');
    expect(payload.rejectionReason).toBe(
      'Provider not yet approved for guitar'
    );
  });
});
