import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

/**
 * Tests for sync-class-to-webflow.ts
 *
 * FAILING (bug D): this trigger has no relevant-change guard.
 *
 * Its sibling `syncClassToSquare` declares `SQUARE_RELEVANT_FIELDS` and
 * returns early when a write touches none of them, precisely so that its own
 * `updateSquareSyncIds` write-back cannot re-enter it. `syncRegistrationCount`
 * does the same with `COUNT_RELEVANT_FIELDS`. This function has neither: it
 * runs the full enrich-and-push on EVERY write to `classes/{classId}`.
 *
 * That is not merely wasteful, it is the concurrency source behind the
 * duplicate CMS items. Publishing a class fires this trigger; `syncClassToSquare`
 * then stamps its catalog ids onto the same document; that write re-fires this
 * trigger while the first invocation is still in flight and has not yet written
 * `webflowItemId` back. Both invocations look up the item, both miss, and both
 * create one. In production the resulting twins were created 35ms-974ms apart.
 *
 * The tail guard at the end of the handler (`itemIdChanged || slugChanged`)
 * stops an endless write-back loop. It does nothing about this, because it runs
 * AFTER the duplicate has already been created.
 */

const mocks = vi.hoisted(() => ({
  classUpdateWebflowSync: vi.fn(),
  instructorFindById: vi.fn(),
  categoryFindById: vi.fn(),
  registrationCountByClassId: vi.fn(),
  // Webflow service mocks
  syncClass: vi.fn(),
  removeClass: vi.fn(),
  syncCategory: vi.fn(),
  isDev: false,
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    updateWebflowSync: mocks.classUpdateWebflowSync,
  },
  InstructorRepository: {
    findById: mocks.instructorFindById,
  },
  ClassCategoryRepository: {
    findById: mocks.categoryFindById,
  },
  RegistrationRepository: {
    countByClassId: mocks.registrationCountByClassId,
  },
}));

vi.mock('@maple/firebase/webflow', () => {
  return {
    Webflow: class MockWebflow {
      classService = {
        syncClass: mocks.syncClass,
        removeClass: mocks.removeClass,
      };
      classCategoryService = { syncClassCategory: mocks.syncCategory };
    },
    WEBFLOW_SECRET_NAMES: ['WEBFLOW_API_TOKEN'],
    WEBFLOW_STRING_NAMES: ['WEBFLOW_SITE_ID', 'WEBFLOW_CLASSES_COLLECTION_ID'],
  };
});

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

import { syncClassToWebflow } from './sync-class-to-webflow';

const handler = syncClassToWebflow as unknown as (
  event: unknown
) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>
): unknown {
  return {
    id: (data?.['id'] as string | undefined) ?? 'class-001',
    exists,
    data: () => (exists ? data : undefined),
  };
}

function makeEvent(before: unknown, after: unknown): unknown {
  return { params: { classId: 'class-001' }, data: { before, after } };
}

/**
 * A published class with a session, so `asPublishable` narrows successfully
 * and the handler reaches the sync call rather than bailing early.
 */
function makeClassData(
  overrides: Partial<Class> = {}
): Record<string, unknown> {
  return {
    id: 'class-001',
    name: 'Pottery 101',
    description: 'Learn the basics of pottery in this hands-on workshop.',
    sessions: [{ dateTime: new Date('2099-06-15T14:00:00.000Z') }],
    durationMinutes: 120,
    capacity: 10,
    priceCents: 4500,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('syncClassToWebflow — relevant-change guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDev = false;
    mocks.instructorFindById.mockResolvedValue(null);
    mocks.categoryFindById.mockResolvedValue(null);
    mocks.registrationCountByClassId.mockResolvedValue(0);
    mocks.syncClass.mockResolvedValue({
      success: true,
      webflowItemId: 'wf-item-1',
      webflowSlug: 'pottery-101',
      isNew: false,
    });
  });

  /**
   * The exact write `syncClassToSquare` makes when it stamps its catalog ids
   * back onto the class. Nothing a Webflow card renders has changed, so this
   * must not re-enter the sync — otherwise it runs concurrently with the
   * invocation still handling the original publish.
   */
  it('skips a write that changes no Webflow-relevant field (the Square id write-back)', async () => {
    const before = makeSnapshot(true, makeClassData());
    const after = makeSnapshot(
      true,
      makeClassData({
        squareCatalogItemId: 'SQ-ITEM-1',
        squareVariationId: 'SQ-VAR-1',
        squareCatalogVersion: 1,
      })
    );

    await handler(makeEvent(before, after));

    expect(mocks.syncClass).not.toHaveBeenCalled();
  });

  /** A byte-identical write (the shape a bare `update` produces). */
  it('skips a write that changes nothing at all', async () => {
    const data = makeClassData({ webflowItemId: 'wf-item-1' });

    await handler(makeEvent(makeSnapshot(true, data), makeSnapshot(true, data)));

    expect(mocks.syncClass).not.toHaveBeenCalled();
  });

  /** The guard must not suppress real edits — this one already passes. */
  it('still syncs when a customer-visible field changes', async () => {
    const before = makeSnapshot(true, makeClassData({ capacity: 10 }));
    const after = makeSnapshot(true, makeClassData({ capacity: 12 }));

    await handler(makeEvent(before, after));

    expect(mocks.syncClass).toHaveBeenCalledTimes(1);
  });

  /** A create has no `before`, so it must always sync. Already passes. */
  it('still syncs on create', async () => {
    await handler(
      makeEvent(makeSnapshot(false), makeSnapshot(true, makeClassData()))
    );

    expect(mocks.syncClass).toHaveBeenCalledTimes(1);
  });
});
