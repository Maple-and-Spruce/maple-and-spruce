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
  MusicTogetherSectionRepository: { create: mocks.create },
}));
// Stub validation so the suite barrel isn't loaded into coverage; the builder's
// .validating() is mocked away, so validation behavior is covered by the suite's
// own spec, not here.
vi.mock('@maple/ts/validation', () => ({ musicTogetherSectionValidation: vi.fn() }));

import './create-music-together-section';

describe('createMusicTogetherSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a section and returns it', async () => {
    const input = { name: 'Spring 2026', capacityFamilies: 8 };
    mocks.create.mockResolvedValue({ id: 'sec-1', ...input });

    const result = (await mocks.capturedHandler!(input)) as {
      section: { id: string };
    };

    expect(mocks.create).toHaveBeenCalledWith(input);
    expect(result.section.id).toBe('sec-1');
  });
});
