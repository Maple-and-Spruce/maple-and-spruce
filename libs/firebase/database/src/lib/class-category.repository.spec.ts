import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
  toDate: (value: unknown): Date => {
    if (value instanceof Date) return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    return new Date(0);
  },
}));

import { ClassCategoryRepository } from './class-category.repository';
import { db } from './utilities/database.config';

/**
 * A minimal in-memory stand-in for one Firestore collection: `doc(id)` gives
 * a ref whose set/update/get read and write the same map, so a write followed
 * by a read goes through the real `docToClassCategory` mapper.
 */
function useFakeCollection(): Map<string, Record<string, unknown>> {
  const store = new Map<string, Record<string, unknown>>();
  let nextId = 0;

  const docRef = (id?: string) => {
    const docId = id ?? `cat-${++nextId}`;
    return {
      id: docId,
      set: vi.fn(async (data: Record<string, unknown>) => {
        store.set(docId, { ...data });
      }),
      update: vi.fn(async (data: Record<string, unknown>) => {
        store.set(docId, { ...(store.get(docId) ?? {}), ...data });
      }),
      get: vi.fn(async () => ({
        id: docId,
        exists: store.has(docId),
        data: () => store.get(docId),
      })),
    };
  };

  vi.mocked(db.collection).mockReturnValue({
    doc: vi.fn(docRef),
  } as unknown as ReturnType<typeof db.collection>);

  return store;
}

describe('ClassCategoryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the material defaults on create and reads them back', async () => {
    const store = useFakeCollection();

    const created = await ClassCategoryRepository.create({
      name: 'Test Weaving',
      order: 0,
      defaultMaterialsIncluded: 'Loom, warp thread, yarn',
      defaultWhatToBring: 'Scissors',
    });

    expect(store.get(created.id)).toMatchObject({
      defaultMaterialsIncluded: 'Loom, warp thread, yarn',
      defaultWhatToBring: 'Scissors',
    });

    const read = await ClassCategoryRepository.findById(created.id);
    expect(read?.defaultMaterialsIncluded).toBe('Loom, warp thread, yarn');
    expect(read?.defaultWhatToBring).toBe('Scissors');
  });

  it('round-trips the material defaults through update', async () => {
    const store = useFakeCollection();
    store.set('cat-x', {
      name: 'Test Pottery',
      order: 10,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const updated = await ClassCategoryRepository.update({
      id: 'cat-x',
      defaultMaterialsIncluded: 'Clay and glazes',
      defaultWhatToBring: 'An apron',
    });

    expect(updated.defaultMaterialsIncluded).toBe('Clay and glazes');
    expect(updated.defaultWhatToBring).toBe('An apron');
  });

  it('can clear a default by writing an empty string', async () => {
    const store = useFakeCollection();
    store.set('cat-y', {
      name: 'Test Jewelry',
      order: 20,
      defaultMaterialsIncluded: 'Wire',
      defaultWhatToBring: 'Reading glasses',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const updated = await ClassCategoryRepository.update({
      id: 'cat-y',
      defaultWhatToBring: '',
    });

    expect(updated.defaultMaterialsIncluded).toBe('Wire');
    expect(updated.defaultWhatToBring).toBe('');
  });

  it('leaves the defaults undefined for a category that never set them', async () => {
    const store = useFakeCollection();
    store.set('cat-z', {
      name: 'Test Dyeing',
      order: 30,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const read = await ClassCategoryRepository.findById('cat-z');
    expect(read?.defaultMaterialsIncluded).toBeUndefined();
    expect(read?.defaultWhatToBring).toBeUndefined();
  });
});
