import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Tests for sync-registration-count.ts
 *
 * Tests the full Firestore trigger handler logic:
 * 1. Extracts classId from registration snapshots
 * 2. Looks up the class, skips if not found or not published
 * 3. Fetches enrichment data (instructor, category, registration count)
 * 4. Calls Webflow syncClass with the correct parameters
 */

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    // Repository mocks
    classFindById: vi.fn(),
    instructorFindById: vi.fn(),
    categoryfindById: vi.fn(),
    registrationCountByClassId: vi.fn(),
    // Webflow mocks
    syncClass: vi.fn(),
    // FirebaseProject mock
    isDev: false,
  };
});

// Mock database repositories
vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.classFindById,
  },
  InstructorRepository: {
    findById: mocks.instructorFindById,
  },
  ClassCategoryRepository: {
    findById: mocks.categoryfindById,
  },
  RegistrationRepository: {
    countByClassId: mocks.registrationCountByClassId,
  },
}));

// Mock Webflow — use a class so `new Webflow(...)` works
vi.mock('@maple/firebase/webflow', () => {
  return {
    Webflow: class MockWebflow {
      classService = { syncClass: mocks.syncClass };
    },
    WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
    WEBFLOW_STRING_NAMES: ['WEBFLOW_SITE_ID', 'WEBFLOW_CLASSES_COLLECTION_ID'],
  };
});

// Mock firebase functions
vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    get isDev() {
      return mocks.isDev;
    },
  },
}));

// Mock firebase-functions — return the handler directly (same pattern as on-class-write)
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({
    name,
    value: () => `mock-${name}`,
  })),
  defineString: vi.fn((name: string) => ({
    name,
    value: () => `mock-${name}`,
  })),
}));

// Import after mocks
import {
  extractClassId,
  isCountRelevantChange,
  syncRegistrationCount,
} from './sync-registration-count';

// The onDocumentWritten mock returns the handler directly
const handler = syncRegistrationCount as unknown as (
  event: unknown
) => Promise<void>;

// Helper to create a mock Firestore snapshot
function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>
): unknown {
  return {
    exists,
    data: () => (exists ? data : undefined),
  };
}

