import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lazy initialization pattern in auth.utility.ts
 *
 * Uses vi.hoisted + vi.mock for proper module mocking with Vitest.
 * @see https://vitest.dev/guide/mocking/modules
 */

// Define mocks using vi.hoisted so they're available in vi.mock factory
const mocks = vi.hoisted(() => {
  return {
    initializeApp: vi.fn(),
    apps: [] as unknown[],
    docGet: vi.fn(),
    docSet: vi.fn(),
    docDelete: vi.fn(),
    collectionGet: vi.fn(),
  };
});

// Mock firebase-admin module
vi.mock('firebase-admin', () => {
  return {
    default: {
      get apps() {
        return mocks.apps;
      },
      initializeApp: mocks.initializeApp,
    },
  };
});

// Mock firebase-admin/firestore module
vi.mock('firebase-admin/firestore', () => {
  const mockDocRef = {
    get: mocks.docGet,
    set: mocks.docSet,
    delete: mocks.docDelete,
  };

  const mockCollectionRef = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    get: mocks.collectionGet,
  };

  const mockFirestore = {
    collection: vi.fn().mockReturnValue(mockCollectionRef),
  };

  return {
    getFirestore: vi.fn().mockReturnValue(mockFirestore),
  };
});

describe('auth.utility', () => {
  beforeEach(() => {
    // Reset mocks and apps array before each test
    vi.clearAllMocks();
    mocks.apps.length = 0;

    // Setup default mock returns
    mocks.docGet.mockResolvedValue({ exists: false });
    mocks.collectionGet.mockResolvedValue({ docs: [] });

    // Reset module cache to get fresh imports
    vi.resetModules();
  });

  describe('lazy initialization', () => {
    it('should initialize admin when hasRole is called', async () => {
      const { hasRole, Role } = await import('./auth.utility');

      await hasRole('test-uid', Role.Admin);

      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('should initialize admin when grantAdminRole is called', async () => {
      const { grantAdminRole } = await import('./auth.utility');

      await grantAdminRole('new-admin-uid', 'granter-uid');

      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('should initialize admin when revokeAdminRole is called', async () => {
      const { revokeAdminRole } = await import('./auth.utility');

      await revokeAdminRole('admin-uid');

      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('should initialize admin when getAdminUids is called', async () => {
      const { getAdminUids } = await import('./auth.utility');

      await getAdminUids();

      expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    });

    it('should not reinitialize if admin is already initialized', async () => {
      // Pre-populate apps array to simulate already initialized
      mocks.apps.push({});

      const { hasRole, grantAdminRole, Role } = await import('./auth.utility');

      // Call multiple functions
      await hasRole('test-uid', Role.Admin);
      await grantAdminRole('new-admin', 'granter');

      // Should not call initializeApp since apps array was not empty
      expect(mocks.initializeApp).not.toHaveBeenCalled();
    });
  });

  describe('hasRole', () => {
    it('should return true when admin document exists', async () => {
      mocks.docGet.mockResolvedValue({ exists: true });

      const { hasRole, Role } = await import('./auth.utility');

      const result = await hasRole('admin-uid', Role.Admin);

      expect(result).toBe(true);
    });

    it('should return false when admin document does not exist', async () => {
      mocks.docGet.mockResolvedValue({ exists: false });

      const { hasRole, Role } = await import('./auth.utility');

      const result = await hasRole('non-admin-uid', Role.Admin);

      expect(result).toBe(false);
    });
  });

  describe('Role enum', () => {
    it('should export Admin role with correct value', async () => {
      const { Role } = await import('./auth.utility');

      expect(Role.Admin).toBe('admin');
    });
  });
});
