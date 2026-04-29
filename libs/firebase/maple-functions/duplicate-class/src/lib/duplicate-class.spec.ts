import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Class, CreateClassInput } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  classCreate: vi.fn(),
}));

vi.mock('@maple/firebase/functions', async () => {
  const actual = await vi.importActual<typeof import('@maple/firebase/functions')>(
    '@maple/firebase/functions'
  );
  return {
    ...actual,
    createAdminFunction: <TReq, TRes>(
      handler: (data: TReq, ctx: unknown) => Promise<TRes>
    ) => handler,
  };
});

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
    create: mocks.classCreate,
  },
}));

import { duplicateClass } from './duplicate-class';

type Handler = (
  data: { sourceClassId: string },
  ctx?: unknown
) => Promise<{ class: Class }>;
const handler = duplicateClass as unknown as Handler;

const sourceClass: Class = {
  id: 'class-source',
  name: 'Hand-Building Pottery',
  description: 'Coil and slab construction techniques.',
  shortDescription: 'No wheel required.',
  instructorId: 'instr-katie',
  sessions: [
    { dateTime: new Date('2026-06-01T10:00:00Z') },
    { dateTime: new Date('2026-06-08T10:00:00Z') },
  ],
  durationMinutes: 120,
  registrationClosesAt: new Date('2026-05-30T23:59:00Z'),
  capacity: 8,
  priceCents: 6500,
  imageUrl: 'https://storage.example.com/hero.jpg',
  galleryImages: [
    { url: 'https://storage.example.com/g1.jpg', alt: 'Hands shaping clay' },
    { url: 'https://storage.example.com/g2.jpg', alt: 'Bowls drying' },
  ],
  categoryId: 'cat-pottery',
  skillLevel: 'beginner',
  status: 'published',
  location: 'Maple & Spruce Studio',
  materialsIncluded: 'Clay, glazes, firing',
  whatToBring: 'Apron and a curious mind',
  minimumAge: 12,
  webflowItemId: 'webflow-original-id',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

describe('duplicateClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing sourceClassId', async () => {
    await expect(handler({ sourceClassId: '' })).rejects.toThrow(HttpsError);
    expect(mocks.classFindById).not.toHaveBeenCalled();
  });

  it('throws not-found when the source class does not exist', async () => {
    mocks.classFindById.mockResolvedValue(undefined);
    await expect(
      handler({ sourceClassId: 'nope' })
    ).rejects.toThrow(HttpsError);
    expect(mocks.classCreate).not.toHaveBeenCalled();
  });

  it('clones the source class with a (Copy) suffix, draft status, and empty sessions', async () => {
    mocks.classFindById.mockResolvedValue(sourceClass);
    mocks.classCreate.mockImplementation(async (input: CreateClassInput) => ({
      ...input,
      id: 'class-copy-id',
      createdAt: new Date('2026-04-28T00:00:00Z'),
      updatedAt: new Date('2026-04-28T00:00:00Z'),
    }));

    const result = await handler({ sourceClassId: 'class-source' });

    expect(mocks.classCreate).toHaveBeenCalledTimes(1);
    const created = mocks.classCreate.mock.calls[0][0] as CreateClassInput;

    expect(created.name).toBe('Hand-Building Pottery (Copy)');
    expect(created.status).toBe('draft');
    expect(created.sessions).toEqual([]);
    expect(created.registrationClosesAt).toBeUndefined();

    // webflowItemId should not appear on CreateClassInput at all
    expect((created as unknown as Record<string, unknown>)['webflowItemId']).toBeUndefined();

    // Cloned fields preserved
    expect(created.description).toBe(sourceClass.description);
    expect(created.shortDescription).toBe(sourceClass.shortDescription);
    expect(created.instructorId).toBe(sourceClass.instructorId);
    expect(created.durationMinutes).toBe(sourceClass.durationMinutes);
    expect(created.capacity).toBe(sourceClass.capacity);
    expect(created.priceCents).toBe(sourceClass.priceCents);
    expect(created.imageUrl).toBe(sourceClass.imageUrl);
    expect(created.categoryId).toBe(sourceClass.categoryId);
    expect(created.skillLevel).toBe(sourceClass.skillLevel);
    expect(created.location).toBe(sourceClass.location);
    expect(created.materialsIncluded).toBe(sourceClass.materialsIncluded);
    expect(created.whatToBring).toBe(sourceClass.whatToBring);
    expect(created.minimumAge).toBe(sourceClass.minimumAge);

    // Gallery URLs are deep-copied (not aliased) so future edits to the
    // copy don't mutate the source's array, but the URL strings themselves
    // are reused — the same Firebase Storage files back both classes.
    expect(created.galleryImages).toEqual(sourceClass.galleryImages);
    expect(created.galleryImages).not.toBe(sourceClass.galleryImages);

    expect(result.class.id).toBe('class-copy-id');
    expect(result.class.name).toBe('Hand-Building Pottery (Copy)');
    expect(result.class.status).toBe('draft');
  });

  it('handles a source class with no gallery images', async () => {
    mocks.classFindById.mockResolvedValue({
      ...sourceClass,
      galleryImages: undefined,
    });
    mocks.classCreate.mockImplementation(async (input: CreateClassInput) => ({
      ...input,
      id: 'class-copy-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await handler({ sourceClassId: 'class-source' });

    const created = mocks.classCreate.mock.calls[0][0] as CreateClassInput;
    expect(created.galleryImages).toBeUndefined();
  });
});
