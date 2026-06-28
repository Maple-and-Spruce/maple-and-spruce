import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  hasErrors: false,
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (h: unknown) => h,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));
vi.mock('@maple/ts/validation', () => ({
  musicTogetherSectionValidation: () => ({
    hasErrors: () => mocks.hasErrors,
    getErrors: () => ({ name: ['bad'] }),
  }),
}));

import { updateMusicTogetherSection } from './update-music-together-section';

const handler = updateMusicTogetherSection as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ section: unknown }>;

describe('updateMusicTogetherSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasErrors = false;
    mocks.findById.mockResolvedValue({ id: 'sec-1', name: 'Old', capacityFamilies: 8 });
    mocks.update.mockImplementation(async (d) => ({ id: 'sec-1', ...d }));
  });

  it('updates an existing section', async () => {
    const result = await handler({ id: 'sec-1', name: 'New' }, {});
    expect(mocks.update).toHaveBeenCalledWith({ id: 'sec-1', name: 'New' });
    expect(result.section).toMatchObject({ id: 'sec-1', name: 'New' });
  });

  it('404s an unknown section', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(handler({ id: 'nope', name: 'X' }, {})).rejects.toThrow(/not found/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects when the merged record fails validation', async () => {
    mocks.hasErrors = true;
    await expect(
      handler({ id: 'sec-1', name: '' }, {})
    ).rejects.toThrow(/Validation failed/);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
