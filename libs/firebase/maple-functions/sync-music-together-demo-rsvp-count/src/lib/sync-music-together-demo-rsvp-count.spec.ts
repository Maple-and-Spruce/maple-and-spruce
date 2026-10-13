import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MusicTogetherDemo } from '@maple/ts/domain';
import type { DocumentSnapshot } from 'firebase-functions/v2/firestore';

/**
 * Tests for sync-music-together-demo-rsvp-count.ts
 *
 * Covers the full Firestore trigger handler:
 * 1. Skips writes that can't change the confirmed count
 * 2. Looks up the demo, skips if missing, hidden or past
 * 3. Counts confirmed RSVPs and calls Webflow syncDemo with the updated count
 * 4. Persists a newly created Webflow item ID
 */

const mocks = vi.hoisted(() => {
  return {
    demoFindById: vi.fn(),
    updateWebflowItemId: vi.fn(),
    countByDemoIdAndStatus: vi.fn(),
    syncDemo: vi.fn(),
    isDev: false,
  };
});

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: {
    findById: mocks.demoFindById,
    updateWebflowItemId: mocks.updateWebflowItemId,
  },
  MusicTogetherDemoRsvpRepository: {
    countByDemoIdAndStatus: mocks.countByDemoIdAndStatus,
  },
}));

