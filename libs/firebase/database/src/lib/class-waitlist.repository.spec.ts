import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  collectionGet: vi.fn(),
  countGet: vi.fn(),
  count: vi.fn(),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const subDocRef = {
    get: mocks.get,
    set: mocks.set,
  };
  const subCollection = {
    doc: mocks.doc.mockReturnValue(subDocRef),
    get: mocks.collectionGet,
    count: () => ({ get: mocks.countGet }),
  };
  const classDoc = {
    collection: () => subCollection,
  };
  const collection = {
    doc: () => classDoc,
  };
  const db = {
    collection: () => collection,
    batch: () => ({
      delete: mocks.batchDelete,
      set: mocks.batchSet,
      commit: mocks.batchCommit,
    }),
  };
  return {
    getDb: () => db,
    db,
    toDate: (value: unknown): Date => {
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
      return new Date(0);
    },
  };
});

import {
  ClassWaitlistRepository,
  emailKey,
} from './class-waitlist.repository';

describe('emailKey', () => {
  it('lowercases and trims', () => {
    expect(emailKey('  Alice@Example.com  ')).toBe('alice@example.com');
  });
});

describe('ClassWaitlistRepository.add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.doc.mockClear();
    // re-prime since clearAllMocks wipes the implementation
    mocks.doc.mockReturnValue({ get: mocks.get, set: mocks.set });
  });

  it('creates a new entry and returns created=true', async () => {
    mocks.get.mockResolvedValue({ exists: false });
    mocks.set.mockResolvedValue(undefined);

    const result = await ClassWaitlistRepository.add({
      classId: 'class-1',
      email: 'Alice@Example.com',
    });

    expect(result.created).toBe(true);
    expect(result.entry.email).toBe('Alice@Example.com');
    expect(result.entry.id).toBe('alice@example.com');
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.doc).toHaveBeenCalledWith('alice@example.com');
  });

  it('returns existing entry without writing when email already on list', async () => {
    const existingDate = new Date('2026-01-01');
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        email: 'alice@example.com',
        createdAt: existingDate,
      }),
    });

    const result = await ClassWaitlistRepository.add({
      classId: 'class-1',
      email: 'alice@example.com',
    });

    expect(result.created).toBe(false);
    expect(result.entry.createdAt).toEqual(existingDate);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe('ClassWaitlistRepository.findByClassId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps Firestore docs to ClassWaitlistEntry shape', async () => {
    const createdAt = new Date('2026-02-01');
    mocks.collectionGet.mockResolvedValue({
      docs: [
        {
          id: 'alice@example.com',
          exists: true,
          data: () => ({ email: 'alice@example.com', createdAt }),
        },
        {
          id: 'bob@example.com',
          exists: true,
          data: () => ({ email: 'bob@example.com', createdAt }),
        },
      ],
    });

    const result = await ClassWaitlistRepository.findByClassId('class-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'alice@example.com',
      classId: 'class-1',
      email: 'alice@example.com',
      createdAt,
    });
  });

  it('returns empty array when no entries', async () => {
    mocks.collectionGet.mockResolvedValue({ docs: [] });
    const result = await ClassWaitlistRepository.findByClassId('class-1');
    expect(result).toEqual([]);
  });
});

describe('ClassWaitlistRepository.countByClassId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the aggregate count', async () => {
    mocks.countGet.mockResolvedValue({ data: () => ({ count: 7 }) });
    const result = await ClassWaitlistRepository.countByClassId('class-1');
    expect(result).toBe(7);
  });
});

describe('ClassWaitlistRepository.clearByClassId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('batches deletes for every entry and commits', async () => {
    const refA = { id: 'alice@example.com' };
    const refB = { id: 'bob@example.com' };
    mocks.collectionGet.mockResolvedValue({
      empty: false,
      docs: [
        { ref: refA },
        { ref: refB },
      ],
    });
    mocks.batchCommit.mockResolvedValue(undefined);

    await ClassWaitlistRepository.clearByClassId('class-1');

    expect(mocks.batchDelete).toHaveBeenCalledTimes(2);
    expect(mocks.batchDelete).toHaveBeenCalledWith(refA);
    expect(mocks.batchDelete).toHaveBeenCalledWith(refB);
    expect(mocks.batchCommit).toHaveBeenCalledOnce();
  });

  it('does nothing when subcollection is empty', async () => {
    mocks.collectionGet.mockResolvedValue({ empty: true, docs: [] });
    await ClassWaitlistRepository.clearByClassId('class-1');
    expect(mocks.batchDelete).not.toHaveBeenCalled();
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });
});
