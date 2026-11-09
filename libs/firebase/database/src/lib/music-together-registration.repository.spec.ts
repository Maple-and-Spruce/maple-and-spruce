import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * MusicTogetherRegistrationRepository against a small in-memory Firestore
 * stand-in: what each query asks for, and how documents read back. All
 * families are invented.
 */

type Data = Record<string, unknown>;

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  queries: [] as Array<Array<[string, string, unknown] | ['orderBy', string, string]>>,
  nextId: 1,
}));

function snapshot(id: string) {
  const data = store.docs.get(id);
  return { id, exists: data !== undefined, data: () => data };
}

function docRef(id: string) {
  return {
    id,
    get: vi.fn(async () => snapshot(id)),
    set: vi.fn(async (data: Data) => {
      store.docs.set(id, { ...data });
    }),
    update: vi.fn(async (patch: Data) => {
      const current = store.docs.get(id);
      if (!current) throw new Error('not found');
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (key.includes('.')) {
          const [outer, inner] = key.split(/\.(.+)/);
          next[outer] = { ...((next[outer] as Data) ?? {}), [inner]: value };
        } else {
          next[key] = value;
        }
      }
      store.docs.set(id, next);
    }),
    delete: vi.fn(async () => {
      store.docs.delete(id);
    }),
  };
}

function query(clauses: Array<[string, string, unknown] | ['orderBy', string, string]>) {
  return {
    where: (field: string, op: string, value: unknown) =>
      query([...clauses, [field, op, value]]),
    orderBy: (field: string, dir: string) => query([...clauses, ['orderBy', field, dir]]),
    get: async () => {
      store.queries.push(clauses);
      const docs = [...store.docs.keys()]
        .filter((id) =>
          clauses.every((clause) => {
            if (clause[0] === 'orderBy') return true;
            const [field, op, value] = clause;
            const actual = (store.docs.get(id) as Data)[field];
            if (op === '==') return actual === value;
            if (op === 'in') return (value as unknown[]).includes(actual);
            if (op === '>=') return (actual as Date) >= (value as Date);
            throw new Error(`unsupported op ${op}`);
          })
        )
        .map(snapshot);
      return { docs, size: docs.length };
    },
  };
}

const fakeDb = vi.hoisted(() => ({
  collection: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('./utilities/database.config', () => ({
  getDb: () => fakeDb,
  toDate: (value: unknown) =>
    value instanceof Date ? value : new Date(value as string),
}));

import { MusicTogetherRegistrationRepository as Repo } from './music-together-registration.repository';

const CREATED = new Date('2026-09-01T12:00:00Z');

function family(overrides: Data = {}): Data {
  return {
    sectionId: 'sec-tue',
    adultFirstName: 'Fern',
    adultLastName: 'Calder',
    parentNames: ['Fern Calder'],
    children: [{ name: 'Wren', dob: new Date('2024-02-01') }],
    email: 'fern@example.com',
    phone: '304-555-0101',
    address: '1 Test Lane',
    paymentPlan: 'full',
    policiesAcceptedAt: CREATED,
    pricePaidCents: 25200,
    status: 'confirmed',
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.docs.clear();
  store.queries.length = 0;
  store.nextId = 1;
  fakeDb.collection.mockImplementation((name: string) => {
    expect(name).toBe('musicTogetherRegistrations');
    return {
      ...query([]),
      doc: (id?: string) => docRef(id ?? `auto-${store.nextId++}`),
    };
  });
  fakeDb.runTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: ReturnType<typeof docRef>) => ref.get(),
        update: (ref: ReturnType<typeof docRef>, patch: Data) => ref.update(patch),
      })
  );
});

describe('reading a registration back', () => {
  it('maps every field, defaults the optional ones, and drops malformed children', async () => {
    store.docs.set(
      'mtr-1',
      family({
        adultFirstName: undefined,
        parentNames: 'not a list',
        children: [{ name: 'Wren', dob: '2024-02-01' }, { name: 'No dob' }, null, 'junk'],
        accommodations: null,
        noteAlertSentAt: '2026-09-02T12:00:00Z',
        confirmationSentAt: '2026-09-01T13:00:00Z',
        privacyConsentAcceptedAt: '2026-09-01T11:00:00Z',
        cardOnFileAuthAt: '2026-09-01T11:30:00Z',
        calendarToken: null,
        reminderSentForSessions: { '2026-09-08T14:00:00.000Z': '2026-09-08T12:00:00Z', skip: null },
      })
    );
    const reg = await Repo.findById('mtr-1');
    expect(reg).toMatchObject({
      id: 'mtr-1',
      adultFirstName: '',
      adultLastName: 'Calder',
      parentNames: [],
      children: [{ name: 'Wren', dob: new Date('2024-02-01') }],
      accommodations: undefined,
      noteAlertSentAt: new Date('2026-09-02T12:00:00Z'),
      confirmationSentAt: new Date('2026-09-01T13:00:00Z'),
      privacyConsentAcceptedAt: new Date('2026-09-01T11:00:00Z'),
      cardOnFileAuthAt: new Date('2026-09-01T11:30:00Z'),
      calendarToken: undefined,
      reminderSentForSessions: {
        '2026-09-08T14:00:00.000Z': new Date('2026-09-08T12:00:00Z'),
      },
    });
  });

  it('reads optional dates as unset and an empty reminder map as absent', async () => {
    store.docs.set('mtr-1', family({ children: 'nope', reminderSentForSessions: {} }));
    const reg = await Repo.findById('mtr-1');
    expect(reg?.children).toEqual([]);
    expect(reg?.noteAlertSentAt).toBeUndefined();
    expect(reg?.privacyConsentAcceptedAt).toBeUndefined();
    expect(reg?.reminderSentForSessions).toBeUndefined();
  });

  it('returns undefined for a missing document', async () => {
    expect(await Repo.findById('nope')).toBeUndefined();
  });
});

