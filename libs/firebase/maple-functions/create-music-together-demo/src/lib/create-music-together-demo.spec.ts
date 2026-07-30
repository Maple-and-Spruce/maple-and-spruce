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
  return { Functions: { endpoint }, Role: { Admin: 'admin', MtTeacher: 'mt-teacher' } };
});
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: { create: mocks.create },
}));
vi.mock('@maple/ts/validation', () => ({ musicTogetherDemoValidation: vi.fn() }));

import './create-music-together-demo';

describe('createMusicTogetherDemo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a demo and returns it', async () => {
    const input = {
      dateTime: new Date('2030-08-03T14:00:00Z'),
      location: 'Library',
      capacityFamilies: 8,
      visible: true,
    };
    mocks.create.mockResolvedValue({ id: 'demo-1', ...input });

    const result = (await mocks.capturedHandler!(input)) as {
      demo: { id: string };
    };

    expect(mocks.create).toHaveBeenCalledWith(input);
    expect(result.demo.id).toBe('demo-1');
  });
});
