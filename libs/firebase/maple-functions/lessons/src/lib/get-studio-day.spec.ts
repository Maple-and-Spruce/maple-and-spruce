import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLessons: vi.fn(),
  findStudent: vi.fn(),
  findInstructor: vi.fn(),
  findCharges: vi.fn(),
  findInvoices: vi.fn(),
  getInstruments: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: { findAll: mocks.findLessons },
  StudentRepository: { findById: mocks.findStudent },
  InstructorRepository: { findById: mocks.findInstructor },
  LessonScheduledChargeRepository: { findAll: mocks.findCharges },
  InvoiceRepository: { findAll: mocks.findInvoices },
  InstrumentsConfigRepository: { get: mocks.getInstruments },
}));

import { getStudioDay, shopDayBounds } from './get-studio-day';

function lesson(
  id: string,
  studentId: string,
  teacherId: string,
  iso: string,
  status = 'scheduled',
) {
  return {
    id,
    studentId,
    teacherId,
    scheduledAt: new Date(iso),
    durationMinutes: 30,
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLessons.mockResolvedValue([
    lesson('les-b', 'stu-2', 'instr-b', '2026-10-14T21:00:00Z'),
    lesson('les-a', 'stu-1', 'instr-a', '2026-10-14T19:00:00Z'),
    lesson('les-c', 'stu-1', 'instr-a', '2026-10-14T22:00:00Z', 'cancelled'),
    lesson('les-d', 'stu-1', 'instr-a', '2026-10-14T23:00:00Z'),
  ]);
  mocks.findStudent.mockImplementation(async (id: string) =>
    id === 'stu-1'
      ? { id, name: 'Olive Thompson', instrument: 'violin' }
      : { id, name: 'Robin Ashfield', instrument: 'mountain-dulcimer' },
  );
  mocks.findInstructor.mockImplementation(async (id: string) => ({
    id,
    name: id === 'instr-a' ? 'Ada Teacher' : 'Ben Teacher',
  }));
  mocks.findCharges.mockImplementation(async ({ studentId }) =>
    studentId === 'stu-1'
      ? [
          {
            status: 'scheduled',
            lessonIds: ['les-a'],
            dueAt: new Date('2026-10-16T14:00:00Z'),
          },
        ]
      : [],
  );
  mocks.findInvoices.mockImplementation(async ({ studentId }) =>
    studentId === 'stu-2'
      ? [{ status: 'paid', lineItems: [{ id: 'x', lessonId: 'les-b' }] }]
      : [],
  );
  mocks.getInstruments.mockResolvedValue({
    instruments: [{ key: 'violin', label: 'Violin' }],
  });
});

describe('getStudioDay', () => {
  it('queries every teacher in the requested window', async () => {
    await getStudioDay({
      from: '2026-10-14T04:00:00.000Z',
      to: '2026-10-15T03:59:59.999Z',
    });
    expect(mocks.findLessons).toHaveBeenCalledWith({
      from: new Date('2026-10-14T04:00:00.000Z'),
      to: new Date('2026-10-15T03:59:59.999Z'),
    });
    const filters = mocks.findLessons.mock.calls[0][0];
    expect(filters).not.toHaveProperty('teacherId');
  });

  it('defaults to today in the shop timezone', async () => {
    await getStudioDay({});
    const { from, to } = mocks.findLessons.mock.calls[0][0];
    expect(to.getTime() - from.getTime()).toBeGreaterThan(22 * 3600_000);
    expect(to.getTime() - from.getTime()).toBeLessThan(26 * 3600_000);
  });

  it('drops cancelled lessons and sorts by start time', async () => {
    const res = await getStudioDay({});
    expect(res.lessons.map((l) => l.lesson.id)).toEqual([
      'les-a',
      'les-b',
      'les-d',
    ]);
  });

  it('enriches each lesson with names, instrument and payment', async () => {
    const res = await getStudioDay({});
    const [a, b, d] = res.lessons;
    expect(a).toMatchObject({
      studentName: 'Olive Thompson',
      teacherName: 'Ada Teacher',
      instrument: 'Violin',
      payment: { state: 'scheduled', dueAt: '2026-10-16T14:00:00.000Z' },
    });
    expect(b).toMatchObject({
      studentName: 'Robin Ashfield',
      teacherName: 'Ben Teacher',
      instrument: 'Mountain dulcimer',
      payment: { state: 'paid' },
    });
    expect(b.payment).not.toHaveProperty('dueAt');
    expect(d.payment).toEqual({ state: 'unbilled' });
  });

  it('looks each student and teacher up once', async () => {
    await getStudioDay({});
    expect(mocks.findStudent).toHaveBeenCalledTimes(2);
    expect(mocks.findInstructor).toHaveBeenCalledTimes(2);
    expect(mocks.findCharges).toHaveBeenCalledTimes(2);
    expect(mocks.findInvoices).toHaveBeenCalledTimes(2);
  });

  it('falls back to placeholder names for missing records', async () => {
    mocks.findStudent.mockResolvedValue(undefined);
    mocks.findInstructor.mockResolvedValue(undefined);
    const res = await getStudioDay({});
    expect(res.lessons[0]).toMatchObject({
      studentName: 'Unknown student',
      teacherName: 'Unknown teacher',
    });
    expect(res.lessons[0].instrument).toBeUndefined();
  });

  it('skips the lookups on an empty day', async () => {
    mocks.findLessons.mockResolvedValue([]);
    const res = await getStudioDay({});
    expect(res).toEqual({ lessons: [] });
    expect(mocks.findStudent).not.toHaveBeenCalled();
    expect(mocks.getInstruments).not.toHaveBeenCalled();
  });
});

describe('shopDayBounds', () => {
  it('spans an Eastern day in summer (EDT)', () => {
    const { from, to } = shopDayBounds(new Date('2026-07-20T15:00:00Z'));
    expect(from.toISOString()).toBe('2026-07-20T04:00:00.000Z');
    expect(to.toISOString()).toBe('2026-07-21T03:59:59.999Z');
  });

  it('spans an Eastern day in winter (EST), late in the UTC day', () => {
    // 02:30Z on Dec 1 is still Nov 30 in New York.
    const { from, to } = shopDayBounds(new Date('2026-12-01T02:30:00Z'));
    expect(from.toISOString()).toBe('2026-11-30T05:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-01T04:59:59.999Z');
  });
});
