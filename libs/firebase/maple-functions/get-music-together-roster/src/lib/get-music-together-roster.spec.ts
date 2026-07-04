import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  sectionFindById: vi.fn(),
  regFindBySectionId: vi.fn(),
  chargesFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (h: unknown) => h,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
}));
vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: { findById: mocks.sectionFindById },
  MusicTogetherRegistrationRepository: {
    findBySectionId: mocks.regFindBySectionId,
  },
  MusicTogetherScheduledChargeRepository: { findAll: mocks.chargesFindAll },
}));

import { getMusicTogetherRoster } from './get-music-together-roster';

const handler = getMusicTogetherRoster as unknown as (
  d: unknown,
  c?: unknown
) => Promise<{ section: unknown; entries: { registration: { id: string }; charges: unknown[]; pastDue: boolean }[] }>;

describe('getMusicTogetherRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sectionFindById.mockResolvedValue({ id: 'sec-1', name: 'Spring' });
  });

  it('groups charges under each registration and flags past-due', async () => {
    mocks.regFindBySectionId.mockResolvedValue([
      { id: 'reg-1' },
      { id: 'reg-2' },
    ]);
    mocks.chargesFindAll.mockResolvedValue([
      { id: 'c1', registrationId: 'reg-1', status: 'scheduled' },
      { id: 'c2', registrationId: 'reg-1', status: 'failed' },
      { id: 'c3', registrationId: 'reg-2', status: 'paid' },
    ]);

    const result = await handler({ sectionId: 'sec-1' }, {});

    expect(mocks.chargesFindAll).toHaveBeenCalledWith({ sectionId: 'sec-1' });
    const reg1 = result.entries.find((e) => e.registration.id === 'reg-1')!;
    const reg2 = result.entries.find((e) => e.registration.id === 'reg-2')!;
    expect(reg1.charges).toHaveLength(2);
    expect(reg1.pastDue).toBe(true); // has a failed charge
    expect(reg2.pastDue).toBe(false);
  });

  it('handles a registration with no charges (full pay)', async () => {
    mocks.regFindBySectionId.mockResolvedValue([{ id: 'reg-1' }]);
    mocks.chargesFindAll.mockResolvedValue([]);
    const result = await handler({ sectionId: 'sec-1' }, {});
    expect(result.entries[0].charges).toEqual([]);
    expect(result.entries[0].pastDue).toBe(false);
  });

  it('requires a section id', async () => {
    await expect(handler({}, {})).rejects.toThrow(/required/i);
  });

  it('404s an unknown section', async () => {
    mocks.sectionFindById.mockResolvedValue(undefined);
    await expect(handler({ sectionId: 'nope' }, {})).rejects.toThrow(/not found/i);
    expect(mocks.regFindBySectionId).not.toHaveBeenCalled();
  });
});
