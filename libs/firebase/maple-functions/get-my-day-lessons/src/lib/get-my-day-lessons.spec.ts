import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  instructorIdForUser: vi.fn(),
  getBusinessConfig: vi.fn(),
  findLessons: vi.fn(),
  findStudent: vi.fn(),
  findInvoices: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  instructorIdForUser: mocks.instructorIdForUser,
}));

vi.mock('@maple/firebase/database', () => ({
  BusinessPaymentConfigRepository: { get: mocks.getBusinessConfig },
  LessonRepository: { findAll: mocks.findLessons },
  StudentRepository: { findById: mocks.findStudent },
  InvoiceRepository: { findAll: mocks.findInvoices },
}));

import { getMyDayLessons } from './get-my-day-lessons';

type Handler = (data: unknown, ctx?: unknown) => Promise<{
  lessons: Array<{ studentName: string; invoice?: { id: string; source?: string } }>;
  venmoHandle?: string;
  unlinked: boolean;
}>;
const handler = getMyDayLessons as unknown as Handler;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBusinessConfig.mockResolvedValue({ venmoHandle: 'maple-spruce' });
  mocks.instructorIdForUser.mockResolvedValue('instr-nathan');
  mocks.findLessons.mockResolvedValue([
    {
      id: 'les-1',
      studentId: 'stu-1',
      teacherId: 'instr-nathan',
      scheduledAt: new Date('2026-07-20T15:00:00'),
      durationMinutes: 30,
      status: 'scheduled',
    },
  ]);
  mocks.findStudent.mockResolvedValue({ id: 'stu-1', name: 'Juniper' });
  mocks.findInvoices.mockResolvedValue([]);
});

describe('getMyDayLessons', () => {
  it('returns unlinked with no lessons when the caller has no instructor', async () => {
    mocks.instructorIdForUser.mockResolvedValue(undefined);
    const res = await handler({}, { uid: 'admin-uid' });
    expect(res.unlinked).toBe(true);
    expect(res.lessons).toEqual([]);
    expect(res.venmoHandle).toBe('maple-spruce');
    expect(mocks.findLessons).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's own instructor id", async () => {
    await handler(
      { from: '2026-07-20T00:00:00', to: '2026-07-20T23:59:59' },
      { uid: 'nathan-uid' }
    );
    expect(mocks.findLessons).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: 'instr-nathan' })
    );
  });

  it('enriches each lesson with the student name and its invoice', async () => {
    mocks.findInvoices.mockResolvedValue([
      {
        id: 'inv-1',
        status: 'paid',
        totalCents: 4000,
        paymentRecord: { source: 'venmo-manual' },
        lineItems: [{ id: 'l1', lessonId: 'les-1' }],
      },
    ]);
    const res = await handler({}, { uid: 'nathan-uid' });
    expect(res.lessons).toHaveLength(1);
    expect(res.lessons[0].studentName).toBe('Juniper');
    expect(res.lessons[0].invoice).toMatchObject({
      id: 'inv-1',
      source: 'venmo-manual',
    });
  });

  it('leaves invoice undefined when no non-void invoice references the lesson', async () => {
    mocks.findInvoices.mockResolvedValue([
      { id: 'inv-void', status: 'void', lineItems: [{ lessonId: 'les-1' }] },
    ]);
    const res = await handler({}, { uid: 'nathan-uid' });
    expect(res.lessons[0].invoice).toBeUndefined();
  });
});