describe('queries', () => {
  beforeEach(() => {
    store.docs.set('a', family({ sectionId: 'sec-tue', status: 'confirmed', email: 'a@example.com', calendarToken: 'tok-a' }));
    store.docs.set('b', family({ sectionId: 'sec-tue', status: 'pending', email: 'b@example.com', createdAt: new Date('2026-10-01') }));
    store.docs.set('c', family({ sectionId: 'sec-wed', status: 'cancelled', email: 'a@example.com' }));
  });

  it('findAll applies each filter and orders newest first', async () => {
    const all = await Repo.findAll();
    expect(all).toHaveLength(3);
    const filtered = await Repo.findAll({ sectionId: 'sec-tue', email: 'a@example.com', status: 'confirmed' });
    expect(filtered.map((r) => r.id)).toEqual(['a']);
    expect(store.queries[1]).toEqual([
      ['sectionId', '==', 'sec-tue'],
      ['email', '==', 'a@example.com'],
      ['status', '==', 'confirmed'],
      ['orderBy', 'createdAt', 'desc'],
    ]);
  });

  it('findBySectionId reads one section', async () => {
    expect((await Repo.findBySectionId('sec-tue')).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('countBySectionId counts the families holding a spot by default', async () => {
    expect(await Repo.countBySectionId('sec-tue')).toBe(2);
    expect(await Repo.countBySectionId('sec-tue', ['confirmed'])).toBe(1);
  });

  it('findCreatedSince is a single range filter on createdAt', async () => {
    const since = new Date('2026-09-15');
    expect((await Repo.findCreatedSince(since)).map((r) => r.id)).toEqual(['b']);
    expect(store.queries[0]).toEqual([['createdAt', '>=', since]]);
  });

  it('finds families by calendar token, and a token by email', async () => {
    expect((await Repo.findByCalendarToken('tok-a')).map((r) => r.id)).toEqual(['a']);
    expect(await Repo.findCalendarTokenByEmail('a@example.com')).toBe('tok-a');
    expect(await Repo.findCalendarTokenByEmail('b@example.com')).toBeUndefined();
  });
});

describe('writes', () => {
  it('create stamps the times and reads the new document back', async () => {
    const { createdAt: _c, updatedAt: _u, ...input } = family();
    const reg = await Repo.create(input as never);
    expect(reg.id).toBe('auto-1');
    expect(reg.createdAt).toBeInstanceOf(Date);
    expect(store.docs.get('auto-1')?.['sectionId']).toBe('sec-tue');
  });

  it('update merges the change and stamps updatedAt', async () => {
    store.docs.set('mtr-1', family());
    const reg = await Repo.update({ id: 'mtr-1', status: 'cancelled' });
    expect(reg.status).toBe('cancelled');
    expect(store.docs.get('mtr-1')?.['updatedAt']).not.toEqual(CREATED);
  });

  it('update throws when the document is gone afterwards', async () => {
    store.docs.set('mtr-1', family());
    fakeDb.collection.mockImplementationOnce(() => ({
      doc: () => ({
        update: vi.fn(async () => undefined),
        get: vi.fn(async () => ({ id: 'mtr-1', exists: false, data: () => undefined })),
      }),
    }));
    await expect(Repo.update({ id: 'mtr-1', status: 'cancelled' })).rejects.toThrow(
      'not found after update'
    );
  });

  it('delete removes the document', async () => {
    store.docs.set('mtr-1', family());
    await Repo.delete('mtr-1');
    expect(store.docs.has('mtr-1')).toBe(false);
  });

  it('marks one session reminder as sent', async () => {
    store.docs.set('mtr-1', family());
    const at = new Date('2026-09-08T12:00:00Z');
    await Repo.markReminderSentForSession('mtr-1', '2026-09-08T14:00:00.000Z', at);
    expect(store.docs.get('mtr-1')?.['reminderSentForSessions']).toEqual({
      '2026-09-08T14:00:00.000Z': at,
    });
  });

  it('hands out collection and document references', () => {
    expect(Repo.getCollectionRef()).toBeDefined();
    expect(Repo.getDocRef('mtr-1').id).toBe('mtr-1');
    expect(Repo.getDocRef().id).toMatch(/^auto-/);
  });
});

describe('the staff note alert claim (#327)', () => {
  const at = new Date('2026-11-08T15:00:00Z');

  it('stamps noteAlertSentAt once, then refuses', async () => {
    store.docs.set('mtr-1', family());
    await expect(Repo.claimNoteAlert('mtr-1', at)).resolves.toBe(true);
    expect(store.docs.get('mtr-1')?.['noteAlertSentAt']).toEqual(at);
    await expect(Repo.claimNoteAlert('mtr-1', at)).resolves.toBe(false);
  });

  it('refuses for a registration that is gone', async () => {
    await expect(Repo.claimNoteAlert('nope', at)).resolves.toBe(false);
  });

  it('release clears the stamp so a retry can claim again', async () => {
    store.docs.set('mtr-1', family({ noteAlertSentAt: at }));
    await Repo.releaseNoteAlert('mtr-1');
    expect(store.docs.get('mtr-1')?.['noteAlertSentAt']).toBeNull();
    await expect(Repo.claimNoteAlert('mtr-1', at)).resolves.toBe(true);
  });
});
