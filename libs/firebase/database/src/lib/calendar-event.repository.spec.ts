import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
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

import { CalendarEventRepository } from './calendar-event.repository';
import { db } from './utilities/database.config';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a fake Firestore document snapshot */
function fakeDoc(
  id: string,
  data: Record<string, unknown> | null
): { exists: boolean; id: string; data: () => Record<string, unknown> | null } {
  return {
    exists: data !== null,
    id,
    data: () => data,
  };
}

/** Sensible default data returned from a Firestore doc */
function eventData(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Open Jam',
    description: 'Weekly jam session',
    startDateTime: { toDate: () => new Date('2026-05-15T18:00:00.000Z') },
    endDateTime: { toDate: () => new Date('2026-05-15T20:00:00.000Z') },
    recurrenceRule: null,
    location: 'Main Hall',
    type: 'jam',
    public: true,
    sourceRef: null,
    createdBy: 'admin',
    createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    updatedAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('CalendarEventRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---- findAll --------------------------------------------------- */

  describe('findAll', () => {
    it('returns all events ordered by startDateTime when no filters provided', async () => {
      const docs = [
        fakeDoc('e1', eventData({ title: 'Event 1' })),
        fakeDoc('e2', eventData({ title: 'Event 2' })),
      ];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAll();

      expect(mockCollection).toHaveBeenCalledWith('calendarEvents');
      expect(mockOrderBy).toHaveBeenCalledWith('startDateTime', 'asc');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('e1');
      expect(result[1].id).toBe('e2');
    });

    it('applies type filter when provided', async () => {
      const docs = [fakeDoc('e1', eventData({ type: 'class' }))];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAll({ type: 'class' as never });

      expect(mockWhere).toHaveBeenCalledWith('type', '==', 'class');
      expect(result).toHaveLength(1);
    });

    it('applies publicOnly filter when provided', async () => {
      const docs = [fakeDoc('e1', eventData())];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAll({ publicOnly: true });

      expect(mockWhere).toHaveBeenCalledWith('public', '==', true);
      expect(result).toHaveLength(1);
    });

    it('applies both type and publicOnly filters together', async () => {
      const docs = [fakeDoc('e1', eventData({ type: 'jam' }))];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWherePublic = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockWhereType = vi.fn().mockReturnValue({ where: mockWherePublic });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhereType });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAll({
        type: 'jam' as never,
        publicOnly: true,
      });

      expect(mockWhereType).toHaveBeenCalledWith('type', '==', 'jam');
      expect(mockWherePublic).toHaveBeenCalledWith('public', '==', true);
      expect(result).toHaveLength(1);
    });

    it('filters out non-existent docs', async () => {
      const docs = [
        fakeDoc('e1', eventData()),
        { exists: false, id: 'e-gone', data: () => null },
      ];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });
  });

  /* ---- findById -------------------------------------------------- */

  describe('findById', () => {
    it('returns a calendar event when it exists', async () => {
      const doc = fakeDoc('e1', eventData());
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findById('e1');

      expect(mockDocFn).toHaveBeenCalledWith('e1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('e1');
      expect(result!.title).toBe('Open Jam');
    });

    it('returns undefined when document does not exist', async () => {
      const doc = fakeDoc('e-missing', null);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findById('e-missing');

      expect(result).toBeUndefined();
    });
  });

  /* ---- findPublic ------------------------------------------------ */

  describe('findPublic', () => {
    it('delegates to findAll with publicOnly true', async () => {
      const docs = [fakeDoc('e1', eventData())];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findPublic();

      expect(mockWhere).toHaveBeenCalledWith('public', '==', true);
      expect(result).toHaveLength(1);
    });
  });

  /* ---- findPublicByType ----------------------------------------- */

  describe('findPublicByType', () => {
    it('delegates to findAll with type and publicOnly', async () => {
      const docs = [fakeDoc('e1', eventData({ type: 'class' }))];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWherePublic = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockWhereType = vi.fn().mockReturnValue({ where: mockWherePublic });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhereType });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findPublicByType('class' as never);

      expect(mockWhereType).toHaveBeenCalledWith('type', '==', 'class');
      expect(mockWherePublic).toHaveBeenCalledWith('public', '==', true);
      expect(result).toHaveLength(1);
    });
  });

  /* ---- findBySourceRef ------------------------------------------ */

  describe('findBySourceRef', () => {
    it('returns the first matching event', async () => {
      const doc = fakeDoc('e1', eventData({ sourceRef: 'classes/abc' }));
      const mockGet = vi.fn().mockResolvedValue({ empty: false, docs: [doc] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findBySourceRef('classes/abc');

      expect(mockWhere).toHaveBeenCalledWith('sourceRef', '==', 'classes/abc');
      expect(mockLimit).toHaveBeenCalledWith(1);
      expect(result).toBeDefined();
      expect(result!.id).toBe('e1');
    });

    it('returns undefined when no match found', async () => {
      const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findBySourceRef('classes/missing');

      expect(result).toBeUndefined();
    });
  });

  /* ---- findAllBySourceRef --------------------------------------- */

  describe('findAllBySourceRef', () => {
    it('returns all events matching the sourceRef', async () => {
      const docs = [
        fakeDoc('e1', eventData({ sourceRef: 'classes/abc' })),
        fakeDoc('e2', eventData({ sourceRef: 'classes/abc', title: 'Session 2' })),
      ];
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAllBySourceRef('classes/abc');

      expect(mockWhere).toHaveBeenCalledWith('sourceRef', '==', 'classes/abc');
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no matches', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhere = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.findAllBySourceRef('classes/none');

      expect(result).toEqual([]);
    });
  });

  /* ---- create --------------------------------------------------- */

  describe('create', () => {
    it('converts date strings to Date objects for Firestore storage', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'event-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.create({
        title: 'Open Jam',
        description: 'Weekly jam session',
        startDateTime: '2026-05-15T18:00:00.000Z' as unknown as Date,
        endDateTime: '2026-05-15T20:00:00.000Z' as unknown as Date,
        recurrenceRule: null,
        location: 'Main Hall',
        type: 'jam',
        public: true,
        sourceRef: null,
        createdBy: 'admin',
      });

      expect(mockSet).toHaveBeenCalled();
      expect(savedData.startDateTime).toBeInstanceOf(Date);
      expect(savedData.endDateTime).toBeInstanceOf(Date);
      expect((savedData.startDateTime as Date).toISOString()).toBe(
        '2026-05-15T18:00:00.000Z'
      );
      expect((savedData.endDateTime as Date).toISOString()).toBe(
        '2026-05-15T20:00:00.000Z'
      );
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
    });

    it('returns the created event with generated id', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDocRef = vi.fn().mockReturnValue({
        id: 'event-gen-id',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.create({
        title: 'Workshop',
        description: 'desc',
        startDateTime: '2026-06-01T10:00:00.000Z' as unknown as Date,
        endDateTime: '2026-06-01T12:00:00.000Z' as unknown as Date,
        recurrenceRule: null,
        location: 'Room B',
        type: 'class',
        public: false,
        sourceRef: 'classes/xyz',
        createdBy: 'admin',
      });

      expect(result.id).toBe('event-gen-id');
      expect(result.title).toBe('Workshop');
      expect(result.sourceRef).toBe('classes/xyz');
    });
  });

  /* ---- upsertWithId --------------------------------------------- */

  describe('upsertWithId', () => {
    it('creates a new doc when it does not exist', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });
      const existingDoc = { exists: false, data: () => null };
      const mockGet = vi.fn().mockResolvedValue(existingDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        get: mockGet,
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.upsertWithId('stable-id-1', {
        title: 'New Event',
        description: 'desc',
        startDateTime: '2026-07-01T09:00:00.000Z' as unknown as Date,
        endDateTime: '2026-07-01T11:00:00.000Z' as unknown as Date,
        recurrenceRule: null,
        location: 'Studio',
        type: 'jam',
        public: true,
        sourceRef: 'classes/abc',
        createdBy: 'admin',
      });

      expect(mockDocFn).toHaveBeenCalledWith('stable-id-1');
      expect(mockSet).toHaveBeenCalled();
      // For a new doc, createdAt should be "now" (same as updatedAt)
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
      expect(
        (savedData.createdAt as Date).getTime()
      ).toBe(
        (savedData.updatedAt as Date).getTime()
      );
      expect(result.id).toBe('stable-id-1');
      expect(result.title).toBe('New Event');
    });

    it('preserves original createdAt when doc already exists', async () => {
      const originalCreatedAt = new Date('2026-01-15T00:00:00.000Z');
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });
      const existingDoc = {
        exists: true,
        data: () => ({
          createdAt: { toDate: () => originalCreatedAt },
        }),
      };
      const mockGet = vi.fn().mockResolvedValue(existingDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        get: mockGet,
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.upsertWithId('stable-id-1', {
        title: 'Updated Event',
        description: 'desc',
        startDateTime: '2026-07-01T09:00:00.000Z' as unknown as Date,
        endDateTime: '2026-07-01T11:00:00.000Z' as unknown as Date,
        recurrenceRule: null,
        location: 'Studio',
        type: 'jam',
        public: true,
        sourceRef: 'classes/abc',
        createdBy: 'admin',
      });

      expect(savedData.createdAt).toEqual(originalCreatedAt);
      // updatedAt should be a fresh Date (different from the preserved createdAt)
      expect(savedData.updatedAt).toBeInstanceOf(Date);
      expect(result.id).toBe('stable-id-1');
      expect(result.title).toBe('Updated Event');
    });
  });

  /* ---- update --------------------------------------------------- */

  describe('update', () => {
    it('converts date strings to Date objects on update', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = fakeDoc('event-1', eventData());
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.update({
        id: 'event-1',
        startDateTime: '2026-05-15T19:00:00.000Z' as unknown as Date,
        endDateTime: '2026-05-15T21:00:00.000Z' as unknown as Date,
      });

      expect(updatedFields.startDateTime).toBeInstanceOf(Date);
      expect(updatedFields.endDateTime).toBeInstanceOf(Date);
    });

    it('does not add date fields when not being updated', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = fakeDoc('event-1', eventData({ title: 'New Title' }));
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.update({
        id: 'event-1',
        title: 'New Title',
      });

      expect(updatedFields.startDateTime).toBeUndefined();
      expect(updatedFields.endDateTime).toBeUndefined();
      expect(updatedFields.title).toBe('New Title');
    });

    it('returns the full event after update', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockDoc = fakeDoc('event-1', eventData({ title: 'Updated Title' }));
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await CalendarEventRepository.update({
        id: 'event-1',
        title: 'Updated Title',
      });

      expect(result.id).toBe('event-1');
      expect(result.title).toBe('Updated Title');
    });

    it('throws when the doc is missing after update', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const missingDoc = fakeDoc('event-gone', null);
      const mockGet = vi.fn().mockResolvedValue(missingDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await expect(
        CalendarEventRepository.update({ id: 'event-gone', title: 'x' })
      ).rejects.toThrow('Calendar event event-gone not found after update');
    });
  });

  /* ---- delete --------------------------------------------------- */

  describe('delete', () => {
    it('deletes the document by id', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocFn = vi.fn().mockReturnValue({ delete: mockDelete });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.delete('event-1');

      expect(mockCollection).toHaveBeenCalledWith('calendarEvents');
      expect(mockDocFn).toHaveBeenCalledWith('event-1');
      expect(mockDelete).toHaveBeenCalled();
    });
  });
});
