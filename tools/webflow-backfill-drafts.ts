/**
 * Draft-safe reads and writes for the `tools/backfill-webflow-*.ts` scripts.
 *
 * Most items in the Webflow Classes collection are unpublished drafts on
 * purpose: past classes that `expirePastClassPages` swept, dev-environment
 * items, and old test/pilot classes. A backfill that PATCHes an item with
 * `isDraft: false` (or `!isProd`) and then publishes it puts every one of those
 * pages back on the live site and in the sitemap.
 *
 * So a backfill reads each item's draft state first, leaves drafts alone, and
 * writes only to items that are already live, without touching `isDraft`. A
 * draft picks the new field up if it is ever re-synced, which is also the only
 * way it should come back to life.
 */
import type { WebflowClient } from 'webflow-api';

/** The slice of the Webflow items API these helpers use (fakeable in specs). */
export type WebflowItemsApi = Pick<
  WebflowClient['collections']['items'],
  'getItem' | 'updateItem' | 'publishItem'
>;

export interface ItemState {
  /** True for an unpublished item, and for one whose state could not be read. */
  isDraft: boolean;
  fieldData: Record<string, unknown>;
}

/**
 * Read an item's draft state and field data. A failed read is reported as a
 * draft so the caller skips it: an item of unknown state is never republished
 * blindly.
 */
export async function readItemState(
  items: WebflowItemsApi,
  collectionId: string,
  itemId: string
): Promise<ItemState> {
  try {
    const item = await items.getItem(collectionId, itemId);
    return {
      isDraft: item?.isDraft === true,
      fieldData: (item?.fieldData ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    console.warn(
      `  ! getItem failed for ${itemId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { isDraft: true, fieldData: {} };
  }
}

/** Split rows into the live items a backfill may write and the drafts it skips. */
export function splitOutDrafts<T extends { isDraft: boolean }>(
  rows: T[]
): { published: T[]; drafts: T[] } {
  return {
    published: rows.filter((r) => !r.isDraft),
    drafts: rows.filter((r) => r.isDraft),
  };
}

/**
 * Write fields to an item that is already live, then republish it so the
 * change reaches the site.
 *
 * `isDraft` is deliberately not sent, so this can never change whether the
 * item is live, even if it was unpublished between the read and this write.
 * Only pass items `splitOutDrafts` put in `published`.
 *
 * `publish` is false for a dev run: dev and prod share one Webflow site, and a
 * dev script must never publish to it.
 */
export async function updatePublishedItem(
  items: WebflowItemsApi,
  collectionId: string,
  itemId: string,
  fieldData: Record<string, unknown>,
  options: { publish: boolean }
): Promise<void> {
  await items.updateItem(collectionId, itemId, { fieldData });
  if (options.publish) {
    await items.publishItem(collectionId, { itemIds: [itemId] });
  }
}
