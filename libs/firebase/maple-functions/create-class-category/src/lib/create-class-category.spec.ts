import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findByName: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassCategoryRepository: {
    create: mocks.create,
    findByName: mocks.findByName,
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (handler: (data: unknown) => unknown) => handler,
}));

import { createClassCategory } from './create-class-category';

const handler = createClassCategory as unknown as (
  data: Record<string, unknown>
) => Promise<{ category: unknown }>;

describe('createClassCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a category with valid input', async () => {
    mocks.findByName.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ id: '1', name: 'Fiber Arts', order: 0 });

    const result = await handler({ name: 'Fiber Arts', order: 0 });

    expect(result.category).toEqual({ id: '1', name: 'Fiber Arts', order: 0 });
    expect(mocks.create).toHaveBeenCalledWith({ name: 'Fiber Arts', order: 0 });
  });

  it('throws on duplicate name', async () => {
    mocks.findByName.mockResolvedValue({ id: '1', name: 'Fiber Arts' });

    await expect(
      handler({ name: 'Fiber Arts', order: 0 })
    ).rejects.toThrow('already exists');
  });

  it('throws on validation failure', async () => {
    await expect(handler({ name: '', order: 0 })).rejects.toThrow(
      'Validation failed'
    );
  });
});
