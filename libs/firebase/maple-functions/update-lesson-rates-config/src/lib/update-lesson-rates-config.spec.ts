import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ setRateByLength: vi.fn() }));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (m: string) => {
    throw new Error(`invalid-argument: ${m}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRatesConfigRepository: { setRateByLength: mocks.setRateByLength },
}));

import { updateLessonRatesConfig } from './update-lesson-rates-config';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = updateLessonRatesConfig as unknown as Handler;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setRateByLength.mockImplementation((rateByLength) =>
    Promise.resolve({ rateByLength })
  );
});

describe('updateLessonRatesConfig', () => {
  it('keeps positive integer rates and drops invalid/unknown entries', async () => {
    await handler(
      {
        rateByLength: {
          '30-min-full': 4000,
          '45-min': 0, // dropped (non-positive)
          '60-min': 70.5, // dropped (non-integer)
          bogus: 999, // dropped (unknown length)
        },
      },
      { uid: 'uid-katie' }
    );

    expect(mocks.setRateByLength).toHaveBeenCalledWith(
      { '30-min-full': 4000 },
      'uid-katie'
    );
  });

  it('rejects a non-object payload', async () => {
    await expect(
      handler({ rateByLength: null }, { uid: 'u' })
    ).rejects.toThrow(/invalid-argument/);
  });
});
