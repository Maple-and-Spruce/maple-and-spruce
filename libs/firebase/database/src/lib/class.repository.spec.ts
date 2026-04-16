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

import { ClassRepository } from './class.repository';
import { db } from './utilities/database.config';

/** Helper: build a fake Firestore document snapshot */
function fakeDoc(
  id: string,
  data: Record<string, unknown> | undefined,
  exists = true
) {
  return {
    exists,
    id,
    data: () => data,
  };
}

/** Timestamp-like object Firestore returns */
function ts(date: Date) {
  return { toDate: () => date };
}

/** Reusable raw Firestore class data */
function rawClassData(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Pottery 101',
    description: 'Learn pottery',
    shortDescription: null,
    instructorId: 'inst-1',
    sessions: [
      { dateTime: ts(new Date('2026-05-15T14:00:00.000Z')) },
    ],
    firstSessionAt: ts(new Date('2026-05-15T14:00:00.000Z')),
    durationMinutes: 120,
    registrationClosesAt: null,
    capacity: 10,
    priceCents: 4500,
    imageUrl: null,
    categoryId: 'cat-1',
    skillLevel: 'all-levels',
    status: 'published',
    location: null,
    materialsIncluded: null,
    whatToBring: null,
    minimumAge: null,
    webflowItemId: null,
    createdAt: ts(new Date('2026-01-01')),
    updatedAt: ts(new Date('2026-01-01')),
    ...overrides,
  };
}

