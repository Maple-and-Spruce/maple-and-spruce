import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for auth.utility.ts
 *
 * Uses vi.hoisted + vi.mock for proper module mocking with Vitest.
 * The Firestore mock routes by collection name so admin checks
 * (`admins/{uid}`) and scoped-role checks (`userRoles/{uid}`) can be
 * configured independently.
 * @see https://vitest.dev/guide/mocking/modules
 */

// Define mocks using vi.hoisted so they're available in vi.mock factory
const mocks = vi.hoisted(() => {
  return {
    // admins/{uid}
    adminDocGet: vi.fn(),
    adminDocSet: vi.fn(),
    adminDocDelete: vi.fn(),
    adminCollectionGet: vi.fn(),
    // userRoles/{uid}
    userRolesDocGet: vi.fn(),
    userRolesDocSet: vi.fn(),
    getDb: vi.fn(),
  };
});

// Mock @maple/firebase/database module
vi.mock('@maple/firebase/database', () => {
  const adminDocRef = {
    get: mocks.adminDocGet,
    set: mocks.adminDocSet,
    delete: mocks.adminDocDelete,
  };
  const userRolesDocRef = {
    get: mocks.userRolesDocGet,
    set: mocks.userRolesDocSet,
  };

  const mockDb = {
    collection: vi.fn((name: string) =>
      name === 'userRoles'
        ? { doc: vi.fn().mockReturnValue(userRolesDocRef) }
        : {
            doc: vi.fn().mockReturnValue(adminDocRef),
            get: mocks.adminCollectionGet,
          }
    ),
  };

  mocks.getDb.mockReturnValue(mockDb);

  return {
    getDb: mocks.getDb,
  };
});

// FieldValue sentinels — assertions only need stable identities
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
    arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  },
}));

