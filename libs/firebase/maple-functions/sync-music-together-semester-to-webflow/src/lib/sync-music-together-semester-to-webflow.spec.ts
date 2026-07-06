import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sync-music-together-semester-to-webflow.ts
 *
 * Covers the Firestore trigger handler:
 * 1. Deleted semester → removeSemester
 * 2. Created/updated semester (any status) → syncSemester + writeback
 * 3. `planned` semesters are synced (NOT hidden — no draft status)
 * 4. Webflow errors are swallowed (no retry loops)
 */

const mocks = vi.hoisted(() => ({
  updateWebflowItemId: vi.fn(),
  syncSemester: vi.fn(),
  removeSemester: vi.fn(),
  isDev: false,
}));

vi.mock('@maple/firebase/database', () => ({
  MusicTogetherSemesterRepository: {
    updateWebflowItemId: mocks.updateWebflowItemId,
  },
}));

vi.mock('@maple/firebase/webflow', () => ({
  Webflow: class MockWebflow {
    semesterService = {
      syncSemester: mocks.syncSemester,
      removeSemester: mocks.removeSemester,
    };
  },
  WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
  WEBFLOW_STRING_NAMES: [
    'WEBFLOW_SITE_ID',
    'WEBFLOW_MT_SEMESTERS_COLLECTION_ID',
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

import { syncMusicTogetherSemesterToWebflow } from './sync-music-together-semester-to-webflow';

const handler = syncMusicTogetherSemesterToWebflow as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  id = 'semester-001',
  data?: Record<string, unknown>
): unknown {
  return {
    id,
    exists,
    data: () => (exists ? data : undefined),
  };
}

const enrollingSemesterData = {
  name: 'Fall 2026',
  season: 'fall',
  year: 2026,
  startDate: new Date('2026-09-10T14:00:00Z'),
  endDate: new Date('2026-11-12T14:00:00Z'),
  weeks: 10,
  status: 'enrolling',
};

describe('syncMusicTogetherSemesterToWebflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
  });

  it('removes from Webflow when the semester is deleted', async () => {
    mocks.removeSemester.mockResolvedValue(true);

    await handler({
      params: { semesterId: 'semester-001' },
      data: {
        before: makeSnapshot(true, 'semester-001', {
          ...enrollingSemesterData,
          webflowItemId: 'wf-old',
        }),
        after: makeSnapshot(false),
      },
    });

    expect(mocks.removeSemester).toHaveBeenCalledWith(
      'semester-001',
      true,
      'wf-old'
    );
    expect(mocks.syncSemester).not.toHaveBeenCalled();
  });

  it('syncs an enrolling semester and writes back the Webflow item ID', async () => {
    mocks.syncSemester.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-new',
      isNew: true,
    });

    await handler({
      params: { semesterId: 'semester-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'semester-001', enrollingSemesterData),
      },
    });

    expect(mocks.syncSemester).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
        isDev: false,
      })
    );
    expect(mocks.updateWebflowItemId).toHaveBeenCalledWith(
      'semester-001',
      'wf-new'
    );
  });

  it('syncs a planned semester (no draft hiding)', async () => {
    mocks.syncSemester.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-planned',
      isNew: true,
    });

    await handler({
      params: { semesterId: 'semester-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'semester-001', {
          ...enrollingSemesterData,
          status: 'planned',
          startDate: undefined,
          endDate: undefined,
        }),
      },
    });

    expect(mocks.removeSemester).not.toHaveBeenCalled();
    expect(mocks.syncSemester).toHaveBeenCalledWith(
      expect.objectContaining({
        semester: expect.objectContaining({ status: 'planned' }),
      })
    );
  });

  it('does not write back when the Webflow item ID is unchanged', async () => {
    mocks.syncSemester.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-existing',
      isNew: false,
    });

    await handler({
      params: { semesterId: 'semester-001' },
      data: {
        before: makeSnapshot(true, 'semester-001', {
          ...enrollingSemesterData,
          webflowItemId: 'wf-existing',
        }),
        after: makeSnapshot(true, 'semester-001', {
          ...enrollingSemesterData,
          webflowItemId: 'wf-existing',
        }),
      },
    });

    expect(mocks.updateWebflowItemId).not.toHaveBeenCalled();
  });

  it('does not publish in dev', async () => {
    mocks.isDev = true;
    mocks.syncSemester.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-dev',
      isNew: true,
    });

    await handler({
      params: { semesterId: 'semester-001' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, 'semester-001', enrollingSemesterData),
      },
    });

    expect(mocks.syncSemester).toHaveBeenCalledWith(
      expect.objectContaining({ publish: false, isDev: true })
    );
  });

  it('swallows Webflow errors without throwing', async () => {
    mocks.syncSemester.mockRejectedValue(new Error('Webflow rate limited'));

    await expect(
      handler({
        params: { semesterId: 'semester-001' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, 'semester-001', enrollingSemesterData),
        },
      })
    ).resolves.toBeUndefined();
  });
});
