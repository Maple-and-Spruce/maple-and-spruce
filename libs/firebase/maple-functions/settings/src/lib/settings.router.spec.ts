import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setInstruments: vi.fn(),
  getLessonRates: vi.fn(),
  setRateByLength: vi.fn(),
  getBusinessPayment: vi.fn(),
  setVenmoHandle: vi.fn(),
  getPosLesson: vi.fn(),
  setLessonCatalogObjectIds: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, m: string) {
      super(m);
    }
  }
  // Each route records the roles it was gated on and its handler.
  const endpoint = {
    requiringRole: (roles: unknown) => ({
      asRoute: (handler: unknown) => ({ roles, handler }),
    }),
  };
  return {
    Functions: {
      endpoint,
      router: (_name: string, routes: unknown) => routes,
    },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  InstrumentsConfigRepository: {
    get: mocks.get,
    setInstruments: mocks.setInstruments,
  },
  LessonRatesConfigRepository: {
    get: mocks.getLessonRates,
    setRateByLength: mocks.setRateByLength,
  },
  BusinessPaymentConfigRepository: {
    get: mocks.getBusinessPayment,
    setVenmoHandle: mocks.setVenmoHandle,
  },
  PosLessonConfigRepository: {
    get: mocks.getPosLesson,
    setLessonCatalogObjectIds: mocks.setLessonCatalogObjectIds,
  },
}));

import { settings } from './settings.router';

type Route = {
  roles: unknown;
  handler: (data: unknown, context: unknown) => Promise<unknown>;
};
const routes = settings as unknown as Record<string, Route>;

const instruments = [
  { key: 'violin', label: 'Violin' },
  { key: 'harp', label: 'Harp' },
];

describe('settings router (#161)', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getInstruments', () => {
    it('is open to teachers, who add and edit students too', () => {
      expect(routes['getInstruments'].roles).toEqual(['admin', 'lesson-teacher']);
    });

    it('returns the configured list', async () => {
      mocks.get.mockResolvedValue({ instruments });

      await expect(routes['getInstruments'].handler({}, {})).resolves.toEqual({
        instruments,
      });
    });
  });

  describe('saveInstruments', () => {
    it('is admin only', () => {
      expect(routes['saveInstruments'].roles).toBe('admin');
    });

    it('saves a valid list, trimmed, and returns what was stored', async () => {
      mocks.setInstruments.mockResolvedValue({ instruments });

      const result = await routes['saveInstruments'].handler(
        {
          instruments: [
            { key: 'violin', label: ' Violin ' },
            { key: 'harp', label: 'Harp' },
          ],
        },
        { uid: 'admin-1' }
      );

      expect(mocks.setInstruments).toHaveBeenCalledWith(instruments, 'admin-1');
      expect(result).toEqual({ instruments });
    });

    it('refuses an empty list', async () => {
      await expect(
        routes['saveInstruments'].handler({ instruments: [] }, {})
      ).rejects.toThrow('Keep at least one instrument.');
      expect(mocks.setInstruments).not.toHaveBeenCalled();
    });

    it('refuses a duplicate', async () => {
      await expect(
        routes['saveInstruments'].handler(
          {
            instruments: [
              { key: 'violin', label: 'Violin' },
              { key: 'violin', label: 'Violin again' },
            ],
          },
          {}
        )
      ).rejects.toThrow(/twice/);
    });

    it('refuses a request with no list at all', async () => {
      await expect(routes['saveInstruments'].handler(undefined, {})).rejects.toThrow(
        'Keep at least one instrument.'
      );
    });
  });
});

/**
 * The singleton app-config pairs moved here from their own functions (#156).
 * Each keeps the admin-only gate its function had under createAdminFunction.
 */
