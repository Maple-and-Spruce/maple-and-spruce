import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readItemState,
  splitOutDrafts,
  updatePublishedItem,
  type WebflowItemsApi,
} from './webflow-backfill-drafts';

const COLLECTION_ID = 'col-classes';

function fakeItems() {
  return {
    getItem: vi.fn(),
    updateItem: vi.fn().mockResolvedValue({}),
    publishItem: vi.fn().mockResolvedValue({}),
  };
}

let items: ReturnType<typeof fakeItems>;
const api = (): WebflowItemsApi => items as unknown as WebflowItemsApi;

beforeEach(() => {
  items = fakeItems();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('readItemState', () => {
  it('reports a published item as not a draft, with its field data', async () => {
    items.getItem.mockResolvedValue({
      id: 'wf-1',
      isDraft: false,
      fieldData: { 'session-count': 1 },
    });

    await expect(readItemState(api(), COLLECTION_ID, 'wf-1')).resolves.toEqual({
      isDraft: false,
      fieldData: { 'session-count': 1 },
    });
    expect(items.getItem).toHaveBeenCalledWith(COLLECTION_ID, 'wf-1');
  });

  it('reports an unpublished past class as a draft', async () => {
    items.getItem.mockResolvedValue({ id: 'wf-2', isDraft: true, fieldData: {} });

    const state = await readItemState(api(), COLLECTION_ID, 'wf-2');

    expect(state.isDraft).toBe(true);
  });

  it('treats an item it could not read as a draft, so it is never republished', async () => {
    items.getItem.mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(readItemState(api(), COLLECTION_ID, 'wf-3')).resolves.toEqual({
      isDraft: true,
      fieldData: {},
    });
  });

  it('copes with a response missing fieldData', async () => {
    items.getItem.mockResolvedValue({ id: 'wf-4', isDraft: false });

    const state = await readItemState(api(), COLLECTION_ID, 'wf-4');

    expect(state).toEqual({ isDraft: false, fieldData: {} });
  });
});

describe('splitOutDrafts', () => {
  it('keeps live items for writing and sets drafts aside', () => {
    const rows = [
      { id: 'live', isDraft: false },
      { id: 'past', isDraft: true },
      { id: 'pilot', isDraft: true },
    ];

    const { published, drafts } = splitOutDrafts(rows);

    expect(published.map((r) => r.id)).toEqual(['live']);
    expect(drafts.map((r) => r.id)).toEqual(['past', 'pilot']);
  });
});

describe('updatePublishedItem', () => {
  it('writes the fields without sending isDraft, then republishes', async () => {
    await updatePublishedItem(
      api(),
      COLLECTION_ID,
      'wf-1',
      { 'spots-remaining': 3 },
      { publish: true }
    );

    expect(items.updateItem).toHaveBeenCalledWith(COLLECTION_ID, 'wf-1', {
      fieldData: { 'spots-remaining': 3 },
    });
    const sent = items.updateItem.mock.calls[0][2];
    expect(sent).not.toHaveProperty('isDraft');
    expect(items.publishItem).toHaveBeenCalledWith(COLLECTION_ID, {
      itemIds: ['wf-1'],
    });
  });

  it('never publishes on a dev run', async () => {
    await updatePublishedItem(
      api(),
      COLLECTION_ID,
      'wf-1',
      { 'session-count': 2 },
      { publish: false }
    );

    expect(items.updateItem).toHaveBeenCalledTimes(1);
    expect(items.publishItem).not.toHaveBeenCalled();
  });

  it('does not publish when the write fails', async () => {
    items.updateItem.mockRejectedValue(new Error('400 Validation Error'));

    await expect(
      updatePublishedItem(api(), COLLECTION_ID, 'wf-1', {}, { publish: true })
    ).rejects.toThrow('400');
    expect(items.publishItem).not.toHaveBeenCalled();
  });
});
