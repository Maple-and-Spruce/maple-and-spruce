import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `collectNeedsAttention` is shared by `getNeedsAttention` and the Home
 * inbox (#235). The classifiers have their own spec in the domain library;
 * this pins the scoping, the dated rows the inbox ages by, and what the scan
 * hands back for reuse. All people are invented.
 */
const mocks = vi.hoisted(() => ({
  students: vi.fn(),
  lessons: vi.fn(),
  blocks: vi.fn(),
  invoices: vi.fn(),
  charges: vi.fn(),
  hope: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      requiringRole: () => ({ handle: (h: unknown) => h }),
    },
  },
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  instructorIdForUser: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findAll: mocks.students },
  LessonRepository: { findAll: mocks.lessons },
  LessonBlockRepository: { findAll: mocks.blocks },
  InvoiceRepository: { findAll: mocks.invoices },
  LessonScheduledChargeRepository: { findAll: mocks.charges },
  HopeSubmissionRepository: { findByLessonIds: mocks.hope },
}));

import { collectNeedsAttention } from './get-needs-attention';

const NOW = new Date('2026-10-14T19:00:00Z');
const taught = new Date('2026-10-10T19:00:00Z');
const sent = new Date('2026-09-01T12:00:00Z');
const failedSync = new Date('2026-10-13T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.students.mockResolvedValue([
    { id: 'stu-1', name: 'Robin Ashfield', primaryTeacherId: 'instr-a' },
    { id: 'stu-2', name: 'Olive Thompson', primaryTeacherId: 'instr-b', isHopeScholarship: true },
  ]);
  mocks.lessons.mockResolvedValue([
    { id: 'les-1', studentId: 'stu-1', teacherId: 'instr-a', status: 'rendered', scheduledAt: taught },
    { id: 'les-2', studentId: 'stu-2', teacherId: 'instr-b', status: 'rendered', scheduledAt: taught },
  ]);
  mocks.blocks.mockResolvedValue([]);
  mocks.invoices.mockResolvedValue([
    {
      id: 'inv-1',
      studentId: 'stu-1',
      status: 'sent',
      issuedAt: sent,
      totalCents: 13000,
      lineItems: [],
      updatedAt: sent,
    },
    {
      id: 'inv-2',
      studentId: 'stu-1',
      status: 'draft',
      squareSyncError: 'Square said no',
      totalCents: 3500,
      lineItems: [],
      updatedAt: failedSync,
    },
  ]);
  mocks.charges.mockResolvedValue([
    { id: 'chg-1', studentId: 'stu-1', status: 'failed', lessonIds: [], dueAt: NOW, updatedAt: NOW },
  ]);
  mocks.hope.mockResolvedValue(new Map());
});

describe('collectNeedsAttention', () => {
  it('dates every row so the inbox can age and key it', async () => {
    const { groups } = await collectNeedsAttention(undefined, NOW);
    const occurred = Object.fromEntries(
      groups.flatMap((g) => g.rows.map((r) => [`${r.kind}:${r.id}`, r.occurredAt]))
    );
    expect(occurred).toEqual({
      'invoice-sync-failed:inv-2': failedSync.toISOString(),
      'lesson-unbilled:les-1': taught.toISOString(),
      'hope-unsubmitted:les-2': taught.toISOString(),
      'invoice-overdue:inv-1': sent.toISOString(),
    });
  });

  it('hands back the studio it read, for the inbox to reuse', async () => {
    const scan = await collectNeedsAttention(undefined, NOW);
    expect(scan.students.map((s) => s.id)).toEqual(['stu-1', 'stu-2']);
    expect(scan.lessons).toHaveLength(2);
    expect(scan.charges.map((c) => c.id)).toEqual(['chg-1']);
  });

  it('narrows to a lesson teacher’s own students and lessons', async () => {
    const scan = await collectNeedsAttention('instr-b', NOW);
    expect(scan.students.map((s) => s.id)).toEqual(['stu-2']);
    expect(scan.charges).toEqual([]);
    expect(scan.groups.map((g) => g.kind)).toEqual(['hope-unsubmitted']);
  });
});
