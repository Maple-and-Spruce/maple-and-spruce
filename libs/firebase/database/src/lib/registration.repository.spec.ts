import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
  toDate: (value: unknown, fallback: Date = new Date()): Date => {
    if (value === null || value === undefined) return fallback;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    }
    return fallback;
  },
}));

import { RegistrationRepository } from './registration.repository';
import { db } from './utilities/database.config';

describe('RegistrationRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('countByClassId', () => {
    function setupMockDocs(
      docs: Array<{ quantity?: number; status: string }>
    ): void {
      const mockDocs = docs.map((d, i) => ({
        id: `reg-${i}`,
        data: () => d,
      }));

      const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
      const mockWhere = vi.fn().mockReturnThis();
      const mockCollection = vi.fn().mockReturnValue({
        where: mockWhere,
        get: mockGet,
      });
      // Chain where calls: collection().where().where().get()
      mockWhere.mockReturnValue({ where: mockWhere, get: mockGet });

      vi.mocked(db.collection).mockImplementation(mockCollection);
    }

    it('returns 0 when no registrations exist', async () => {
      setupMockDocs([]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(0);
    });

    it('sums quantities for registrations with quantity 1', async () => {
      setupMockDocs([
        { quantity: 1, status: 'confirmed' },
        { quantity: 1, status: 'confirmed' },
        { quantity: 1, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(3);
    });

    it('sums quantities for registrations with quantity 2', async () => {
      setupMockDocs([
        { quantity: 2, status: 'confirmed' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(4);
    });

    it('sums mixed quantities correctly', async () => {
      setupMockDocs([
        { quantity: 1, status: 'confirmed' },
        { quantity: 3, status: 'pending' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(6);
    });

    it('defaults to 1 when quantity field is missing', async () => {
      setupMockDocs([
        { status: 'confirmed' },
        { quantity: 2, status: 'confirmed' },
      ]);

      const count = await RegistrationRepository.countByClassId('class-1');
      expect(count).toBe(3);
    });

    it('passes correct statuses filter to Firestore query', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhere = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ get: mockGet }),
      });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1');

      expect(mockWhere).toHaveBeenCalledWith('classId', '==', 'class-1');
    });

    it('uses default statuses of pending and confirmed', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhereStatus = vi
        .fn()
        .mockReturnValue({ get: mockGet });
      const mockWhere = vi
        .fn()
        .mockReturnValue({ where: mockWhereStatus });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1');

      expect(mockWhereStatus).toHaveBeenCalledWith('status', 'in', [
        'pending',
        'confirmed',
      ]);
    });

    it('accepts custom statuses', async () => {
      const mockGet = vi.fn().mockResolvedValue({ docs: [] });
      const mockWhereStatus = vi
        .fn()
        .mockReturnValue({ get: mockGet });
      const mockWhere = vi
        .fn()
        .mockReturnValue({ where: mockWhereStatus });
      const mockCollection = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await RegistrationRepository.countByClassId('class-1', ['confirmed']);

      expect(mockWhereStatus).toHaveBeenCalledWith('status', 'in', [
        'confirmed',
      ]);
    });
  });
});
