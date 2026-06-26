import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import {
  CraftClubMemberRepository,
  craftClubEmailKey,
} from './craft-club-member.repository';
import { db } from './utilities/database.config';

function mockDocSnapshot(id: string, data: Record<string, unknown> | null) {
  return {
    id,
    exists: data !== null,
    data: () => (data !== null ? data : undefined),
  };
}

function firestoreMemberData(overrides: Record<string, unknown> = {}) {
  return {
    email: 'alice@example.com',
    name: 'Alice',
    status: 'approved',
    approvedAt: new Date('2026-06-01'),
    approvedBy: 'admin-1',
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-02'),
    ...overrides,
  };
}

describe('craftClubEmailKey', () => {
  it('trims and lowercases', () => {
    expect(craftClubEmailKey('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});

describe('CraftClubMemberRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findAll', () => {
    function setupFindAll(
      docs: Array<{ id: string; data: Record<string, unknown> }>
    ) {
      const mockDocs = docs.map((d) => mockDocSnapshot(d.id, d.data));
      const mockGet = vi.fn().mockResolvedValue({ docs: mockDocs });
      const mockOrderBy = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere: ReturnType<typeof vi.fn> = vi.fn();
      const chainable = {
        where: mockWhere,
        orderBy: mockOrderBy,
        get: mockGet,
      };
      mockWhere.mockReturnValue(chainable);
      vi.mocked(db.collection).mockReturnValue(
        chainable as unknown as ReturnType<typeof db.collection>
      );
      return { mockWhere, mockOrderBy };
    }

    it('applies the status filter and orders by createdAt desc', async () => {
      const { mockWhere, mockOrderBy } = setupFindAll([
        { id: 'm1', data: firestoreMemberData() },
      ]);

      const results = await CraftClubMemberRepository.findAll({
        status: 'approved',
      });

      expect(mockWhere).toHaveBeenCalledWith('status', '==', 'approved');
      expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(results).toHaveLength(1);
      expect(results[0].email).toBe('alice@example.com');
    });
  });

  describe('findByEmail', () => {
    it('queries by the normalized email key', async () => {
      const mockGet = vi
        .fn()
        .mockResolvedValue({ empty: false, docs: [mockDocSnapshot('m1', firestoreMemberData())] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.collection>);

      const member = await CraftClubMemberRepository.findByEmail(
        '  Alice@Example.COM '
      );

      expect(mockWhere).toHaveBeenCalledWith(
        'email',
        '==',
        'alice@example.com'
      );
      expect(member?.id).toBe('m1');
    });

    it('returns undefined when no match', async () => {
      const mockGet = vi.fn().mockResolvedValue({ empty: true, docs: [] });
      const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      vi.mocked(db.collection).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.collection>);

      const member = await CraftClubMemberRepository.findByEmail('x@y.com');
      expect(member).toBeUndefined();
    });
  });

  describe('create', () => {
    it('normalizes the email and stamps timestamps', async () => {
      const mockSet = vi.fn().mockResolvedValue(undefined);
      const mockDoc = vi.fn().mockReturnValue({ id: 'new-id', set: mockSet });
      vi.mocked(db.collection).mockReturnValue({
        doc: mockDoc,
      } as unknown as ReturnType<typeof db.collection>);

      const member = await CraftClubMemberRepository.create({
        email: '  New@Example.COM ',
        status: 'approved',
      });

      expect(member.id).toBe('new-id');
      expect(member.email).toBe('new@example.com');
      const written = mockSet.mock.calls[0][0];
      expect(written.email).toBe('new@example.com');
      expect(written.createdAt).toBeInstanceOf(Date);
      expect(written.updatedAt).toBeInstanceOf(Date);
    });
  });
});