describe('auth.utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    mocks.adminDocGet.mockResolvedValue({ exists: false });
    mocks.userRolesDocGet.mockResolvedValue({ exists: false });
    mocks.adminCollectionGet.mockResolvedValue({ docs: [] });

    // Reset module cache to get fresh imports
    vi.resetModules();
  });

  /** Configure the userRoles/{uid} doc returned by the mock */
  function setUserRolesDoc(roles: unknown): void {
    mocks.userRolesDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ roles }),
    });
  }

  describe('hasRole', () => {
    it('should call getDb to get Firestore instance', async () => {
      const { hasRole, Role } = await import('./auth.utility');

      await hasRole('test-uid', Role.Admin);

      expect(mocks.getDb).toHaveBeenCalled();
    });

    it('should return true when admin document exists', async () => {
      mocks.adminDocGet.mockResolvedValue({ exists: true });

      const { hasRole, Role } = await import('./auth.utility');

      const result = await hasRole('admin-uid', Role.Admin);

      expect(result).toBe(true);
    });

    it('should return false when admin document does not exist', async () => {
      mocks.adminDocGet.mockResolvedValue({ exists: false });

      const { hasRole, Role } = await import('./auth.utility');

      const result = await hasRole('non-admin-uid', Role.Admin);

      expect(result).toBe(false);
    });

    it('resolves scoped roles from the userRoles doc, not admins', async () => {
      setUserRolesDoc(['mt-teacher']);

      const { hasRole, Role } = await import('./auth.utility');

      expect(await hasRole('stephanie-uid', Role.MtTeacher)).toBe(true);
      expect(await hasRole('stephanie-uid', Role.Clerk)).toBe(false);
      expect(mocks.adminDocGet).not.toHaveBeenCalled();
    });

    it('returns false for a scoped role when no userRoles doc exists', async () => {
      const { hasRole, Role } = await import('./auth.utility');

      expect(await hasRole('nobody-uid', Role.Clerk)).toBe(false);
    });

    it('ignores unknown strings stored in the roles array', async () => {
      setUserRolesDoc(['superuser', 42, 'clerk']);

      const { hasRole, Role } = await import('./auth.utility');

      expect(await hasRole('nathan-uid', Role.Clerk)).toBe(true);
      expect(await hasRole('nathan-uid', Role.MtTeacher)).toBe(false);
    });

    it('tolerates a malformed roles field (not an array)', async () => {
      setUserRolesDoc('clerk');

      const { hasRole, Role } = await import('./auth.utility');

      expect(await hasRole('weird-uid', Role.Clerk)).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('returns false for an empty role set', async () => {
      const { hasAnyRole } = await import('./auth.utility');

      expect(await hasAnyRole('any-uid', [])).toBe(false);
      expect(mocks.adminDocGet).not.toHaveBeenCalled();
      expect(mocks.userRolesDocGet).not.toHaveBeenCalled();
    });

    it('admin passes an [Admin, MtTeacher] check via admins/{uid}', async () => {
      mocks.adminDocGet.mockResolvedValue({ exists: true });

      const { hasAnyRole, Role } = await import('./auth.utility');

      expect(
        await hasAnyRole('admin-uid', [Role.Admin, Role.MtTeacher])
      ).toBe(true);
    });

    it('mt-teacher passes an [Admin, MtTeacher] check via userRoles', async () => {
      setUserRolesDoc(['mt-teacher']);

      const { hasAnyRole, Role } = await import('./auth.utility');

      expect(
        await hasAnyRole('stephanie-uid', [Role.Admin, Role.MtTeacher])
      ).toBe(true);
    });

    it('fails when the user holds none of the required roles', async () => {
      setUserRolesDoc(['lesson-teacher']);

      const { hasAnyRole, Role } = await import('./auth.utility');

      expect(
        await hasAnyRole('teacher-uid', [Role.Admin, Role.Clerk])
      ).toBe(false);
    });

    it('does not read admins/{uid} when Admin is not in the set', async () => {
      setUserRolesDoc(['clerk']);

      const { hasAnyRole, Role } = await import('./auth.utility');

      expect(await hasAnyRole('nathan-uid', [Role.Clerk])).toBe(true);
      expect(mocks.adminDocGet).not.toHaveBeenCalled();
    });
  });

  describe('getUserRoles', () => {
    it('combines admin (admins/{uid}) with scoped roles (userRoles)', async () => {
      mocks.adminDocGet.mockResolvedValue({ exists: true });
      setUserRolesDoc(['clerk', 'lesson-teacher']);

      const { getUserRoles, Role } = await import('./auth.utility');

      const roles = await getUserRoles('katie-uid');

      expect(roles).toContain(Role.Admin);
      expect(roles).toContain(Role.Clerk);
      expect(roles).toContain(Role.LessonTeacher);
      expect(roles).toHaveLength(3);
    });

    it('returns empty for a user with no roles', async () => {
      const { getUserRoles } = await import('./auth.utility');

      expect(await getUserRoles('nobody-uid')).toEqual([]);
    });
  });

  describe('grantRole', () => {
    it('arrayUnions the role onto userRoles/{uid} with audit fields', async () => {
      const { grantRole, Role } = await import('./auth.utility');

      await grantRole('nathan-uid', Role.Clerk, 'katie-uid');

      expect(mocks.userRolesDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: { __arrayUnion: ['clerk'] },
          grantedBy: 'katie-uid',
        }),
        { merge: true }
      );
    });

    it('rejects granting Role.Admin', async () => {
      const { grantRole, Role } = await import('./auth.utility');

      await expect(
        grantRole('x-uid', Role.Admin, 'katie-uid')
      ).rejects.toThrow(/grantAdminRole/);
      expect(mocks.userRolesDocSet).not.toHaveBeenCalled();
    });
  });

  describe('revokeRole', () => {
    it('arrayRemoves the role from userRoles/{uid}', async () => {
      const { revokeRole, Role } = await import('./auth.utility');

      await revokeRole('nathan-uid', Role.Clerk);

      expect(mocks.userRolesDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: { __arrayRemove: ['clerk'] },
        }),
        { merge: true }
      );
    });

    it('rejects revoking Role.Admin', async () => {
      const { revokeRole, Role } = await import('./auth.utility');

      await expect(revokeRole('x-uid', Role.Admin)).rejects.toThrow(
        /revokeAdminRole/
      );
      expect(mocks.userRolesDocSet).not.toHaveBeenCalled();
    });
  });

  describe('grantAdminRole', () => {
    it('should call getDb and set admin document', async () => {
      const { grantAdminRole } = await import('./auth.utility');

      await grantAdminRole('new-admin-uid', 'granter-uid');

      expect(mocks.getDb).toHaveBeenCalled();
      expect(mocks.adminDocSet).toHaveBeenCalledWith(
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
      expect(mocks.adminDocDelete).toHaveBeenCalled();
    });
  });

  describe('getAdminUids', () => {
    it('should return array of admin UIDs', async () => {
      mocks.adminCollectionGet.mockResolvedValue({
        docs: [{ id: 'admin1' }, { id: 'admin2' }],
      });

      const { getAdminUids } = await import('./auth.utility');

      const result = await getAdminUids();

      expect(mocks.getDb).toHaveBeenCalled();
      expect(result).toEqual(['admin1', 'admin2']);
    });
  });

  describe('Role enum', () => {
    it('should export all roles with their wire values', async () => {
      const { Role } = await import('./auth.utility');

      expect(Role.Admin).toBe('admin');
      expect(Role.MtTeacher).toBe('mt-teacher');
      expect(Role.Clerk).toBe('clerk');
      expect(Role.LessonTeacher).toBe('lesson-teacher');
    });
  });
});
