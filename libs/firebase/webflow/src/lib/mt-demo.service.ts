/**
 * Music Together Demo Service for Webflow CMS
 *
 * Handles syncing Music Together demo-class data from Firebase to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Demos are FREE try-a-class events — there is NO price, NO installment plan,
 * and NO Square. This service mirrors `MtSectionService` but drops every
 * money-related field.
 *
 * Dev-leak guard: dev-synced items are always created/kept as `isDraft: true`
 * and never published, so a full-site publish can never make a dev demo live.
 * (This is the exact gap that leaked dev *classes*, where the sync left dev
 * items non-draft.)
 *
 * Field Mapping:
 * - Firebase `id` → Webflow `firebase-id` (for lookup)
 * - `mtDemoDisplayLabel(demo)` → Webflow `name` (title field)
 * - Firebase `dateTime` → Webflow `date-time` (native DateTime)
 * - Firebase `location` → Webflow `location`
 * - Firebase `capacityFamilies` → Webflow `capacity-families`
 * - `max(0, capacityFamilies − confirmedCount)` → Webflow `spots-remaining`
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { MusicTogetherDemo } from '@maple/ts/domain';
import {
  mtDemoDerivedStatus,
  mtDemoDisplayLabel,
  mtDemoDurationMinutes,
  mtDemoSpotsRemaining,
} from '@maple/ts/domain';
import { generateSlug } from './artist.service';

/**
 * Input for syncing a Music Together demo to Webflow CMS
 */
export interface SyncDemoInput {
  demo: MusicTogetherDemo;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment (drives isDraft + no publish) */
  isDev?: boolean;
  /** Current confirmed RSVP (family) count for spots-remaining calculation */
  confirmedCount?: number;
  /**
   * Known Webflow item ID from a prior sync (stored on the demo entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing a demo to Webflow
 */
export interface SyncDemoResult {
  success: boolean;
  webflowItemId: string;
  isNew: boolean;
}

/**
 * Webflow item with guaranteed ID
 */
interface WebflowItemWithId extends CollectionItem {
  id: string;
}

/**
 * Field data structure for Webflow CMS Music Together demo items
 */
export interface MtDemoWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  [key: string]: unknown;
}

/**
 * Options for mapping a demo to Webflow field data
 */
export interface MapDemoOptions {
  isDev: boolean;
  /** Current confirmed RSVP (family) count. Defaults to 0. */
  confirmedCount?: number;
}

/**
 * Format the day + date for the Webflow `date-display` field, e.g.
 * "Saturday, August 3". Derived from the demo's dateTime in
 * America/New_York (DST-correct via `Intl.DateTimeFormat`).
 */
export function formatDemoDateDisplay(demo: Pick<MusicTogetherDemo, 'dateTime'>): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(demo.dateTime));
}

/**
 * Format the class time range for the Webflow `time-display` field, e.g.
 * "10:00–10:45 AM".
 *
 * Derived from the demo's dateTime in America/New_York (DST-correct via
 * `Intl.DateTimeFormat`). The end time is the start plus the demo's effective
 * duration. A single meridiem trails the range.
 */
export function formatDemoTimeDisplay(
  demo: Pick<MusicTogetherDemo, 'dateTime' | 'durationMinutes'>
): string {
  const timeZone = 'America/New_York';
  const start = new Date(demo.dateTime);

  // Intl emits a narrow no-break space (U+202F) before AM/PM in modern ICU;
  // normalize it to a plain space so output is stable across runtimes.
  const formatTime = (date: Date): string =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone,
    })
      .format(date)
      .replace(/[\u202f\u00a0]/g, ' ');

  // Start time without its meridiem — the range carries a single "AM"/"PM".
  const startHM = formatTime(start).replace(/\s*[AP]M$/i, '');

  const end = new Date(
    start.getTime() + mtDemoDurationMinutes(demo) * 60_000
  );
  const endHM = formatTime(end);

  return `${startHM}–${endHM}`;
}

/**
 * Format the class length for the Webflow `duration-display` field, e.g.
 * "45 minutes".
 */
