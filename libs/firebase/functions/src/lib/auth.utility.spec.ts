import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for auth.utility.ts
 *
 * Uses vi.hoisted + vi.mock for proper module mocking with Vitest.
 * @see https://vitest.dev/guide/mocking/modules
 */

// Define mocks using vi.hoisted so they're available in vi.mock factory
const mocks = vi.hoisted(() => {
  return {
    docGet: vi.fn(),
    docSet: vi.fn(),
    docDelete: vi.fn(),
    collectionGet: vi.fn(),
    getDb: vi.fn(),
  };
});

// Mock @maple/firebase/database module
vi.mock('@maple/firebase/database', () => {
  const mockDocRef = {
    get: mocks.docGet,
    set: mocks.docSet,
    delete: mocks.docDelete,
  };

  const mockCollectionRef = {
    doc: vi.fn().mockReturnValue(mockDocRef),
    get: mocks.collectionGet,
  };

  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollectionRef),
  };

  mocks.getDb.mockReturnValue(mockDb);

  return {
    getDb: mocks.getDb,
  };
});

describe('auth.utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    mocks.docGet.mockResolvedValue({ exists: false });
    mocks.collectionGet.mockResolvedValue({ docs: [] });

    // Reset module cache to get fresh imports
    vi.resetModules();
  });

  describe('hasRole', () => {
    it('should call getDb to get Firestore instance', async () => {
      const { hasRole, Role } = await import('./auth.utility');

      await hasRole('test-uid', Role.Admin);

      expect(mocks.getDb).toHaveBeenCalled();
    });

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

  describe('grantAdminRole', () => {
    it('should call getDb and set admin document', async () => {
      const { grantAdminRole } = await import('./auth.utility');

      await grantAdminRole('new-admin-uid', 'granter-uid');

      expect(mocks.getDb).toHaveBeenCalled();
      expect(mocks.docSet).toHaveBeenCalledWith(
        expect.objectContaining({
          grantedBy: 'granter-uid',
        })
      );
    });
  });

  describe('revokeAdminRole', () => {
    it('should call getDb and delete admin document', async () => {
      const { revokeAdminRole } = await import('./auth.utility');

      await revokeAdminRole('admin-uid');

      expect(mocks.getDb).toHaveBeenCalled();
      expect(mocks.docDelete).toHaveBeenCalled();
    });
  });

  describe('getAdminUids', () => {
    it('should return array of admin UIDs', async () => {
      mocks.collectionGet.mockResolvedValue({
        docs: [{ id: 'admin1' }, { id: 'admin2' }],
      });

      const { getAdminUids } = await import('./auth.utility');

      const result = await getAdminUids();

      expect(mocks.getDb).toHaveBeenCalled();
      expect(result).toEqual(['admin1', 'admin2']);
    });
  });

  describe('Role enum', () => {
    it('should export Admin role with correct value', async () => {
      const { Role } = await import('./auth.utility');

      expect(Role.Admin).toBe('admin');
    });
  });
});