// Helper to create a mock published class
const createMockClass = (overrides: Partial<Class> = {}): Class => ({
  id: 'class-001',
  name: 'Intro to Pottery',
  description: 'Learn pottery basics',
  sessions: [{ dateTime: new Date('2026-05-15T14:00:00Z') }],
  durationMinutes: 120,
  capacity: 12,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Sync Registration Count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
  });

  describe('extractClassId', () => {
    it('returns classId from a valid snapshot', () => {
      const snapshot = {
        exists: true,
        data: () => ({ classId: 'class-001', status: 'confirmed' }),
      };

      const result = extractClassId(
        snapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot
      );

      expect(result).toBe('class-001');
    });

    it('returns null for a non-existent snapshot', () => {
      const snapshot = {
        exists: false,
        data: () => undefined,
      };

      const result = extractClassId(
        snapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot
      );

      expect(result).toBeNull();
    });

    it('returns null for undefined snapshot', () => {
      expect(extractClassId(undefined)).toBeNull();
    });

    it('returns null when data has no classId', () => {
      const snapshot = {
        exists: true,
        data: () => ({ status: 'confirmed' }),
      };

      const result = extractClassId(
        snapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot
      );

      expect(result).toBeNull();
    });
  });

  describe('isCountRelevantChange', () => {
    it('returns true for create (no before snapshot)', () => {
      const before = makeSnapshot(false) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(true);
    });

    it('returns true for delete (no after snapshot)', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(false) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(true);
    });

    it('returns true when status changes', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'pending',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-001',
        status: 'cancelled',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(true);
    });

    it('returns true when quantity changes', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 2,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(true);
    });

    it('returns true when classId changes', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-002',
        status: 'confirmed',
        quantity: 1,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(true);
    });

    it('returns false when only non-count fields change (e.g. squarePaymentId)', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
        squarePaymentId: null,
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
        squarePaymentId: 'sq-pay-123',
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(false);
    });

    it('returns false when only updatedAt changes', () => {
      const before = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
        updatedAt: new Date('2026-01-01'),
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;
      const after = makeSnapshot(true, {
        classId: 'class-001',
        status: 'confirmed',
        quantity: 1,
        updatedAt: new Date('2026-01-02'),
      }) as import('firebase-functions/v2/firestore').DocumentSnapshot;

      expect(isCountRelevantChange(before, after)).toBe(false);
    });
  });

  describe('handler — feedback loop guard', () => {
    it('skips sync when only non-count fields change on update', async () => {
      await handler({
        params: { registrationId: 'reg-loop' },
        data: {
          after: makeSnapshot(true, {
            classId: 'class-001',
            status: 'confirmed',
            quantity: 1,
            squarePaymentId: 'sq-pay-123',
            updatedAt: new Date(),
          }),
          before: makeSnapshot(true, {
            classId: 'class-001',
            status: 'confirmed',
            quantity: 1,
            squarePaymentId: null,
            updatedAt: new Date('2026-01-01'),
          }),
        },
      });

      expect(mocks.classFindById).not.toHaveBeenCalled();
      expect(mocks.syncClass).not.toHaveBeenCalled();
    });

    it('proceeds with sync when status changes from pending to confirmed', async () => {
      const classEntity = createMockClass();
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(1);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'reg-status-change' },
        data: {
          after: makeSnapshot(true, {
            classId: 'class-001',
            status: 'confirmed',
            quantity: 1,
          }),
          before: makeSnapshot(true, {
            classId: 'class-001',
            status: 'pending',
            quantity: 1,
          }),
        },
      });

      expect(mocks.classFindById).toHaveBeenCalledWith('class-001');
      expect(mocks.syncClass).toHaveBeenCalled();
    });
  });

  describe('handler — classId extraction from snapshots', () => {
    it('uses after snapshot classId for create', async () => {
      const classEntity = createMockClass();
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(1);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'reg-001' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.classFindById).toHaveBeenCalledWith('class-001');
    });

    it('uses before snapshot classId for delete', async () => {
      const classEntity = createMockClass({ id: 'class-002' });
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(0);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'reg-002' },
        data: {
          after: makeSnapshot(false),
          before: makeSnapshot(true, { classId: 'class-002' }),
        },
      });

      expect(mocks.classFindById).toHaveBeenCalledWith('class-002');
    });

    it('skips sync when no classId found in either snapshot', async () => {
      await handler({
        params: { registrationId: 'reg-003' },
        data: {
          after: makeSnapshot(true, { status: 'confirmed' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.classFindById).not.toHaveBeenCalled();
      expect(mocks.syncClass).not.toHaveBeenCalled();
    });
  });

  describe('handler — class lookup', () => {
    it('skips sync when class is not found', async () => {
      mocks.classFindById.mockResolvedValue(undefined);

      await handler({
        params: { registrationId: 'reg-004' },
        data: {
          after: makeSnapshot(true, { classId: 'class-nonexistent' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.classFindById).toHaveBeenCalledWith('class-nonexistent');
      expect(mocks.syncClass).not.toHaveBeenCalled();
    });

    it('skips sync when class is draft', async () => {
      mocks.classFindById.mockResolvedValue(
        createMockClass({ status: 'draft' })
      );

      await handler({
        params: { registrationId: 'reg-005' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.syncClass).not.toHaveBeenCalled();
    });

    it('skips sync when class is cancelled', async () => {
      mocks.classFindById.mockResolvedValue(
        createMockClass({ status: 'cancelled' })
      );

      await handler({
        params: { registrationId: 'reg-006' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.syncClass).not.toHaveBeenCalled();
    });
  });

  describe('handler — enrichment and sync', () => {
    it('fetches instructor, category, and count then calls syncClass', async () => {
      const classEntity = createMockClass({
        instructorId: 'instructor-001',
        categoryId: 'category-001',
      });
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.instructorFindById.mockResolvedValue({
        id: 'instructor-001',
        name: 'Jane Smith',
      });
      mocks.categoryfindById.mockResolvedValue({
        id: 'category-001',
        name: 'Pottery',
      });
      mocks.registrationCountByClassId.mockResolvedValue(5);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-item-123',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'reg-007' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.instructorFindById).toHaveBeenCalledWith('instructor-001');
      expect(mocks.categoryfindById).toHaveBeenCalledWith('category-001');
      expect(mocks.registrationCountByClassId).toHaveBeenCalledWith(
        'class-001'
      );
      expect(mocks.syncClass).toHaveBeenCalledWith({
        classEntity,
        publish: true,
        isDev: false,
        instructorName: 'Jane Smith',
        categoryName: 'Pottery',
        registrationCount: 5,
      });
    });

    it('handles class with no instructor or category', async () => {
      const classEntity = createMockClass({
        instructorId: undefined,
        categoryId: undefined,
      });
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(3);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-item-456',
        isNew: true,
      });

      await handler({
        params: { registrationId: 'reg-008' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      // Should NOT call instructor or category repos
      expect(mocks.instructorFindById).not.toHaveBeenCalled();
      expect(mocks.categoryfindById).not.toHaveBeenCalled();

      expect(mocks.syncClass).toHaveBeenCalledWith({
        classEntity,
        publish: true,
        isDev: false,
        instructorName: undefined,
        categoryName: undefined,
        registrationCount: 3,
      });
    });

    it('does not publish when running in dev environment', async () => {
      mocks.isDev = true;
      const classEntity = createMockClass();
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(0);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-item-789',
        isNew: true,
      });

      await handler({
        params: { registrationId: 'reg-009' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.syncClass).toHaveBeenCalledWith(
        expect.objectContaining({
          publish: false,
          isDev: true,
        })
      );
    });

    it('publishes when running in prod environment', async () => {
      mocks.isDev = false;
      const classEntity = createMockClass();
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(2);
      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-item-101',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'reg-010' },
        data: {
          after: makeSnapshot(true, { classId: 'class-001' }),
          before: makeSnapshot(false),
        },
      });

      expect(mocks.syncClass).toHaveBeenCalledWith(
        expect.objectContaining({
          publish: true,
          isDev: false,
        })
      );
    });
  });

  describe('handler — error handling', () => {
    it('catches Webflow API errors without throwing', async () => {
      const classEntity = createMockClass();
      mocks.classFindById.mockResolvedValue(classEntity);
      mocks.registrationCountByClassId.mockResolvedValue(1);
      mocks.syncClass.mockRejectedValue(
        new Error('Webflow API rate limited')
      );

      // Should NOT throw — the handler catches errors to prevent retry loops
      await expect(
        handler({
          params: { registrationId: 'reg-011' },
          data: {
            after: makeSnapshot(true, { classId: 'class-001' }),
            before: makeSnapshot(false),
          },
        })
      ).resolves.toBeUndefined();
    });
  });
});