export function formatDemoDurationDisplay(
  demo: Pick<MusicTogetherDemo, 'durationMinutes'>
): string {
  const minutes = mtDemoDurationMinutes(demo);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Map a Firebase Music Together demo to Webflow CMS field data.
 */
export function mapDemoToFieldData(
  demo: MusicTogetherDemo,
  options: MapDemoOptions
): MtDemoWebflowFieldData {
  const confirmedCount = options.confirmedCount ?? 0;
  const spotsRemaining = mtDemoSpotsRemaining(demo, confirmedCount);

  const spotsDisplay =
    spotsRemaining <= 0
      ? 'Full'
      : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left`;

  const name = mtDemoDisplayLabel(demo);

  const fieldData: MtDemoWebflowFieldData = {
    'firebase-id': demo.id,
    name,
    slug: generateSlug(name),
    'is-dev-environment': options.isDev,
    location: demo.location,
    'capacity-families': demo.capacityFamilies,
    'spots-remaining': spotsRemaining,
    // Derived from the demo's date + live confirmed count. Only visible,
    // future-dated demos reach Webflow, so this is `open` or `full` in
    // practice; `past` is defensive.
    status: mtDemoDerivedStatus(demo, new Date(), confirmedCount),
    'spots-display': spotsDisplay,
    'date-display': formatDemoDateDisplay(demo),
    'time-display': formatDemoTimeDisplay(demo),
    'duration-display': formatDemoDurationDisplay(demo),
  };

  // The `date-time` Webflow field is a native DateTime — use the demo's
  // dateTime so Webflow can sort demos chronologically.
  fieldData['date-time'] = new Date(demo.dateTime).toISOString();

  return fieldData;
}

/**
 * Service for syncing Music Together demos to Webflow CMS
 */
export class MtDemoWebflowService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync a demo to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   *
   * Dev-leak guard: in dev the item is created/kept as `isDraft: true` and
   * never published, so a full-site publish can't make it live.
   */
  async syncDemo(input: SyncDemoInput): Promise<SyncDemoResult> {
    const {
      demo,
      publish = false,
      isDev = false,
      confirmedCount,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      demo.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let isNew: boolean;

    const fieldData = mapDemoToFieldData(demo, { isDev, confirmedCount });

    // Dev items are drafts so a full-site publish never makes them live.
    const isDraft = isDev;

    if (existingItemId) {
      await this.updateItem(existingItemId, fieldData, isDraft);
      webflowItemId = existingItemId;
      isNew = false;
    } else {
      const newItem = await this.createItem(fieldData, isDraft);
      webflowItemId = newItem.id;
      isNew = true;
    }

    if (publish) {
      await this.publishItem(webflowItemId);
    }

    return { success: true, webflowItemId, isNew };
  }

  /**
   * Publish an item to the live Webflow site.
   */
  async publishItem(itemId: string): Promise<void> {
    await this.client.collections.items.publishItem(this.collectionId, {
      itemIds: [itemId],
    });
  }

  /**
   * Remove a demo from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   */
  async removeDemo(
    firebaseId: string,
    publish = false,
    knownWebflowItemId?: string
  ): Promise<boolean> {
    const existingItemId = await this.resolveExistingItemId(
      firebaseId,
      knownWebflowItemId
    );
    if (!existingItemId) return false;

    if (publish) {
      await this.client.collections.items.deleteItemLive(
        this.collectionId,
        existingItemId
      );
    } else {
      await this.client.collections.items.deleteItem(
        this.collectionId,
        existingItemId
      );
    }
    return true;
  }

  /**
   * Resolve the Webflow item ID for a demo, preferring a known ID over a
   * collection scan. Returns `null` if no matching item exists yet (caller
   * should create one).
   */
  private async resolveExistingItemId(
    firebaseId: string,
    knownWebflowItemId: string | undefined
  ): Promise<string | null> {
    if (knownWebflowItemId) {
      const verified = await this.getItemById(knownWebflowItemId);
      if (verified) return verified.id;
      // Item was deleted in Webflow; fall through to a fresh scan so we can
      // recreate (or pick up a different item with this firebase-id).
    }

    const found = await this.findByFirebaseId(firebaseId);
    return found?.id ?? null;
  }

  /**
   * Fetch a Webflow item by its Webflow ID. Returns `null` if missing —
   * 404s and transient errors are treated as "not found" so the caller can
   * fall back to a scan or recreate.
   */
  private async getItemById(
    itemId: string
  ): Promise<WebflowItemWithId | null> {
    try {
      const item = await this.client.collections.items.getItem(
        this.collectionId,
        itemId
      );
      return item?.id ? (item as WebflowItemWithId) : null;
    } catch (error) {
      console.warn('Webflow getItem failed, falling back to scan:', {
        itemId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Find a Webflow CMS item by Firebase ID. Paginates through the entire
   * collection — Webflow's listItems caps page size at 100, so we must
   * page until we either match or exhaust the collection.
   */
  private async findByFirebaseId(
    firebaseId: string
  ): Promise<WebflowItemWithId | null> {
    const PAGE_SIZE = 100;
    let offset = 0;

    try {
      // Bound the loop so a misbehaving API can't spin forever; 5000 items
      // is far above any realistic collection size for this site.
      while (offset < 5000) {
        const response = await this.client.collections.items.listItems(
          this.collectionId,
          { limit: PAGE_SIZE, offset }
        );

        const items = response.items ?? [];
        const matchingItem = items.find((item) => {
          const fieldData = item.fieldData as Record<string, unknown>;
          return fieldData?.['firebase-id'] === firebaseId;
        });

        if (matchingItem?.id) {
          return matchingItem as WebflowItemWithId;
        }

        if (items.length < PAGE_SIZE) {
          return null;
        }

        offset += PAGE_SIZE;
      }
      return null;
    } catch (error) {
      console.error('Error finding Webflow demo item:', error);
      return null;
    }
  }

  private async createItem(
    fieldData: MtDemoWebflowFieldData,
    isDraft: boolean
  ): Promise<WebflowItemWithId> {
    const response = await this.client.collections.items.createItem(
      this.collectionId,
      { isArchived: false, isDraft, fieldData }
    );

    if (!response.id) {
      throw new Error('Webflow API did not return an item ID after creation');
    }

    return response as WebflowItemWithId;
  }

  private async updateItem(
    itemId: string,
    fieldData: MtDemoWebflowFieldData,
    isDraft: boolean
  ): Promise<void> {
    // Omit `slug` on update — Webflow auto-suffixes slug collisions on
    // create (e.g. `name-94fde` when `name` is taken), but on update it
    // 400s with a uniqueness error. Re-sending the deterministic slug
    // would freeze every later sync (incl. spots-remaining).
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft,
      fieldData: fieldDataWithoutSlug,
    });
  }
}
