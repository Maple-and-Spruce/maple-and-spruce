import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MusicTogetherSection } from '@maple/ts/domain';
import type { DocumentSnapshot } from 'firebase-functions/v2/firestore';

/**
 * Tests for sync-music-together-registration-count.ts
 *
 * Covers the full Firestore trigger handler:
 * 1. Skips writes that can't change the family count (feedback-loop guard)
 * 2. Extracts sectionId from registration snapshots
 * 3. Looks up the section, skips if missing or hidden
 * 4. Counts families and calls Webflow syncSection with the updated count
 * 5. Persists a newly created Webflow item ID
 */

const mocks = vi.hoisted(() => {
  return {
    sectionFindById: vi.fn(),
    updateWebflowItemId: vi.fn(),
    countBySectionId: vi.fn(),
    syncSection: vi.fn(),
    isDev: false,
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: {
    findById: mocks.sectionFindById,
    updateWebflowItemId: mocks.updateWebflowItemId,
  },
  MusicTogetherRegistrationRepository: {
    countBySectionId: mocks.countBySectionId,
  },
}));

// Mock Webflow — use a class so `new Webflow(...)` works
vi.mock('@maple/firebase/webflow', () => {
  return {
    Webflow: class MockWebflow {
      sectionService = { syncSection: mocks.syncSection };
    },
    WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
    WEBFLOW_STRING_NAMES: [
      'WEBFLOW_SITE_ID',
      'WEBFLOW_MT_SECTIONS_COLLECTION_ID',
    ],
  };
});

vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    get isDev() {
      return mocks.isDev;
    },
  },
}));

// Return the handler directly so it can be invoked in tests
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
  extractSectionId,
  isCountRelevantChange,
  syncMusicTogetherRegistrationCount,
} from './sync-music-together-registration-count';

const handler = syncMusicTogetherRegistrationCount as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>
): DocumentSnapshot {
  return {
    exists,
    data: () => (exists ? data : undefined),
  } as unknown as DocumentSnapshot;
}