// Mock Webflow — use a class so `new Webflow(...)` works
vi.mock('@maple/firebase/webflow', () => {
  return {
    Webflow: class MockWebflow {
      demoService = { syncDemo: mocks.syncDemo };
    },
    WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
    WEBFLOW_STRING_NAMES: ['WEBFLOW_SITE_ID'],
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
  isCountRelevantChange,
  syncMusicTogetherDemoRsvpCount,
} from './sync-music-together-demo-rsvp-count';

const handler = syncMusicTogetherDemoRsvpCount as unknown as (
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

const DAY_MS = 24 * 60 * 60 * 1000;

const createMockDemo = (
  overrides: Partial<MusicTogetherDemo> = {}
): MusicTogetherDemo => ({
  id: 'demo-001',
  dateTime: new Date(Date.now() + 7 * DAY_MS),
  location: 'Test Library Community Room',
  capacityFamilies: 8,
  visible: true,
  webflowItemId: 'wf-demo-1',
  createdAt: new Date(),
  ...overrides,
});

function makeEvent(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
  demoId = 'demo-001'
) {
  return {
    data: { before, after },
    params: { demoId, rsvpId: 'rsvp-001' },
  };
}

const confirmedRsvp = { demoId: 'demo-001', status: 'confirmed' };

describe('Sync Music Together Demo RSVP Count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
    mocks.syncDemo.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-demo-1',
      isNew: false,
    });
  });

  describe('isCountRelevantChange', () => {
    it('returns true for create (no before snapshot)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(false),
          makeSnapshot(true, confirmedRsvp)
        )
      ).toBe(true);
    });

    it('returns true for delete (no after snapshot)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, confirmedRsvp),
          makeSnapshot(false)
        )
      ).toBe(true);
    });

    it('returns true when status changes (waitlisted → confirmed)', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { ...confirmedRsvp, status: 'waitlisted' }),
          makeSnapshot(true, confirmedRsvp)
        )
      ).toBe(true);
    });

    it('returns false when only contact details change', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, { ...confirmedRsvp, name: 'Robin Ashfield' }),
          makeSnapshot(true, { ...confirmedRsvp, name: 'Robin A. Ashfield' })
        )
      ).toBe(false);
    });

    it('treats a snapshot with no data as relevant', () => {
      expect(
        isCountRelevantChange(
          makeSnapshot(true, undefined),
          makeSnapshot(true, confirmedRsvp)
        )
      ).toBe(true);
    });
  });

  describe('handler', () => {
    it('re-syncs the demo with the confirmed count on a new RSVP', async () => {
      const demo = createMockDemo();
      mocks.demoFindById.mockResolvedValue(demo);
      mocks.countByDemoIdAndStatus.mockResolvedValue(3);

      await handler(
        makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
      );

      expect(mocks.demoFindById).toHaveBeenCalledWith('demo-001');
      expect(mocks.countByDemoIdAndStatus).toHaveBeenCalledWith(
        'demo-001',
        'confirmed'
      );
      expect(mocks.syncDemo).toHaveBeenCalledWith({
        demo,
        publish: true,
        isDev: false,
        confirmedCount: 3,
        existingWebflowItemId: 'wf-demo-1',
      });
      expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
    });

    it('re-syncs when an RSVP is deleted (frees a spot)', async () => {
      mocks.demoFindById.mockResolvedValue(createMockDemo());
      mocks.countByDemoIdAndStatus.mockResolvedValue(2);

      await handler(
        makeEvent(makeSnapshot(true, confirmedRsvp), makeSnapshot(false))
      );

      expect(mocks.syncDemo).toHaveBeenCalledWith(
        expect.objectContaining({ confirmedCount: 2 })
      );
    });

    it('skips a write that does not change status', async () => {
      await handler(
        makeEvent(
          makeSnapshot(true, confirmedRsvp),
          makeSnapshot(true, { ...confirmedRsvp, phone: '+15550000001' })
        )
      );

      expect(mocks.demoFindById).not.toHaveBeenCalled();
      expect(mocks.syncDemo).not.toHaveBeenCalled();
    });

    it('skips when the demo no longer exists', async () => {
      mocks.demoFindById.mockResolvedValue(undefined);

      await handler(
        makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
      );

      expect(mocks.syncDemo).not.toHaveBeenCalled();
    });

    it('skips a hidden demo (does not resurrect its Webflow item)', async () => {
      mocks.demoFindById.mockResolvedValue(createMockDemo({ visible: false }));

      await handler(
        makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
      );

      expect(mocks.countByDemoIdAndStatus).not.toHaveBeenCalled();
      expect(mocks.syncDemo).not.toHaveBeenCalled();
    });

    it('skips a past demo', async () => {
      mocks.demoFindById.mockResolvedValue(
        createMockDemo({ dateTime: new Date(Date.now() - DAY_MS) })
      );

      await handler(
        makeEvent(makeSnapshot(true, confirmedRsvp), makeSnapshot(false))
      );

      expect(mocks.syncDemo).not.toHaveBeenCalled();
    });

    it('syncs as an unpublished draft in dev', async () => {
      mocks.isDev = true;
      mocks.demoFindById.mockResolvedValue(createMockDemo());
      mocks.countByDemoIdAndStatus.mockResolvedValue(1);

      await handler(
        makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
      );

      expect(mocks.syncDemo).toHaveBeenCalledWith(
        expect.objectContaining({ publish: false, isDev: true })
      );
    });

    it('stores a newly created Webflow item ID', async () => {
      mocks.demoFindById.mockResolvedValue(
        createMockDemo({ webflowItemId: undefined })
      );
      mocks.countByDemoIdAndStatus.mockResolvedValue(0);
      mocks.syncDemo.mockResolvedValue({
        success: true,
        webflowItemId: 'wf-demo-new',
        isNew: true,
      });

      await handler(
        makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
      );

      expect(mocks.updateWebflowItemId).toHaveBeenCalledWith(
        'demo-001',
        'wf-demo-new'
      );
    });

    it('swallows a Webflow error so the trigger does not retry-loop', async () => {
      mocks.demoFindById.mockResolvedValue(createMockDemo());
      mocks.countByDemoIdAndStatus.mockResolvedValue(1);
      mocks.syncDemo.mockRejectedValue(new Error('Webflow 500'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        handler(
          makeEvent(makeSnapshot(false), makeSnapshot(true, confirmedRsvp))
        )
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
