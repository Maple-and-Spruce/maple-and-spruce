import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  hasClasses: vi.fn(),
  deleteFn: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassCategoryRepository: {
    findById: mocks.findById,
    hasClasses: mocks.hasClasses,
    delete: mocks.deleteFn,
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (handler: (data: unknown) => unknown) => handler,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
}));

import { deleteClassCategory } from './delete-class-category';

const handler = deleteClassCategory as unknown as (
  data: { id: string }
) => Promise<{ success: boolean }>;

describe('deleteClassCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a category with no classes', async () => {
    mocks.findById.mockResolvedValue({ id: '1', name: 'Fiber Arts' });
    mocks.hasClasses.mockResolvedValue(false);

    const result = await handler({ id: '1' });

    expect(result.success).toBe(true);
    expect(mocks.deleteFn).toHaveBeenCalledWith('1');
  });

  it('throws if category has classes', async () => {
    mocks.findById.mockResolvedValue({ id: '1', name: 'Fiber Arts' });
    mocks.hasClasses.mockResolvedValue(true);

    await expect(handler({ id: '1' })).rejects.toThrow(
      'Cannot delete category'
    );
  });

  it('throws if category not found', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(handler({ id: 'nope' })).rejects.toThrow('not found');
  });
});
