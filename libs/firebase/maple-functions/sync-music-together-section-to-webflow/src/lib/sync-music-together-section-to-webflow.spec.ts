import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sync-music-together-section-to-webflow.ts
 *
 * Covers the Firestore trigger handler:
 * 1. Deleted section → removeSection
 * 2. Draft section → removeSection
 * 3. Visible section → enrich with family count → syncSection + writeback
 * 4. Webflow errors are swallowed (no retry loops)
 */

const mocks = vi.hoisted(() => ({
  countBySectionId: vi.fn(),
  updateWebflowItemId: vi.fn(),
  syncSection: vi.fn(),
  removeSection: vi.fn(),
  isDev: false,
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSectionRepository: {
    updateWebflowItemId: mocks.updateWebflowItemId,
  },
  MusicTogetherRegistrationRepository: {
    countBySectionId: mocks.countBySectionId,
  },
}));

vi.mock('@maple/firebase/webflow', () => ({
  Webflow: class MockWebflow {
    sectionService = {
      syncSection: mocks.syncSection,
      removeSection: mocks.removeSection,
    };
  },
  WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
  WEBFLOW_STRING_NAMES: [
    'WEBFLOW_SITE_ID',
    'WEBFLOW_MT_SECTIONS_COLLECTION_ID',
  ],
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

import { syncMusicTogetherSectionToWebflow } from './sync-music-together-section-to-webflow';

const handler = syncMusicTogetherSectionToWebflow as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  id = 'section-001',
  data?: Record<string, unknown>
): unknown {
  return {
    id,
    exists,
    data: () => (exists ? data : undefined),
  };
}

const openSectionData = {
  name: 'Spring 2026 — Tuesdays 10am',
  sessions: [{ dateTime: new Date('2026-03-03T15:00:00Z') }],
  capacityFamilies: 8,
  priceFullCents: 25200,
  visible: true,
  enrollmentActive: true,
};

describe('syncMusicTogetherSectionToWebflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
  });

  it('removes from Webflow when the section is deleted', async () => {
    mocks.removeSection.mockResolvedValue(true);

    await handler({
      params: { sectionId: 'section-001' },
      data: {
        before: makeSnapshot(true, 'section-001', {
          ...openSectionData,
          webflowItemId: 'wf-old',
        }),
        after: makeSnapshot(false),
      },
    });

    expect(mocks.removeSection).toHaveBeenCalledWith(
      'section-001',
      true,
      'wf-old'
    );
    expect(mocks.syncSection).not.toHaveBeenCalled();
  });

  it('removes from Webflow when the section is hidden', async () => {
    mocks.removeSection.mockResolvedValue(true);

    await handler({
      params: { sectionId: 'section-001' },
      data: {
        before: makeSnapshot(true, 'section-001', openSectionData),
        after: makeSnapshot(true, 'section-001', {
          ...openSectionData,
          visible: false,
          webflowItemId: 'wf-draft',
        }),
      },
    });

    expect(mocks.removeSection).toHaveBeenCalledWith(
      'section-001',
      true,
      'wf-draft'
    );
    expect(mocks.syncSection).not.toHaveBeenCalled();
  });

  it('enriches with family count and syncs an open section', async () => {
    mocks.countBySectionId.mockResolvedValue(3);
    mocks.syncSection.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-new',
      isNew: true,
    });

    await handler({
      params: { sectionId: 'section-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'section-001', openSectionData),
      },
    });

    expect(mocks.countBySectionId).toHaveBeenCalledWith('section-001');
    expect(mocks.syncSection).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
        isDev: false,
        familyCount: 3,
      })
    );
    // Writeback when Webflow returns a new item ID.
    expect(mocks.updateWebflowItemId).toHaveBeenCalledWith(
      'section-001',
      'wf-new'
    );
  });

  it('does not write back when the Webflow item ID is unchanged', async () => {
    mocks.countBySectionId.mockResolvedValue(0);
    mocks.syncSection.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-existing',
      isNew: false,
    });

    await handler({
      params: { sectionId: 'section-001' },
      data: {
        before: makeSnapshot(true, 'section-001', {
          ...openSectionData,
          webflowItemId: 'wf-existing',
        }),
        after: makeSnapshot(true, 'section-001', {
          ...openSectionData,
          webflowItemId: 'wf-existing',
        }),
      },
    });

    expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
  });

  it('does not publish in dev', async () => {
    mocks.isDev = true;
    mocks.countBySectionId.mockResolvedValue(0);
    mocks.syncSection.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-dev',
      isNew: true,
    });

    await handler({
      params: { sectionId: 'section-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'section-001', openSectionData),
      },
    });

    expect(mocks.syncSection).toHaveBeenCalledWith(
      expect.objectContaining({ publish: false, isDev: true })
    );
  });

  it('swallows Webflow errors without throwing', async () => {
    mocks.countBySectionId.mockResolvedValue(1);
    mocks.syncSection.mockRejectedValue(new Error('Webflow rate limited'));

    await expect(
      handler({
        params: { sectionId: 'section-001' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, 'section-001', openSectionData),
        },
      })
    ).resolves.toBeUndefined();
  });
});
