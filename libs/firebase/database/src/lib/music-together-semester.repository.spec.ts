import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ collection: vi.fn() }));

vi.mock('./utilities/database.config', () => ({
  getDb: () => ({ collection: mocks.collection }),
  toDate: (value: unknown, fallback: Date = new Date()): Date => {
    if (value === null || value === undefined) return fallback;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    }
    return fallback;
  },
}));

import { MusicTogetherSemesterRepository } from './music-together-semester.repository';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

/** Default persisted semester document data. */
function semData(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Winter 2026–2027',
    season: 'winter',
    year: 2026,
    startDate: ts('2026-12-03T00:00:00.000Z'),
    endDate: ts('2027-02-18T00:00:00.000Z'),
    weeks: 10,
    breaks: [
      {
        label: 'Holiday break',
        startDate: ts('2026-12-18T00:00:00.000Z'),
        endDate: ts('2027-01-06T00:00:00.000Z'),
      },
    ],
    weatherMakeupDates: [ts('2027-02-25T00:00:00.000Z')],
    enrollmentOpensAt: ts('2026-11-12T00:00:00.000Z'),
    notes: 'Two snow makeup days built in.',
    createdAt: ts('2026-01-01T00:00:00.000Z'),
    updatedAt: ts('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeDoc(id: string, data: Record<string, unknown> | null) {
  return { exists: data !== null, id, data: () => data };
}

describe('MusicTogetherSemesterRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findAll', () => {
    it('orders by sortValue when no filter is provided', async () => {
      const docs = [fakeDoc('s1', semData()), fakeDoc('s2', semData())];
      const get = vi.fn().mockResolvedValue({ docs });
      const orderBy = vi.fn().mockReturnValue({ get });
      mocks.collection.mockReturnValue({ orderBy });

      const result = await MusicTogetherSemesterRepository.findAll();

      expect(mocks.collection).toHaveBeenCalledWith('musicTogetherSemesters');
      expect(orderBy).toHaveBeenCalledWith('sortValue', 'asc');
      expect(result).toHaveLength(2);
      // docToSemester hydrated nested dates + parsed breaks/weather dates.
      expect(result[0].name).toBe('Winter 2026–2027');
      expect(result[0].breaks?.[0].label).toBe('Holiday break');
      expect(result[0].startDate).toBeInstanceOf(Date);
      expect(result[0].weatherMakeupDates?.[0]).toBeInstanceOf(Date);
    });

    it('drops non-existent docs', async () => {
      const docs = [fakeDoc('s1', semData()), fakeDoc('gone', null)];
      const get = vi.fn().mockResolvedValue({ docs });
      const orderBy = vi.fn().mockReturnValue({ get });
      mocks.collection.mockReturnValue({ orderBy });

      const result = await MusicTogetherSemesterRepository.findAll();
      expect(result).toHaveLength(1);
    });

    it('leaves optional date fields undefined when absent', async () => {
      const doc = fakeDoc(
        's-min',
        semData({
          startDate: undefined,
          endDate: undefined,
          enrollmentOpensAt: undefined,
          breaks: undefined,
          weatherMakeupDates: undefined,
        })
      );
      const get = vi.fn().mockResolvedValue({ docs: [doc] });
      const orderBy = vi.fn().mockReturnValue({ get });
      mocks.collection.mockReturnValue({ orderBy });

      const [sem] = await MusicTogetherSemesterRepository.findAll();
      expect(sem.startDate).toBeUndefined();
      expect(sem.breaks).toBeUndefined();
      expect(sem.weatherMakeupDates).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns the semester when it exists', async () => {
      const get = vi.fn().mockResolvedValue(fakeDoc('s1', semData()));
      const doc = vi.fn().mockReturnValue({ get });
      mocks.collection.mockReturnValue({ doc });

      const result = await MusicTogetherSemesterRepository.findById('s1');
      expect(doc).toHaveBeenCalledWith('s1');
      expect(result?.id).toBe('s1');
    });

    it('returns undefined when missing', async () => {
      const get = vi.fn().mockResolvedValue(fakeDoc('nope', null));
      const doc = vi.fn().mockReturnValue({ get });
      mocks.collection.mockReturnValue({ doc });

      expect(await MusicTogetherSemesterRepository.findById('nope')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('denormalizes sortValue + timestamps and returns the hydrated semester', async () => {
      const set = vi.fn().mockResolvedValue(undefined);
      const get = vi.fn().mockResolvedValue(fakeDoc('s-new', semData()));
      const docRef = { id: 's-new', set, get };
      mocks.collection.mockReturnValue({ doc: vi.fn().mockReturnValue(docRef) });

      const result = await MusicTogetherSemesterRepository.create({
        name: 'Winter 2026–2027',
        season: 'winter',
        year: 2026,
      });

      const written = set.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof written.sortValue).toBe('number');
      expect(written.createdAt).toBeInstanceOf(Date);
      expect(written.updatedAt).toBeInstanceOf(Date);
      expect(result.id).toBe('s-new');
    });

    it('throws if the created doc cannot be read back', async () => {
      const docRef = {
        id: 's-x',
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(fakeDoc('s-x', null)),
      };
      mocks.collection.mockReturnValue({ doc: vi.fn().mockReturnValue(docRef) });

      await expect(
        MusicTogetherSemesterRepository.create({
          name: 'X',
          season: 'fall',
          year: 2026,
        })
      ).rejects.toThrow(/not found after create/);
    });
  });

  describe('update', () => {
    it('updates and returns the hydrated semester', async () => {
      const update = vi.fn().mockResolvedValue(undefined);
      const get = vi
        .fn()
        .mockResolvedValue(fakeDoc('s1', semData({ name: 'Renamed' })));
      mocks.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({ update, get }),
      });

      const result = await MusicTogetherSemesterRepository.update({
        id: 's1',
        name: 'Renamed',
      });

      expect(update).toHaveBeenCalled();
      const patch = update.mock.calls[0][0] as Record<string, unknown>;
      expect(patch.updatedAt).toBeInstanceOf(Date);
      expect(result.name).toBe('Renamed');
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      const del = vi.fn().mockResolvedValue(undefined);
      const doc = vi.fn().mockReturnValue({ delete: del });
      mocks.collection.mockReturnValue({ doc });

      await MusicTogetherSemesterRepository.delete('s1');
      expect(doc).toHaveBeenCalledWith('s1');
      expect(del).toHaveBeenCalled();
    });
  });
});
