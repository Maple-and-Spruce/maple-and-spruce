import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

/**
 * Tests for the onMusicTogetherDemoWrite Firestore trigger.
 *
 * Verifies that MT demo create/update/delete reconciles ONE CalendarEvent —
 * type `musictogether`, stable id `mt-demo-{demoId}`, duration from the demo
 * (falling back to the 45-min MT default), free-text location verbatim — and
 * that the event exists only while the demo is `visible`.
 */

const mocks = vi.hoisted(() => ({
  findAllBySourceRef: vi.fn(),
  upsertWithId: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: {
    findAllBySourceRef: mocks.findAllBySourceRef,
    upsertWithId: mocks.upsertWithId,
    delete: mocks.delete,
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

import { onMusicTogetherDemoWrite } from './on-music-together-demo-write';

const handler = onMusicTogetherDemoWrite as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>,
  id = 'demo-1'
) {
  return { exists, id, data: () => (exists ? data : undefined) };
}

function ts(date: Date) {
  return { toDate: () => date };
}

const demoDate = new Date('2030-08-03T14:00:00Z');

const visibleDemo = {
  dateTime: ts(demoDate),
  location: 'Morgantown Public Library',
  capacityFamilies: 8,
  durationMinutes: 30,
  notes: 'Bring a shaker!',
  visible: true,
  createdAt: ts(new Date('2030-01-01')),
};

const eventId = 'mt-demo-demo-1';

function makeCalendarEvent(): CalendarEvent {
  return {
    id: eventId,
    title: 'Music Together Demo (Free)',
    description: 'Bring a shaker!',
    startDateTime: demoDate,
    endDateTime: new Date(demoDate.getTime() + 30 * 60 * 1000),
    recurrenceRule: null,
    location: 'Morgantown Public Library',
    type: 'musictogether',
    public: true,
    room: null,
    sourceRef: 'musicTogetherDemos/demo-1',
    createdBy: 'system',
    createdAt: new Date('2030-01-01'),
    updatedAt: new Date('2030-01-01'),
  };
}

describe('onMusicTogetherDemoWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllBySourceRef.mockResolvedValue([]);
    mocks.upsertWithId.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  it('upserts one musictogether event for a visible demo', async () => {
    await handler({
      params: { demoId: 'demo-1' },
      data: { before: makeSnapshot(false), after: makeSnapshot(true, visibleDemo) },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledTimes(1);
    const [id, input] = mocks.upsertWithId.mock.calls[0];
    expect(id).toBe(eventId);
    expect(input.type).toBe('musictogether');
    expect(input.public).toBe(true);
    expect(input.title).toBe('Music Together Demo (Free)');
    expect(input.location).toBe('Morgantown Public Library');
    expect(input.sourceRef).toBe('musicTogetherDemos/demo-1');
    expect(input.startDateTime).toEqual(demoDate);
    // Uses the demo's own 30-min duration.
    expect(input.endDateTime).toEqual(
      new Date(demoDate.getTime() + 30 * 60 * 1000)
    );
    expect(input.room).toBeNull();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('falls back to the 45-min MT default when durationMinutes is unset', async () => {
    const noDuration: Record<string, unknown> = { ...visibleDemo };
    delete noDuration.durationMinutes;
    await handler({
      params: { demoId: 'demo-1' },
      data: { before: makeSnapshot(false), after: makeSnapshot(true, noDuration) },
    });
    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.endDateTime).toEqual(
      new Date(demoDate.getTime() + 45 * 60 * 1000)
    );
  });

  it('does not create an event for a hidden demo', async () => {
    await handler({
      params: { demoId: 'demo-1' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, { ...visibleDemo, visible: false }),
      },
    });
    expect(mocks.upsertWithId).not.toHaveBeenCalled();
  });

  it('removes the event when a demo becomes hidden', async () => {
    mocks.findAllBySourceRef.mockResolvedValue([makeCalendarEvent()]);
    await handler({
      params: { demoId: 'demo-1' },
      data: {
        before: makeSnapshot(true, visibleDemo),
        after: makeSnapshot(true, { ...visibleDemo, visible: false }),
      },
    });
    expect(mocks.upsertWithId).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith(eventId);
  });

  it('deletes the event when a demo is deleted', async () => {
    mocks.findAllBySourceRef.mockResolvedValue([makeCalendarEvent()]);
    await handler({
      params: { demoId: 'demo-1' },
      data: { before: makeSnapshot(true, visibleDemo), after: makeSnapshot(false) },
    });
    expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
      'musicTogetherDemos/demo-1'
    );
    expect(mocks.delete).toHaveBeenCalledWith(eventId);
  });

  it('parses an ISO-string dateTime (emulator REST format)', async () => {
    const iso = '2030-10-08T14:00:00.000Z';
    await handler({
      params: { demoId: 'demo-1' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, { ...visibleDemo, dateTime: iso }),
      },
    });
    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.startDateTime).toEqual(new Date(iso));
  });
});