describe('settings router: app-config routes (#156)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    'getLessonRatesConfig',
    'updateLessonRatesConfig',
    'getBusinessPaymentConfig',
    'updateBusinessPaymentConfig',
    'getPosLessonConfig',
    'updatePosLessonConfig',
  ])('%s is admin only', (route) => {
    expect(routes[route].roles).toBe('admin');
  });

  describe('lesson rates', () => {
    it('returns the stored config', async () => {
      const config = { rateByLength: { '30-min-full': 4000 } };
      mocks.getLessonRates.mockResolvedValue(config);

      await expect(
        routes['getLessonRatesConfig'].handler({}, {})
      ).resolves.toEqual({ config });
    });

    it('keeps positive integer rates and drops invalid or unknown entries', async () => {
      mocks.setRateByLength.mockImplementation((rateByLength) =>
        Promise.resolve({ rateByLength })
      );

      const result = await routes['updateLessonRatesConfig'].handler(
        {
          rateByLength: {
            '30-min-full': 4000,
            '45-min': 0, // non-positive
            '60-min': 70.5, // non-integer
            bogus: 999, // not a lesson length
          },
        },
        { uid: 'admin-1' }
      );

      expect(mocks.setRateByLength).toHaveBeenCalledWith(
        { '30-min-full': 4000 },
        'admin-1'
      );
      expect(result).toEqual({
        config: { rateByLength: { '30-min-full': 4000 } },
      });
    });

    it('refuses a payload with no rate map', async () => {
      await expect(
        routes['updateLessonRatesConfig'].handler({ rateByLength: null }, {})
      ).rejects.toThrow('rateByLength must be an object');
      await expect(
        routes['updateLessonRatesConfig'].handler(undefined, {})
      ).rejects.toThrow('rateByLength must be an object');
      expect(mocks.setRateByLength).not.toHaveBeenCalled();
    });
  });

  describe('business payment (Venmo handle)', () => {
    it('returns the stored config', async () => {
      const config = { venmoHandle: 'Studio-Handle' };
      mocks.getBusinessPayment.mockResolvedValue(config);

      await expect(
        routes['getBusinessPaymentConfig'].handler({}, {})
      ).resolves.toEqual({ config });
    });

    it('stores the handle trimmed and without a leading @', async () => {
      mocks.setVenmoHandle.mockResolvedValue({ venmoHandle: 'Studio-Handle' });

      const result = await routes['updateBusinessPaymentConfig'].handler(
        { venmoHandle: '  @Studio-Handle ' },
        { uid: 'admin-1' }
      );

      expect(mocks.setVenmoHandle).toHaveBeenCalledWith(
        'Studio-Handle',
        'admin-1'
      );
      expect(result).toEqual({ config: { venmoHandle: 'Studio-Handle' } });
    });

    it('clears the handle when it is empty', async () => {
      mocks.setVenmoHandle.mockResolvedValue({});

      await routes['updateBusinessPaymentConfig'].handler(
        { venmoHandle: '' },
        { uid: 'admin-1' }
      );

      expect(mocks.setVenmoHandle).toHaveBeenCalledWith(undefined, 'admin-1');
    });

    it.each(['abc', 'has space here', 'x'.repeat(31)])(
      'refuses %j',
      async (venmoHandle) => {
        await expect(
          routes['updateBusinessPaymentConfig'].handler({ venmoHandle }, {})
        ).rejects.toThrow(/Venmo handle must be 5–30 characters/);
        expect(mocks.setVenmoHandle).not.toHaveBeenCalled();
      }
    );
  });

  describe('POS lesson catalog ids', () => {
    it('returns the stored config', async () => {
      const config = { lessonCatalogObjectIds: ['ITEM_1'] };
      mocks.getPosLesson.mockResolvedValue(config);

      await expect(
        routes['getPosLessonConfig'].handler({}, {})
      ).resolves.toEqual({ config });
    });

    it('trims, drops blanks and non-strings, and de-dupes', async () => {
      mocks.setLessonCatalogObjectIds.mockImplementation((ids) =>
        Promise.resolve({ lessonCatalogObjectIds: ids })
      );

      const result = await routes['updatePosLessonConfig'].handler(
        { lessonCatalogObjectIds: [' ITEM_1 ', 'ITEM_2', 'ITEM_1', '', 7] },
        { uid: 'admin-1' }
      );

      expect(mocks.setLessonCatalogObjectIds).toHaveBeenCalledWith(
        ['ITEM_1', 'ITEM_2'],
        'admin-1'
      );
      expect(result).toEqual({
        config: { lessonCatalogObjectIds: ['ITEM_1', 'ITEM_2'] },
      });
    });

    it('refuses a payload that is not a list', async () => {
      await expect(
        routes['updatePosLessonConfig'].handler(
          { lessonCatalogObjectIds: 'ITEM_1' },
          {}
        )
      ).rejects.toThrow('lessonCatalogObjectIds must be an array');
      expect(mocks.setLessonCatalogObjectIds).not.toHaveBeenCalled();
    });
  });
});
