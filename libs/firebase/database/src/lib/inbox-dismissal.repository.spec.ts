import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  getAll: vi.fn(),
  doc: vi.fn(),
}));

vi.mock('./utilities/database.config', () => {
  const collection = () => ({
    doc: (id: string) => {
      mocks.doc(id);
      return { id, set: mocks.set };
    },
  });
  return {
    db: { collection },
    getDb: () => ({ collection, getAll: mocks.getAll }),
    toDate: (value: unknown): Date =>
      value instanceof Date ? value : new Date(value as string),
  };
});

import {
  InboxDismissalRepository,
  inboxDismissalDocId,
} from './inbox-dismissal.repository';

function snap(data: Record<string, unknown> | null) {
  return { exists: data !== null, data: () => data };
}

describe('InboxDismissalRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encodes a key into a safe document id', () => {
    expect(inboxDismissalDocId('charge-failed:chg-1:123')).toBe(
      'charge-failed%3Achg-1%3A123'
    );
  });

  it('reads only the asked-for keys, once each, and maps every field', async () => {
    const at = new Date('2026-10-14T12:00:00Z');
    mocks.getAll.mockResolvedValue([
      snap({
        key: 'lesson-inquiry:a',
        kind: 'lesson-inquiry',
        dismissedAt: at.toISOString(),
        dismissedByUid: 'uid-1',
      }),
      snap(null),
    ]);
    const found = await InboxDismissalRepository.findByKeys([
      'lesson-inquiry:a',
      'lesson-inquiry:b',
      'lesson-inquiry:a',
    ]);
    expect(mocks.doc.mock.calls.map(([id]) => id)).toEqual([
      'lesson-inquiry%3Aa',
      'lesson-inquiry%3Ab',
    ]);
    expect(found).toEqual([
      {
        key: 'lesson-inquiry:a',
        kind: 'lesson-inquiry',
        dismissedAt: at,
        dismissedByUid: 'uid-1',
      },
    ]);
  });

  it('maps a missing uid to undefined', async () => {
    mocks.getAll.mockResolvedValue([
      snap({ key: 'k:1', kind: 'sync-conflicts', dismissedAt: new Date(), dismissedByUid: null }),
    ]);
    const [found] = await InboxDismissalRepository.findByKeys(['k:1']);
    expect(found.dismissedByUid).toBeUndefined();
  });

  it('skips the read entirely for no keys', async () => {
    expect(await InboxDismissalRepository.findByKeys([])).toEqual([]);
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it('writes a dismissal at the key’s document id', async () => {
    const result = await InboxDismissalRepository.dismiss({
      key: 'charge-failed:chg-1:123',
      kind: 'charge-failed',
      dismissedByUid: 'uid-1',
    });
    expect(mocks.doc).toHaveBeenCalledWith('charge-failed%3Achg-1%3A123');
    expect(mocks.set).toHaveBeenCalledWith({
      key: 'charge-failed:chg-1:123',
      kind: 'charge-failed',
      dismissedAt: expect.any(Date),
      dismissedByUid: 'uid-1',
    });
    expect(result.dismissedAt).toBeInstanceOf(Date);
  });

  it('stores a null uid rather than undefined', async () => {
    await InboxDismissalRepository.dismiss({ key: 'k:1', kind: 'sync-conflicts' });
    expect(mocks.set.mock.calls[0][0].dismissedByUid).toBeNull();
  });
});