describe('ClassRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── create ───────────────────────────────────────────────────────

  describe('create', () => {
    it('converts session dateTime strings to Date objects for Firestore storage', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.create({
        name: 'Pottery 101',
        description: 'Learn pottery',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [
          { dateTime: '2026-05-15T14:00:00.000Z' as unknown as Date },
        ],
        durationMinutes: 120,
        capacity: 10,
        priceCents: 4500,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      expect(mockSet).toHaveBeenCalled();
      // sessions should be an array with dateTime as Date objects
      expect(savedData.sessions).toBeInstanceOf(Array);
      const sessions = savedData.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      // firstSessionAt should be written as a denormalized field
      expect(savedData.firstSessionAt).toBeInstanceOf(Date);
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      // createdAt/updatedAt should also be Date objects
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
    });

    it('handles sessions with dateTime already as Date objects', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const dateObj = new Date('2026-05-15T14:00:00.000Z');
      await ClassRepository.create({
        name: 'Pottery 101',
        description: 'Learn pottery',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [{ dateTime: dateObj }],
        durationMinutes: 120,
        capacity: 10,
        priceCents: 4500,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      const sessions = savedData.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      expect(savedData.firstSessionAt).toBeInstanceOf(Date);
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
    });

    it('sorts multiple sessions by dateTime and sets firstSessionAt to the earliest', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.create({
        name: 'Multi-Session Workshop',
        description: 'A two-day workshop',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [
          { dateTime: new Date('2026-06-02T14:00:00.000Z') },
          { dateTime: new Date('2026-06-01T10:00:00.000Z') },
        ],
        durationMinutes: 180,
        capacity: 8,
        priceCents: 9000,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      const sessions = savedData.sessions as { dateTime: Date }[];
      expect(sessions).toHaveLength(2);
      // Should be sorted chronologically
      expect(sessions[0].dateTime.toISOString()).toBe(
        '2026-06-01T10:00:00.000Z'
      );
      expect(sessions[1].dateTime.toISOString()).toBe(
        '2026-06-02T14:00:00.000Z'
      );
      // firstSessionAt should be the earliest session
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-06-01T10:00:00.000Z'
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────

  describe('update', () => {
    it('converts session dateTime strings to Date objects on update', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'class-1',
        data: () => ({
          name: 'Pottery 101',
          description: 'Learn pottery',
          shortDescription: null,
          instructorId: null,
          sessions: [
            {
              dateTime: {
                toDate: () => new Date('2026-05-20T14:00:00.000Z'),
              },
            },
          ],
          firstSessionAt: {
            toDate: () => new Date('2026-05-20T14:00:00.000Z'),
          },
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          imageUrl: null,
          categoryId: null,
          skillLevel: 'all-levels',
          status: 'published',
          location: null,
          materialsIncluded: null,
          whatToBring: null,
          minimumAge: null,
          webflowItemId: null,
          createdAt: { toDate: () => new Date('2026-01-01') },
          updatedAt: { toDate: () => new Date('2026-01-01') },
        }),
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.update({
        id: 'class-1',
        sessions: [
          { dateTime: '2026-05-20T14:00:00.000Z' as unknown as Date },
        ],
      });

      expect(mockUpdate).toHaveBeenCalled();
      const sessions = updatedFields.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-20T14:00:00.000Z'
      );
      // firstSessionAt should also be updated
      expect(updatedFields.firstSessionAt).toBeInstanceOf(Date);
      expect((updatedFields.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-20T14:00:00.000Z'
      );
    });

    it('does not add sessions or firstSessionAt fields when sessions are not being updated', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'class-1',
        data: () => ({
          name: 'Updated Name',
          description: 'desc',
          shortDescription: null,
          instructorId: null,
          sessions: [
            {
              dateTime: {
                toDate: () => new Date('2026-05-15T14:00:00.000Z'),
              },
            },
          ],
          firstSessionAt: {
            toDate: () => new Date('2026-05-15T14:00:00.000Z'),
          },
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          imageUrl: null,
          categoryId: null,
          skillLevel: 'all-levels',
          status: 'published',
          location: null,
          materialsIncluded: null,
          whatToBring: null,
          minimumAge: null,
          webflowItemId: null,
          createdAt: { toDate: () => new Date('2026-01-01') },
          updatedAt: { toDate: () => new Date('2026-01-01') },
        }),
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.update({
        id: 'class-1',
        name: 'Updated Name',
      });

      expect(updatedFields.sessions).toBeUndefined();
      expect(updatedFields.firstSessionAt).toBeUndefined();
      expect(updatedFields.name).toBe('Updated Name');
      expect(updatedFields.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────

  describe('findAll', () => {
    function setupFindAll(docs: ReturnType<typeof fakeDoc>[]) {
      const mockWhere = vi.fn().mockReturnThis();
      const mockOrderBy = vi.fn().mockReturnThis();
      const mockGet = vi.fn().mockResolvedValue({ docs });
      const queryObj = {
        where: mockWhere,
        orderBy: mockOrderBy,
        get: mockGet,
      };
      const mockCollection = vi.fn().mockReturnValue(queryObj);
      vi.mocked(db.collection).mockImplementation(mockCollection);
      return { mockCollection, mockWhere, mockOrderBy, mockGet };
    }

    it('returns all classes without filters', async () => {
      const docs = [
        fakeDoc('c1', rawClassData({ name: 'Class A' })),
        fakeDoc('c2', rawClassData({ name: 'Class B' })),
      ];
      setupFindAll(docs);

      const results = await ClassRepository.findAll();

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('c1');
      expect(results[0].name).toBe('Class A');
      expect(results[1].id).toBe('c2');
    });

    it('applies status filter', async () => {
      const { mockWhere } = setupFindAll([
        fakeDoc('c1', rawClassData({ status: 'published' })),
      ]);

      await ClassRepository.findAll({ status: 'published' });

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'published');
    });

    it('applies categoryId filter', async () => {
      const { mockWhere } = setupFindAll([]);

      await ClassRepository.findAll({ categoryId: 'cat-1' });

      expect(mockWhere).toHaveBeenCalledWith('categoryId', '==', 'cat-1');
    });

    it('applies instructorId filter', async () => {
      const { mockWhere } = setupFindAll([]);

      await ClassRepository.findAll({ instructorId: 'inst-1' });

      expect(mockWhere).toHaveBeenCalledWith('instructorId', '==', 'inst-1');
    });

    it('applies all filters together', async () => {
      const { mockWhere } = setupFindAll([]);

      await ClassRepository.findAll({
        status: 'published',
        categoryId: 'cat-1',
        instructorId: 'inst-1',
      });

      expect(mockWhere).toHaveBeenCalledTimes(3);
    });

    it('orders results by firstSessionAt ascending', async () => {
      const { mockOrderBy } = setupFindAll([]);

      await ClassRepository.findAll();

      expect(mockOrderBy).toHaveBeenCalledWith('firstSessionAt', 'asc');
    });

    it('filters to upcoming classes when upcoming=true', async () => {
      const pastDate = new Date('2020-01-01T00:00:00.000Z');
      const futureDate = new Date('2099-12-31T00:00:00.000Z');

      const docs = [
        fakeDoc(
          'past',
          rawClassData({
            name: 'Past Class',
            sessions: [{ dateTime: ts(pastDate) }],
          })
        ),
        fakeDoc(
          'future',
          rawClassData({
            name: 'Future Class',
            sessions: [{ dateTime: ts(futureDate) }],
          })
        ),
      ];
      setupFindAll(docs);

      const results = await ClassRepository.findAll({ upcoming: true });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('future');
    });

    it('returns empty array when no classes exist', async () => {
      setupFindAll([]);

      const results = await ClassRepository.findAll();

      expect(results).toEqual([]);
    });

    it('skips non-existent docs', async () => {
      const docs = [
        fakeDoc('c1', rawClassData(), true),
        fakeDoc('c2', undefined, false),
      ];
      setupFindAll(docs);

      const results = await ClassRepository.findAll();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('c1');
    });
  });

  // ─── findById ─────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns a class when the document exists', async () => {
      const doc = fakeDoc('class-1', rawClassData());
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('class-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('class-1');
      expect(result!.name).toBe('Pottery 101');
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].dateTime).toBeInstanceOf(Date);
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.updatedAt).toBeInstanceOf(Date);
    });

    it('returns undefined when the document does not exist', async () => {
      const doc = fakeDoc('missing', undefined, false);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('missing');

      expect(result).toBeUndefined();
    });

    it('converts registrationClosesAt when present', async () => {
      const regCloses = new Date('2026-05-10T00:00:00.000Z');
      const doc = fakeDoc(
        'class-1',
        rawClassData({ registrationClosesAt: ts(regCloses) })
      );
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('class-1');

      expect(result!.registrationClosesAt).toBeInstanceOf(Date);
      expect(result!.registrationClosesAt!.toISOString()).toBe(
        '2026-05-10T00:00:00.000Z'
      );
    });
  });

  // ─── delete ───────────────────────────────────────────────────────

  describe('delete', () => {
    it('calls delete on the correct document', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDocFn = vi.fn().mockReturnValue({ delete: mockDelete });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.delete('class-to-delete');

      expect(mockCollection).toHaveBeenCalledWith('classes');
      expect(mockDocFn).toHaveBeenCalledWith('class-to-delete');
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  // ─── countRegistrations ───────────────────────────────────────────

  describe('countRegistrations', () => {
    it('returns the count from the registrations collection', async () => {
      const mockCountGet = vi.fn().mockResolvedValue({
        data: () => ({ count: 7 }),
      });
      const mockCount = vi.fn().mockReturnValue({ get: mockCountGet });
      const mockWhere = vi.fn().mockReturnThis();
      const queryObj = { where: mockWhere, count: mockCount };
      // First call returns the query-like object, .where() returns itself
      mockWhere.mockReturnValue({ ...queryObj, where: mockWhere });
      // Set up the chain: collection('registrations').where(...).where(...).count().get()
      const mockCollection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            count: mockCount,
          }),
        }),
      });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const count = await ClassRepository.countRegistrations('class-1');

      expect(count).toBe(7);
      expect(mockCollection).toHaveBeenCalledWith('registrations');
    });

    it('returns 0 when no registrations exist', async () => {
      const mockCountGet = vi.fn().mockResolvedValue({
        data: () => ({ count: 0 }),
      });
      const mockCount = vi.fn().mockReturnValue({ get: mockCountGet });
      const mockCollection = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            count: mockCount,
          }),
        }),
      });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const count = await ClassRepository.countRegistrations('class-empty');

      expect(count).toBe(0);
    });
  });

  // ─── updateWebflowItemId ─────────────────────────────────────────

  describe('updateWebflowItemId', () => {
    it('updates only the webflowItemId field', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockDocFn = vi.fn().mockReturnValue({ update: mockUpdate });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.updateWebflowItemId('class-1', 'wf-abc-123');

      expect(mockCollection).toHaveBeenCalledWith('classes');
      expect(mockDocFn).toHaveBeenCalledWith('class-1');
      expect(mockUpdate).toHaveBeenCalledWith({
        webflowItemId: 'wf-abc-123',
      });
    });
  });

  // ─── cancel ───────────────────────────────────────────────────────

  describe('cancel', () => {
    it('updates the class status to cancelled', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = fakeDoc(
        'class-1',
        rawClassData({ status: 'cancelled' })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.cancel('class-1');

      expect(updatedFields.status).toBe('cancelled');
      expect(result.id).toBe('class-1');
    });
  });

  // ─── publish ──────────────────────────────────────────────────────

  describe('publish', () => {
    it('updates the class status to published', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = fakeDoc(
        'class-1',
        rawClassData({ status: 'published' })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.publish('class-1');

      expect(updatedFields.status).toBe('published');
      expect(result.id).toBe('class-1');
    });
  });

  // ─── complete ─────────────────────────────────────────────────────

  describe('complete', () => {
    it('updates the class status to completed', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = fakeDoc(
        'class-1',
        rawClassData({ status: 'completed' })
      );
      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocFn = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.complete('class-1');

      expect(updatedFields.status).toBe('completed');
      expect(result.id).toBe('class-1');
    });
  });

  // ─── parseSessions (via docToClass / findById) ────────────────────

  describe('parseSessions', () => {
    it('parses legacy scalar dateTime field into a single-session array', async () => {
      // Legacy doc: no sessions array, just a top-level dateTime field
      const legacyDate = new Date('2025-03-01T10:00:00.000Z');
      const data = rawClassData({
        sessions: undefined,
        dateTime: ts(legacyDate),
      });
      // Remove sessions key entirely to simulate legacy doc
      delete (data as Record<string, unknown>).sessions;

      const doc = fakeDoc('legacy-1', data);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('legacy-1');

      expect(result).toBeDefined();
      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].dateTime.toISOString()).toBe(
        '2025-03-01T10:00:00.000Z'
      );
    });

    it('returns empty sessions when both sessions and dateTime are absent', async () => {
      const data = rawClassData({
        sessions: undefined,
        dateTime: undefined,
      });
      delete (data as Record<string, unknown>).sessions;
      delete (data as Record<string, unknown>).dateTime;

      const doc = fakeDoc('no-sessions', data);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('no-sessions');

      expect(result).toBeDefined();
      expect(result!.sessions).toEqual([]);
    });

    it('parses multi-session array and sorts by dateTime', async () => {
      const date1 = new Date('2026-07-10T14:00:00.000Z');
      const date2 = new Date('2026-07-03T10:00:00.000Z');
      const date3 = new Date('2026-07-17T14:00:00.000Z');

      const data = rawClassData({
        sessions: [
          { dateTime: ts(date1) },
          { dateTime: ts(date2) },
          { dateTime: ts(date3) },
        ],
      });

      const doc = fakeDoc('multi-session', data);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('multi-session');

      expect(result!.sessions).toHaveLength(3);
      // Should be sorted chronologically
      expect(result!.sessions[0].dateTime.toISOString()).toBe(
        '2026-07-03T10:00:00.000Z'
      );
      expect(result!.sessions[1].dateTime.toISOString()).toBe(
        '2026-07-10T14:00:00.000Z'
      );
      expect(result!.sessions[2].dateTime.toISOString()).toBe(
        '2026-07-17T14:00:00.000Z'
      );
    });

    it('ignores empty sessions array and falls back to legacy dateTime', async () => {
      const legacyDate = new Date('2025-06-01T09:00:00.000Z');
      const data = rawClassData({
        sessions: [],
        dateTime: ts(legacyDate),
      });

      const doc = fakeDoc('empty-arr', data);
      const mockGet = vi.fn().mockResolvedValue(doc);
      const mockDocFn = vi.fn().mockReturnValue({ get: mockGet });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocFn });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const result = await ClassRepository.findById('empty-arr');

      expect(result!.sessions).toHaveLength(1);
      expect(result!.sessions[0].dateTime.toISOString()).toBe(
        '2025-06-01T09:00:00.000Z'
      );
    });
  });
});
