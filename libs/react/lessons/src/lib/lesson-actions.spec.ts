import { describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@maple/ts/domain';
import { lessonActions, type LessonActionHandlers } from './lesson-actions';

const NOW = new Date('2026-11-10T15:00:00Z');

const lesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: 'lesson-1',
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date('2026-12-01T18:30:00Z'),
  durationMinutes: 30,
  status: 'scheduled',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const all = (): Required<LessonActionHandlers> => ({
  onMove: vi.fn(),
  onPushBack: vi.fn(),
  onCharge: vi.fn(),
  onInvoice: vi.fn(),
  onCancel: vi.fn(),
  onRestore: vi.fn(),
  onReschedule: vi.fn(),
  onWeather: vi.fn(),
  onInPerson: vi.fn(),
  onDelete: vi.fn(),
});

const base = { billed: false, isHope: false, hasCard: true, now: NOW };
const texts = (l: Lesson, ctx = base) =>
  lessonActions(l, ctx, all()).map((a) => a.text);

describe('lessonActions', () => {
  it('lets a paid upcoming lesson be moved or pushed back', () => {
    expect(texts(lesson(), { ...base, billed: true })).toEqual([
      'Move…',
      'Push back a week…',
      'Cancel…',
      'Weather…',
      'Delete',
    ]);
  });

  it('settles an unbilled past lesson, and does not push it back', () => {
    const past = lesson({ scheduledAt: new Date('2026-11-03T18:30:00Z') });
    expect(texts(past)).toEqual([
      'Move…',
      'Charge the card',
      'Send an invoice',
      'Cancel…',
      'Weather…',
      'Delete',
    ]);
    expect(texts(past, { ...base, hasCard: false })).not.toContain(
      'Charge the card',
    );
    expect(texts(past, { ...base, billed: true })).not.toContain(
      'Send an invoice',
    );
    expect(texts(past, { ...base, isHope: true })).not.toContain(
      'Send an invoice',
    );
  });

  it('offers In person, not Weather, for a lesson held online', () => {
    const online = texts(lesson({ virtual: true }));
    expect(online).toContain('In person');
    expect(online).not.toContain('Weather…');
  });

  it('offers a cancelled lesson only undo, credit or delete', () => {
    const cancelled = lesson({ status: 'cancelled' });
    expect(texts(cancelled)).toEqual([
      'Reschedule with a credit…',
      'Undo cancel',
      'Delete',
    ]);
    expect(
      texts(cancelled, { ...base, replaced: true } as typeof base),
    ).toEqual(['Delete']);
  });

  it('hides an action whose handler is left out', () => {
    const items = lessonActions(lesson(), base, { onDelete: vi.fn() });
    expect(items.map((a) => a.text)).toEqual(['Delete']);
  });

  it('runs the handler with the lesson', () => {
    const handlers = all();
    const l = lesson();
    lessonActions(l, base, handlers)[0].run();
    expect(handlers.onMove).toHaveBeenCalledWith(l);
  });
});