const createMockSection = (
  overrides: Partial<MusicTogetherSection> = {}
): MusicTogetherSection => ({
  id: 'section-001',
  name: 'Thursday Morning — Mixed Age (0–5)',
  sessions: [{ dateTime: new Date('2026-09-10T14:00:00Z') }],
  capacityFamilies: 8,
  priceFullCents: 25200,
  visible: true,
  enrollmentActive: true,
  webflowItemId: 'wf-section-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Sync Music Together Registration Count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
  });

  describe('extractSectionId', () => {
    it('returns sectionId from a valid snapshot', () => {
      expect(
        extractSectionId(
          makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
          })
        )
      ).toBe('section-001');
    });

    it('returns null for a non-existent snapshot', () => {
      expect(extractSectionId(makeSnapshot(false))).toBeNull();
    });

    it('returns null for undefined snapshot', () => {
      expect(extractSectionId(undefined)).toBeNull();
    });

    it('returns null when data has no sectionId', () => {
      expect(
        extractSectionId(makeSnapshot(true, { status: 'confirmed' }))
      ).toBeNull();
    });
  });

  describe('isCountRelevantChange', () => {
    it('returns true for create (no before snapshot)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(false),
          makeSnapshot(true, { sectionId: 'section-001', status: 'confirmed' })
        )
      ).toBe(true);
    });

    it('returns true for delete (no after snapshot)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { sectionId: 'section-001', status: 'confirmed' }),
          makeSnapshot(false)
        )
      ).toBe(true);
    });

    it('returns true when status changes (pending → confirmed)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { sectionId: 'section-001', status: 'pending' }),
          makeSnapshot(true, { sectionId: 'section-001', status: 'confirmed' })
        )
      ).toBe(true);
    });

    it('returns true when status changes to cancelled (frees a spot)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { sectionId: 'section-001', status: 'confirmed' }),
          makeSnapshot(true, { sectionId: 'section-001', status: 'cancelled' })
        )
      ).toBe(true);
    });

    it('returns true when sectionId changes', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { sectionId: 'section-001', status: 'confirmed' }),
          makeSnapshot(true, { sectionId: 'section-002', status: 'confirmed' })
        )
      ).toBe(true);
    });

    it('returns false when a reminder stamp or payment field is written', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            squareCardId: 'card-old',
            updatedAt: new Date('2026-01-01'),
          }),
          makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            squareCardId: 'card-new',
            reminderSentForSessions: { '2026-09-10T14:00:00.000Z': new Date() },
            updatedAt: new Date('2026-01-02'),
          })
        )
      ).toBe(false);
    });

    it('returns false when a sibling is added (capacity is per family)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            children: [{ firstName: 'Ada' }],
          }),
          makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            children: [{ firstName: 'Ada' }, { firstName: 'Jo' }],
          })
        )
      ).toBe(false);
    });
  });

  describe('handler — feedback loop guard', () => {
    it('skips sync when only non-count fields change on update', async () => {
      await handler({
        params: { registrationId: 'mt-reg-loop' },
        data: {
          before: makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            squarePaymentId: null,
          }),
          after: makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
            squarePaymentId: 'sq-pay-123',
          }),
        },
      });

      expect(mocks.sectionFindById).not.toHaveBeenCalled();
      expect(mocks.syncSection).not.toHaveBeenCalled();
    });

    it('proceeds when status changes from pending to confirmed', async () => {
      mocks.sectionFindById.mockResolvedValue(createMockSection());
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-status' },
        data: {
          before: makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'pending',
          }),
          after: makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
          }),
        },
      });

      expect(mocks.sectionFindById).toHaveBeenCalledWith('section-001');
      expect(mocks.syncSection).toHaveBeenCalled();
    });
  });

  describe('handler — sectionId extraction', () => {
    it('uses the after snapshot for a create', async () => {
      mocks.sectionFindById.mockResolvedValue(createMockSection());
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-001' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-001' }),
        },
      });

      expect(mocks.sectionFindById).toHaveBeenCalledWith('section-001');
    });

    it('uses the before snapshot for a delete', async () => {
      mocks.sectionFindById.mockResolvedValue(
        createMockSection({ id: 'section-002' })
      );
      mocks.countBySectionId.mockResolvedValue(0);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-002' },
        data: {
          before: makeSnapshot(true, { sectionId: 'section-002' }),
          after: makeSnapshot(false),
        },
      });

      expect(mocks.sectionFindById).toHaveBeenCalledWith('section-002');
    });

    it('skips sync when no sectionId is present in either snapshot', async () => {
      await handler({
        params: { registrationId: 'mt-reg-003' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { status: 'confirmed' }),
        },
      });

      expect(mocks.sectionFindById).not.toHaveBeenCalled();
      expect(mocks.syncSection).not.toHaveBeenCalled();
    });
  });

  describe('handler — section lookup', () => {
    it('skips sync when the section is not found', async () => {
      mocks.sectionFindById.mockResolvedValue(undefined);

      await handler({
        params: { registrationId: 'mt-reg-004' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-missing' }),
        },
      });

      expect(mocks.syncSection).not.toHaveBeenCalled();
    });

    it('skips sync when the section is hidden', async () => {
      mocks.sectionFindById.mockResolvedValue(
        createMockSection({ visible: false })
      );

      await handler({
        params: { registrationId: 'mt-reg-005' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-001' }),
        },
      });

      expect(mocks.countBySectionId).not.toHaveBeenCalled();
      expect(mocks.syncSection).not.toHaveBeenCalled();
    });
  });

  describe('handler — count and sync', () => {
    it('syncs the section with the live family count', async () => {
      const section = createMockSection();
      mocks.sectionFindById.mockResolvedValue(section);
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-006' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, {
            sectionId: 'section-001',
            status: 'confirmed',
          }),
        },
      });

      expect(mocks.countBySectionId).toHaveBeenCalledWith('section-001');
      expect(mocks.syncSection).toHaveBeenCalledWith({
        section,
        publish: true,
        isDev: false,
        familyCount: 1,
        existingWebflowItemId: 'wf-section-1',
      });
    });

    it('does not publish in the dev environment', async () => {
      mocks.isDev = true;
      mocks.sectionFindById.mockResolvedValue(createMockSection());
      mocks.countBySectionId.mockResolvedValue(2);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-007' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-001' }),
        },
      });

      expect(mocks.syncSection).toHaveBeenCalledWith(
        expect.objectContaining({ publish: false, isDev: true })
      );
    });

    it('stores a newly created Webflow item ID back on the section', async () => {
      mocks.sectionFindById.mockResolvedValue(
        createMockSection({ webflowItemId: undefined })
      );
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-new-item',
        isNew: true,
      });

      await handler({
        params: { registrationId: 'mt-reg-008' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-001' }),
        },
      });

      expect(mocks.updateWebflowItemId).toHaveBeenCalledWith(
        'section-001',
        'wf-new-item'
      );
    });

    it('does not rewrite an unchanged Webflow item ID', async () => {
      mocks.sectionFindById.mockResolvedValue(createMockSection());
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-section-1',
        isNew: false,
      });

      await handler({
        params: { registrationId: 'mt-reg-009' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, { sectionId: 'section-001' }),
        },
      });

      expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
    });
  });

  describe('handler — error handling', () => {
    it('catches Webflow API errors without throwing', async () => {
      mocks.sectionFindById.mockResolvedValue(createMockSection());
      mocks.countBySectionId.mockResolvedValue(1);
      mocks.syncSection.mockRejectedValue(new Error('Webflow API rate limited'));

      await expect(
        handler({
          params: { registrationId: 'mt-reg-010' },
          data: {
            before: makeSnapshot(false),
            after: makeSnapshot(true, { sectionId: 'section-001' }),
          },
        })
      ).resolves.toBeUndefined();
    });
  });
});
