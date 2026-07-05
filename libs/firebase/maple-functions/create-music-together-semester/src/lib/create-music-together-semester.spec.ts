import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as ((d: unknown) => Promise<unknown>) | null,
  create: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    requiringRole: vi.fn(() => endpoint),
    validating: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock-fn';
    }),
  };
  return { Functions: { endpoint }, Role: { Admin: 'admin' } };
});
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSemesterRepository: { create: mocks.create },
}));
vi.mock('@maple/ts/validation', () => ({ musicTogetherSemesterValidation: vi.fn() }));

import './create-music-together-semester';

describe('createMusicTogetherSemester', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a semester and returns it', async () => {
    const input = { name: 'Fall 2026', season: 'fall', year: 2026, status: 'planned' };
    mocks.create.mockResolvedValue({ id: 'sem-1', ...input });

    const result = (await mocks.capturedHandler!(input)) as {
      semester: { id: string };
    };

    expect(mocks.create).toHaveBeenCalledWith(input);
    expect(result.semester.id).toBe('sem-1');
  });
});
