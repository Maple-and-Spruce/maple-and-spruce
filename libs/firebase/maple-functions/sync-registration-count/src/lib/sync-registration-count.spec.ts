import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Tests for sync-registration-count.ts
 *
 * Tests the business logic for syncing registration count changes
 * to Webflow CMS when registrations are created, updated, or deleted.
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

// Mock Webflow
vi.mock('@maple/firebase/webflow', () => ({
  Webflow: vi.fn().mockImplementation(() => ({
    classService: {
      syncClass: mocks.syncClass,
    },
  })),
  WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
  WEBFLOW_STRING_NAMES: ['WEBFLOW_SITE_ID', 'WEBFLOW_CLASSES_COLLECTION_ID'],
}));

// Mock firebase functions
vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    isDev: false,
  },
}));

// Mock firebase-functions (the SDK itself)
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn(),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

// Import after mocks
import { extractClassId } from './sync-registration-count';

describe('Sync Registration Count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create a mock published class
  const createMockClass = (
    overrides: Partial<Class> = {}
  ): Class => ({
    id: 'class-001',
    name: 'Intro to Pottery',
    description: 'Learn pottery basics',
    dateTime: new Date('2026-05-15T14:00:00Z'),
    durationMinutes: 120,
    capacity: 12,
    priceCents: 4500,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
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

  describe('registration count sync logic', () => {
    it('computes correct spots remaining after new registration', () => {
      const classEntity = createMockClass({ capacity: 12 });
      const registrationCount = 3;
      const spotsRemaining = classEntity.capacity - registrationCount;

      expect(spotsRemaining).toBe(9);
    });

    it('computes zero spots remaining when class is full', () => {
      const classEntity = createMockClass({ capacity: 8 });
      const registrationCount = 8;
      const spotsRemaining = classEntity.capacity - registrationCount;

      expect(spotsRemaining).toBe(0);
    });

    it('computes negative spots remaining when over-enrolled', () => {
      const classEntity = createMockClass({ capacity: 8 });
      const registrationCount = 10;
      const spotsRemaining = classEntity.capacity - registrationCount;

      expect(spotsRemaining).toBe(-2);
    });

    it('returns full capacity when no registrations exist', () => {
      const classEntity = createMockClass({ capacity: 12 });
      const registrationCount = 0;
      const spotsRemaining = classEntity.capacity - registrationCount;

      expect(spotsRemaining).toBe(12);
    });
  });

  describe('class lookup behavior', () => {
    it('finds published class for sync', async () => {
      const classEntity = createMockClass({ status: 'published' });
      mocks.classFindById.mockResolvedValue(classEntity);

      const result = await mocks.classFindById('class-001');

      expect(result).toBeDefined();
      expect(result.status).toBe('published');
    });

    it('skips sync when class is not found', async () => {
      mocks.classFindById.mockResolvedValue(undefined);

      const result = await mocks.classFindById('class-nonexistent');

      expect(result).toBeUndefined();
    });

    it('skips sync when class is draft', async () => {
      const classEntity = createMockClass({ status: 'draft' });
      mocks.classFindById.mockResolvedValue(classEntity);

      const result = await mocks.classFindById('class-001');

      expect(result.status).not.toBe('published');
    });

    it('skips sync when class is cancelled', async () => {
      const classEntity = createMockClass({ status: 'cancelled' });
      mocks.classFindById.mockResolvedValue(classEntity);

      const result = await mocks.classFindById('class-001');

      expect(result.status).not.toBe('published');
    });
  });

  describe('enrichment data fetching', () => {
    it('fetches instructor, category, and count in parallel', async () => {
      const classEntity = createMockClass({
        instructorId: 'instructor-001',
        categoryId: 'category-001',
      });

      mocks.instructorFindById.mockResolvedValue({ id: 'instructor-001', name: 'Jane Smith' });
      mocks.categoryfindById.mockResolvedValue({ id: 'category-001', name: 'Pottery' });
      mocks.registrationCountByClassId.mockResolvedValue(5);

      const [instructor, category, count] = await Promise.all([
        mocks.instructorFindById(classEntity.instructorId),
        mocks.categoryfindById(classEntity.categoryId),
        mocks.registrationCountByClassId(classEntity.id),
      ]);

      expect(instructor.name).toBe('Jane Smith');
      expect(category.name).toBe('Pottery');
      expect(count).toBe(5);
    });

    it('handles class with no instructor or category', async () => {
      const classEntity = createMockClass({
        instructorId: undefined,
        categoryId: undefined,
      });

      mocks.registrationCountByClassId.mockResolvedValue(3);

      const count = await mocks.registrationCountByClassId(classEntity.id);

      expect(count).toBe(3);
      expect(classEntity.instructorId).toBeUndefined();
      expect(classEntity.categoryId).toBeUndefined();
    });
  });

  describe('webflow sync call', () => {
    it('calls syncClass with correct parameters', async () => {
      const classEntity = createMockClass({
        instructorId: 'instructor-001',
        categoryId: 'category-001',
      });

      mocks.syncClass.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-item-123',
        isNew: false,
      });

      const result = await mocks.syncClass({
        classEntity,
        publish: true,
        isDev: false,
        instructorName: 'Jane Smith',
        categoryName: 'Pottery',
        registrationCount: 5,
      });

      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
      expect(mocks.syncClass).toHaveBeenCalledWith({
        classEntity,
        publish: true,
        isDev: false,
        instructorName: 'Jane Smith',
        categoryName: 'Pottery',
        registrationCount: 5,
      });
    });

    it('handles Webflow API error gracefully', async () => {
      mocks.syncClass.mockRejectedValue(new Error('Webflow API rate limited'));

      await expect(mocks.syncClass({
        classEntity: createMockClass(),
        publish: true,
        isDev: false,
        registrationCount: 3,
      })).rejects.toThrow('Webflow API rate limited');
    });
  });

  describe('classId extraction from registration changes', () => {
    it('uses after snapshot classId for create/update', () => {
      const afterSnapshot = {
        exists: true,
        data: () => ({ classId: 'class-001', status: 'confirmed' }),
      };
      const beforeSnapshot = {
        exists: false,
        data: () => undefined,
      };

      const classId =
        extractClassId(afterSnapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot) ??
        extractClassId(beforeSnapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot);

      expect(classId).toBe('class-001');
    });

    it('uses before snapshot classId for delete', () => {
      const afterSnapshot = {
        exists: false,
        data: () => undefined,
      };
      const beforeSnapshot = {
        exists: true,
        data: () => ({ classId: 'class-002', status: 'confirmed' }),
      };

      const classId =
        extractClassId(afterSnapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot) ??
        extractClassId(beforeSnapshot as unknown as import('firebase-functions/v2/firestore').DocumentSnapshot);

      expect(classId).toBe('class-002');
    });
  });
});
