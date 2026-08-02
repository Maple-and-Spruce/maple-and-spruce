import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sync-music-together-demo-to-webflow.ts
 *
 * Covers the Firestore trigger handler:
 * 1. Deleted demo → removeDemo
 * 2. Hidden demo → removeDemo
 * 3. Past-dated demo → removeDemo
 * 4. Visible + upcoming demo → enrich with confirmed count → syncDemo + writeback
 * 5. No writeback when the Webflow item ID is unchanged
 * 6. Dev → drafts (isDev), never published (publish=false)
 * 7. Webflow errors are swallowed (no retry loops)
 */

const mocks = vi.hoisted(() => ({
  countByDemoIdAndStatus: vi.fn(),
  updateWebflowItemId: vi.fn(),
  syncDemo: vi.fn(),
  removeDemo: vi.fn(),
  isDev: false,
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherDemoRepository: {
    updateWebflowItemId: mocks.updateWebflowItemId,
  },
  MusicTogetherDemoRsvpRepository: {
    countByDemoIdAndStatus: mocks.countByDemoIdAndStatus,
  },
}));

vi.mock('@maple/firebase/webflow', () => ({
  Webflow: class MockWebflow {
    demoService = {
      syncDemo: mocks.syncDemo,
      removeDemo: mocks.removeDemo,
    };
  },
  WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
  WEBFLOW_STRING_NAMES: ['WEBFLOW_SITE_ID', 'WEBFLOW_MT_DEMOS_COLLECTION_ID'],
}));

vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    get isDev() {
      return mocks.isDev;
    },
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

import { syncMusicTogetherDemoToWebflow } from './sync-music-together-demo-to-webflow';

const handler = syncMusicTogetherDemoToWebflow as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  id = 'demo-001',
  data?: Record<string, unknown>
): unknown {
  return {
    id,
    exists,
    data: () => (exists ? data : undefined),
  };
}

// One year in the future so the demo is always upcoming relative to "now".
const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

const openDemoData = {
  location: 'Morgantown Public Library',
  dateTime: FUTURE,
  capacityFamilies: 8,
  visible: true,
};

describe('syncMusicTogetherDemoToWebflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
  });

  it('removes from Webflow when the demo is deleted', async () => {
    mocks.removeDemo.mockResolvedValue(true);

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(true, 'demo-001', {
          ...openDemoData,
          webflowItemId: 'wf-old',
        }),
        after: makeSnapshot(false),
      },
    });

    expect(mocks.removeDemo).toHaveBeenCalledWith('demo-001', true, 'wf-old');
    expect(mocks.syncDemo).not.toHaveBeenCalled();
  });

  it('removes from Webflow when the demo is hidden', async () => {
    mocks.removeDemo.mockResolvedValue(true);

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(true, 'demo-001', openDemoData),
        after: makeSnapshot(true, 'demo-001', {
          ...openDemoData,
          visible: false,
          webflowItemId: 'wf-draft',
        }),
      },
    });

    expect(mocks.removeDemo).toHaveBeenCalledWith('demo-001', true, 'wf-draft');
    expect(mocks.syncDemo).not.toHaveBeenCalled();
  });

  it('removes from Webflow when the demo is past-dated', async () => {
    mocks.removeDemo.mockResolvedValue(true);

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'demo-001', {
          ...openDemoData,
          dateTime: PAST,
          webflowItemId: 'wf-past',
        }),
      },
    });

    expect(mocks.removeDemo).toHaveBeenCalledWith('demo-001', true, 'wf-past');
    expect(mocks.syncDemo).not.toHaveBeenCalled();
  });

  it('enriches with confirmed count and syncs a visible upcoming demo', async () => {
    mocks.countByDemoIdAndStatus.mockResolvedValue(3);
    mocks.syncDemo.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-new',
      isNew: true,
    });

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'demo-001', openDemoData),
      },
    });

    expect(mocks.countByDemoIdAndStatus).toHaveBeenCalledWith(
      'demo-001',
      'confirmed'
    );
    expect(mocks.syncDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
        isDev: false,
        confirmedCount: 3,
      })
    );
    // Writeback when Webflow returns a new item ID.
    expect(mocks.updateWebflowItemId).toHaveBeenCalledWith('demo-001', 'wf-new');
  });

  it('does not write back when the Webflow item ID is unchanged', async () => {
    mocks.countByDemoIdAndStatus.mockResolvedValue(0);
    mocks.syncDemo.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-existing',
      isNew: false,
    });

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(true, 'demo-001', {
          ...openDemoData,
          webflowItemId: 'wf-existing',
        }),
        after: makeSnapshot(true, 'demo-001', {
          ...openDemoData,
          webflowItemId: 'wf-existing',
        }),
      },
    });

    expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
  });

  it('does not publish in dev (drafts kept via isDev)', async () => {
    mocks.isDev = true;
    mocks.countByDemoIdAndStatus.mockResolvedValue(0);
    mocks.syncDemo.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-dev',
      isNew: true,
    });

    await handler({
      params: { demoId: 'demo-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'demo-001', openDemoData),
      },
    });

    expect(mocks.syncDemo).toHaveBeenCalledWith(
      expect.objectContaining({ publish: false, isDev: true })
    );
  });

  it('swallows Webflow errors without throwing', async () => {
    mocks.countByDemoIdAndStatus.mockResolvedValue(1);
    mocks.syncDemo.mockRejectedValue(new Error('Webflow rate limited'));

    await expect(
      handler({
        params: { demoId: 'demo-001' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, 'demo-001', openDemoData),
        },
      })
    ).resolves.toBeUndefined();
  });
});
