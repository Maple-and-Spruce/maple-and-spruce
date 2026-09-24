import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lazy initialization pattern in database.config.ts
 *
 * Uses vi.hoisted + vi.mock for proper module mocking with Vitest.
 * @see https://vitest.dev/guide/mocking/modules
 */

// Define mocks using vi.hoisted so they're available in vi.mock factory
const mocks = vi.hoisted(() => {
  return {
    initializeApp: vi.fn(),
    firestore: vi.fn(),
    firestoreSettings: vi.fn(),
    apps: [] as unknown[],
  };
});

// Mock the modular firebase-admin entry points (firebase-admin 14 dropped the
// namespaced `admin.firestore()` / `admin.apps` default export).
vi.mock('firebase-admin/app', () => ({
  getApps: () => mocks.apps,
  initializeApp: mocks.initializeApp,
}));

vi.mock('firebase-admin/firestore', () => {
  const mockFirestoreInstance = {
    collection: vi.fn(),
    settings: mocks.firestoreSettings,
  };

  mocks.firestore.mockReturnValue(mockFirestoreInstance);

  return {
    getFirestore: mocks.firestore,
  };
});

describe('database.config', () => {
  beforeEach(() => {
    // Reset mocks and apps array before each test
    vi.clearAllMocks();
    mocks.apps.length = 0;

    // The transport is read from the environment, so a test that sets one of
    // these must not leak it into the next.
    delete process.env['FIRESTORE_EMULATOR_HOST'];
    delete process.env['FIRESTORE_PREFER_REST'];

    // Reset module cache to get fresh imports
    vi.resetModules();
  });

  describe('getDb', () => {
    it('should initialize Firebase Admin on first call', async () => {
      const { getDb } = await import('./database.config');

      // Call getDb
      getDb();

      // Admin should be initialized
      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
      expect(mocks.firestore).toHaveBeenCalledTimes(1);
    });

    it('should return the same instance on subsequent calls', async () => {
      const { getDb } = await import('./database.config');

      const db1 = getDb();
      const db2 = getDb();
      const db3 = getDb();

      // Should return same instance
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);

      // Should only initialize once
      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
      expect(mocks.firestore).toHaveBeenCalledTimes(1);
    });

    it('should apply Firestore settings with preferRest: true', async () => {
      const { getDb } = await import('./database.config');

      getDb();

      expect(mocks.firestoreSettings).toHaveBeenCalledWith({
        ignoreUndefinedProperties: true,
        preferRest: true,
      });
    });

    /**
     * The transport is not cosmetic: gRPC and REST report the same Firestore
     * failures with different shapes, and a guard written against one is green
     * while broken on the other. That is how #100 and #117 both shipped, so the
     * choice each environment makes is pinned here.
     */
    describe('which transport each environment gets', () => {
      it('prefers gRPC under the emulator, which is faster locally', async () => {
        process.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8080';
        const { getDb } = await import('./database.config');
        getDb();
        expect(mocks.firestoreSettings).toHaveBeenCalledWith(
          expect.objectContaining({ preferRest: false })
        );
      });

      it('lets a test force REST, the transport dev and prod run on', async () => {
        // The integration harness sets this, so the suites exercise the shapes
        // production actually produces rather than the emulator's.
        process.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8080';
        process.env['FIRESTORE_PREFER_REST'] = '1';
        const { getDb } = await import('./database.config');
        getDb();
        expect(mocks.firestoreSettings).toHaveBeenCalledWith(
          expect.objectContaining({ preferRest: true })
        );
      });

      it('lets it be forced off too, for bisecting a transport-specific failure', async () => {
        process.env['FIRESTORE_PREFER_REST'] = '0';
        const { getDb } = await import('./database.config');
        getDb();
        expect(mocks.firestoreSettings).toHaveBeenCalledWith(
          expect.objectContaining({ preferRest: false })
        );
      });
    });

    it('should apply settings only once across multiple calls', async () => {
      const { getDb } = await import('./database.config');

      getDb();
      getDb();
      getDb();

      expect(mocks.firestoreSettings).toHaveBeenCalledTimes(1);
    });

    it('should not reinitialize if admin is already initialized', async () => {
      // Pre-populate apps array to simulate already initialized
      mocks.apps.push({});

      const { getDb } = await import('./database.config');

      getDb();

      // Should not call initializeApp since apps array is not empty
      expect(mocks.initializeApp).not.toHaveBeenCalled();
      // Should still create firestore instance
      expect(mocks.firestore).toHaveBeenCalledTimes(1);
    });
  });

  describe('db (proxy for backwards compatibility)', () => {
    it('should lazily initialize when collection method is accessed', async () => {
      const { db } = await import('./database.config');

      // Access collection through the proxy
      db.collection('test');

      // Should have triggered initialization
      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
      expect(mocks.firestore).toHaveBeenCalledTimes(1);
    });

    it('should return the same underlying db instance as getDb', async () => {
      const { db, getDb } = await import('./database.config');

      // Access through proxy first
      db.collection('test');

      // Get via getter
      const dbFromGetter = getDb();

      // Both should have triggered only one initialization
      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
      expect(mocks.firestore).toHaveBeenCalledTimes(1);

      // The proxy should delegate to the same instance
      // (We can't directly compare since proxy wraps it, but initialization count confirms sharing)
    });

    it('should return non-function properties directly', async () => {
      const { db } = await import('./database.config');

      // Access a made-up property to exercise the proxy's non-function return path (line 119)
      const val = (db as unknown as Record<string, unknown>)['nonExistentProp'];

      // Should have triggered initialization via the proxy
      expect(mocks.firestore).toHaveBeenCalledTimes(1);
      // Non-existent property returns undefined
      expect(val).toBeUndefined();
    });
  });

  describe('toDate', () => {
    it('returns fallback for null', async () => {
      const { toDate } = await import('./database.config');
      const fallback = new Date('2025-01-01');
      expect(toDate(null, fallback)).toBe(fallback);
    });

    it('returns fallback for undefined', async () => {
      const { toDate } = await import('./database.config');
      const fallback = new Date('2025-01-01');
      expect(toDate(undefined, fallback)).toBe(fallback);
    });

    it('converts Firestore Timestamp (object with toDate method)', async () => {
      const { toDate } = await import('./database.config');
      const expected = new Date('2025-06-15T10:00:00Z');
      const timestamp = { toDate: () => expected };
      expect(toDate(timestamp)).toBe(expected);
    });

    it('returns Date instances as-is', async () => {
      const { toDate } = await import('./database.config');
      const date = new Date('2025-06-15T10:00:00Z');
      expect(toDate(date)).toBe(date);
    });

    it('parses valid ISO string', async () => {
      const { toDate } = await import('./database.config');
      const result = toDate('2025-06-15T10:00:00Z');
      expect(result.toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    it('parses valid numeric timestamp', async () => {
      const { toDate } = await import('./database.config');
      const ts = new Date('2025-06-15T10:00:00Z').getTime();
      const result = toDate(ts);
      expect(result.toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    it('returns fallback for invalid string', async () => {
      const { toDate } = await import('./database.config');
      const fallback = new Date('2025-01-01');
      expect(toDate('not-a-date', fallback)).toBe(fallback);
    });

    it('returns fallback for unrecognized types (object without toDate)', async () => {
      const { toDate } = await import('./database.config');
      const fallback = new Date('2025-01-01');
      expect(toDate({ foo: 'bar' }, fallback)).toBe(fallback);
    });

    it('uses default fallback (current date) when none provided', async () => {
      const { toDate } = await import('./database.config');
      const before = Date.now();
      const result = toDate(null);
      const after = Date.now();
      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });
});
