import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit test for the capacity-gated, idempotent demo RSVP transaction. A
 * hand-rolled fake Firestore drives the transaction so we can assert:
 * confirmed-until-cap, then waitlisted; and a repeat RSVP is a no-op that keeps
 * the family's place + status.
 */

const state = vi.hoisted(() => ({
  existingExists: false,
  existingData: undefined as Record<string, unknown> | undefined,
  confirmedSize: 0,
  setCalls: [] as { data: Record<string, unknown> }[],
}));

vi.mock('./utilities/database.config', () => {
  const docRef = { __kind: 'doc' };
  const queryObj = { __kind: 'query' };
  const subColl = {
    doc: () => docRef,
    where: () => queryObj,
  };
  const tx = {
    get: async (target: unknown) => {
      if (target === docRef) {
        return {
          exists: state.existingExists,
          data: () => state.existingData,
        };
      }
      return { size: state.confirmedSize };
    },
    set: (_ref: unknown, data: Record<string, unknown>) => {
      state.setCalls.push({ data });
    },
  };
  const db = {
    collection: () => ({ doc: () => ({ collection: () => subColl }) }),
    runTransaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return {
    getDb: () => db,
    toDate: (v: unknown) => (v instanceof Date ? v : new Date(v as string)),
  };
});

import {
  MusicTogetherDemoRsvpRepository,
  mtDemoRsvpEmailKey,
} from './music-together-demo-rsvp.repository';

describe('MusicTogetherDemoRsvpRepository.add', () => {
  beforeEach(() => {
    state.existingExists = false;
    state.existingData = undefined;
    state.confirmedSize = 0;
    state.setCalls = [];
  });

  it('confirms while under capacity', async () => {
    state.confirmedSize = 2;
    const { entry, created } = await MusicTogetherDemoRsvpRepository.add({
      demoId: 'demo-1',
      name: 'Jamie',
      email: 'Jamie@Example.com',
      capacityFamilies: 5,
    });
    expect(created).toBe(true);
    expect(entry.status).toBe('confirmed');
    expect(entry.id).toBe('jamie@example.com'); // lowercased email key
    expect(state.setCalls[0].data.status).toBe('confirmed');
  });

  it('waitlists once at/over capacity', async () => {
    state.confirmedSize = 5;
    const { entry, created } = await MusicTogetherDemoRsvpRepository.add({
      demoId: 'demo-1',
      name: 'Pat',
      email: 'pat@example.com',
      capacityFamilies: 5,
    });
    expect(created).toBe(true);
    expect(entry.status).toBe('waitlisted');
    expect(state.setCalls[0].data.status).toBe('waitlisted');
  });

  it('is idempotent — a repeat RSVP keeps the existing entry, no write', async () => {
    state.existingExists = true;
    state.existingData = {
      name: 'Jamie',
      email: 'jamie@example.com',
      status: 'waitlisted',
      createdAt: new Date('2030-07-01T00:00:00Z'),
    };
    const { entry, created } = await MusicTogetherDemoRsvpRepository.add({
      demoId: 'demo-1',
      name: 'Jamie Again',
      email: 'jamie@example.com',
      capacityFamilies: 5,
    });
    expect(created).toBe(false);
    expect(entry.status).toBe('waitlisted');
    expect(entry.name).toBe('Jamie'); // preserved, not overwritten
    expect(state.setCalls).toHaveLength(0);
  });

  it('normalizes the email into the doc-id key', () => {
    expect(mtDemoRsvpEmailKey('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});
