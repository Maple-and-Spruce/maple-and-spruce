import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ dismiss: vi.fn() }));

vi.mock('@maple/firebase/database', () => ({
  InboxDismissalRepository: { dismiss: mocks.dismiss },
}));

import { dismissInboxItem } from './dismiss-inbox-item';

describe('dismissInboxItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the key, its kind and who marked it done', async () => {
    const result = await dismissInboxItem(
      { key: 'charge-failed:chg-1:1760000000000' },
      { uid: 'uid-katie' }
    );
    expect(mocks.dismiss).toHaveBeenCalledWith({
      key: 'charge-failed:chg-1:1760000000000',
      kind: 'charge-failed',
      dismissedByUid: 'uid-katie',
    });
    expect(result).toEqual({ key: 'charge-failed:chg-1:1760000000000' });
  });

  it('propagates a failed write so the client can restore the row', async () => {
    mocks.dismiss.mockRejectedValue(new Error('unavailable'));
    await expect(
      dismissInboxItem({ key: 'lesson-inquiry:inq-1' }, { uid: 'uid-1' })
    ).rejects.toThrow('unavailable');
  });
});
