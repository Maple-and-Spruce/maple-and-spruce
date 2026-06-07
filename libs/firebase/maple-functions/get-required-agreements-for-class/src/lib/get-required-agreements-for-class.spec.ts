import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for getRequiredAgreementsForClass
 *
 * Verifies the public function correctly returns required-at-checkout
 * agreement templates for a given class's category.
 */

const mocks = vi.hoisted(() => ({
  classFindById: vi.fn(),
  findRequiredForCategory: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
  },
  AgreementTemplateRepository: {
    findRequiredForCategory: mocks.findRequiredForCategory,
  },
}));

// Mock firebase/functions — the Functions.endpoint chain returns the
// handler directly so the test can invoke it without spinning up the
// Functions request machinery.
vi.mock('@maple/firebase/functions', () => {
  const chain = {
    withOptions: () => chain,
    handle: (handler: (data: unknown) => unknown) => handler,
  };
  return { Functions: { endpoint: chain } };
});

import { getRequiredAgreementsForClass } from './get-required-agreements-for-class';

// The export is the handler function itself (handle() mock returns it)
const handler = getRequiredAgreementsForClass as unknown as (
  data: { classId?: string }
) => Promise<{ agreements: unknown[] }>;

describe('getRequiredAgreementsForClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if classId is not provided', async () => {
    await expect(handler({})).rejects.toThrow('Class ID is required');
  });

  it('throws if class is not found', async () => {
    mocks.classFindById.mockResolvedValue(undefined);
    await expect(handler({ classId: 'nonexistent' })).rejects.toThrow(
      'Class not found'
    );
  });

  it('returns empty array if class has no categoryId', async () => {
    mocks.classFindById.mockResolvedValue({ id: 'c1', name: 'Test Class' });

    const result = await handler({ classId: 'c1' });

    expect(result.agreements).toEqual([]);
    expect(mocks.findRequiredForCategory).not.toHaveBeenCalled();
  });

  it('returns empty array if no required templates match', async () => {
    mocks.classFindById.mockResolvedValue({
      id: 'c1',
      name: 'Test Class',
      categoryId: 'cat1',
    });
    mocks.findRequiredForCategory.mockResolvedValue([]);

    const result = await handler({ classId: 'c1' });

    expect(result.agreements).toEqual([]);
    expect(mocks.findRequiredForCategory).toHaveBeenCalledWith('cat1');
  });

  it('returns template summaries for required templates', async () => {
    mocks.classFindById.mockResolvedValue({
      id: 'c1',
      name: 'Stained Glass',
      categoryId: 'cat1',
    });
    mocks.findRequiredForCategory.mockResolvedValue([
      {
        id: 't1',
        name: 'Safety Waiver',
        sections: [{ id: 's1', title: 'Liability', content: '<p>Terms</p>' }],
        supportsMinor: true,
        // Extra fields should not leak through
        version: 3,
        status: 'active',
        classCategoryIds: ['cat1'],
      },
    ]);

    const result = await handler({ classId: 'c1' });

    expect(result.agreements).toEqual([
      {
        templateId: 't1',
        templateName: 'Safety Waiver',
        sections: [{ id: 's1', title: 'Liability', content: '<p>Terms</p>' }],
        supportsMinor: true,
      },
    ]);
  });
});
