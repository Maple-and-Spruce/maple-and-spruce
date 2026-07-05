import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

/**
 * Tests for the onMusicTogetherSectionWrite Firestore trigger.
 *
 * Verifies that MT section create/update/delete reconciles CalendarEvents —
 * one per session, type `musictogether`, 45-minute duration — using
 * deterministic IDs of the form `mt-{sectionId}-{timestampMs}`, and that
 * events exist only while the section is live (status `open` or `closed`).
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

import { onMusicTogetherSectionWrite } from './on-music-together-section-write';

const handler = onMusicTogetherSectionWrite as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>,
  id = 'sec-1'
) {
  return { exists, id, data: () => (exists ? data : undefined) };
}

function ts(date: Date) {
  return { toDate: () => date };
}

const sessionDates = [
  new Date('2030-09-10T14:00:00Z'),
  new Date('2030-09-17T14:00:00Z'),
  new Date('2030-09-24T14:00:00Z'),
];

const openSection = {
  name: 'Thursday Morning — Mixed Age (0–5)',
  description: 'Fall 2026',
  sessions: sessionDates.map((d) => ({ dateTime: ts(d) })),
  status: 'open',
  location: 'Spruce Room',
  room: 'spruce',
  capacityFamilies: 8,
  priceFullCents: 25200,
  createdAt: ts(new Date('2026-01-01')),
  updatedAt: ts(new Date('2026-01-01')),
};

function eventId(sectionId: string, date: Date): string {
  return `mt-${sectionId}-${date.getTime()}`;
}

function makeCalendarEvent(sectionId: string, date: Date): CalendarEvent {
  return {
    id: eventId(sectionId, date),
    title: 'Thursday Morning — Mixed Age (0–5)',
    description: 'Fall 2026',
    startDateTime: date,
    endDateTime: new Date(date.getTime() + 45 * 60 * 1000),
    recurrenceRule: null,
    location: 'Spruce Room',
    type: 'musictogether',
    public: true,
    room: 'spruce',
    sourceRef: `musicTogetherSections/${sectionId}`,
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };
}

describe('onMusicTogetherSectionWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllBySourceRef.mockResolvedValue([]);
    mocks.upsertWithId.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  it('upserts one musictogether event per session for an open section', async () => {
    await handler({
      params: { sectionId: 'sec-1' },
      data: { before: makeSnapshot(false), after: makeSnapshot(true, openSection) },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const [id, input] = mocks.upsertWithId.mock.calls[i];
      expect(id).toBe(eventId('sec-1', sessionDates[i]));
      expect(input.type).toBe('musictogether');
      expect(input.public).toBe(true);
      expect(input.title).toBe('Thursday Morning — Mixed Age (0–5)');
      expect(input.sourceRef).toBe('musicTogetherSections/sec-1');
      expect(input.startDateTime).toEqual(sessionDates[i]);
      // 45-minute default duration
      expect(input.endDateTime).toEqual(
        new Date(sessionDates[i].getTime() + 45 * 60 * 1000)
      );
      expect(input.room).toBe('spruce');
    }
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('still creates events for a closed (full) section', async () => {
    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(true, openSection),
        after: makeSnapshot(true, { ...openSection, status: 'closed' }),
      },
    });
    expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);
  });

  it('does not create events for a draft section', async () => {
    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, { ...openSection, status: 'draft' }),
      },
    });
    expect(mocks.upsertWithId).not.toHaveBeenCalled();
  });

  it('removes events when a section is completed', async () => {
    const existing = sessionDates.map((d) => makeCalendarEvent('sec-1', d));
    mocks.findAllBySourceRef.mockResolvedValue(existing);

    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(true, openSection),
        after: makeSnapshot(true, { ...openSection, status: 'completed' }),
      },
    });

    expect(mocks.upsertWithId).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledTimes(3);
    for (const e of existing) {
      expect(mocks.delete).toHaveBeenCalledWith(e.id);
    }
  });

  it('deletes ALL events when a section is deleted', async () => {
    const existing = sessionDates.map((d) => makeCalendarEvent('sec-1', d));
    mocks.findAllBySourceRef.mockResolvedValue(existing);

    await handler({
      params: { sectionId: 'sec-1' },
      data: { before: makeSnapshot(true, openSection), after: makeSnapshot(false) },
    });

    expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
      'musicTogetherSections/sec-1'
    );
    expect(mocks.delete).toHaveBeenCalledTimes(3);
  });

  it('deletes stale events when sessions are removed', async () => {
    mocks.findAllBySourceRef.mockResolvedValue(
      sessionDates.map((d) => makeCalendarEvent('sec-1', d))
    );

    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(true, openSection),
        after: makeSnapshot(true, {
          ...openSection,
          sessions: [{ dateTime: ts(sessionDates[0]) }],
        }),
      },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledTimes(2);
    expect(mocks.delete).toHaveBeenCalledWith(eventId('sec-1', sessionDates[1]));
    expect(mocks.delete).toHaveBeenCalledWith(eventId('sec-1', sessionDates[2]));
  });

  it('maps an unknown room to null', async () => {
    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, {
          ...openSection,
          room: 'somewhere-else',
          sessions: [{ dateTime: ts(sessionDates[0]) }],
        }),
      },
    });
    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.room).toBeNull();
  });

  it('uses stable IDs of the form mt-{sectionId}-{timestampMs}', async () => {
    await handler({
      params: { sectionId: 'thu-fall' },
      data: {
        before: makeSnapshot(false, undefined, 'thu-fall'),
        after: makeSnapshot(
          true,
          { ...openSection, sessions: [{ dateTime: ts(sessionDates[0]) }] },
          'thu-fall'
        ),
      },
    });
    const [id] = mocks.upsertWithId.mock.calls[0];
    expect(id).toBe(`mt-thu-fall-${sessionDates[0].getTime()}`);
  });

  it('parses ISO-string session dates (emulator REST format)', async () => {
    const iso = '2030-10-08T14:00:00.000Z';
    await handler({
      params: { sectionId: 'sec-1' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, {
          ...openSection,
          sessions: [{ dateTime: iso }],
        }),
      },
    });
    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.startDateTime).toEqual(new Date(iso));
  });
});
