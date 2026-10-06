import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  setInstruments: vi.fn(),
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
