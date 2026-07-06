/**
 * Music Together Section Service for Webflow CMS
 *
 * Handles syncing Music Together section data from Firebase to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Field Mapping:
 * - Firebase `id` → Webflow `firebase-id` (for lookup)
 * - Firebase `name` → Webflow `name` (title field)
 * - `mtSectionFirstSessionAt(section)` → Webflow `date-time` (native DateTime)
 * - Firebase `priceFullCents` → Webflow `price-full-cents`
 * - Firebase `capacityFamilies` → Webflow `capacity-families`
 * - Enriched family count → Webflow `spots-remaining`
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { MusicTogetherSection } from '@maple/ts/domain';
import {
  formatSessions,
  mtSectionFirstSessionAt,
  mtSpotsRemaining,
  mtSectionOffersInstallments,
} from '@maple/ts/domain';
import { generateSlug } from './artist.service';

/**
 * Input for syncing a Music Together section to Webflow CMS
 */
export interface SyncSectionInput {
  section: MusicTogetherSection;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment */
  isDev?: boolean;
  /** Current confirmed/pending family count for spots-remaining calculation */
  familyCount?: number;
  /**
   * Known Webflow item ID from a prior sync (stored on the section entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing a section to Webflow
 */
export interface SyncSectionResult {
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
 * Field data structure for Webflow CMS Music Together section items
 */
export interface MtSectionWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  [key: string]: unknown;
}

/**
 * Options for mapping a section to Webflow field data
 */
export interface MapSectionOptions {
  isDev: boolean;
  /** Current confirmed/pending family count. Defaults to 0. */
  familyCount?: number;
}

/**
 * Format a cents amount as a display dollar string. Whole dollars omit the
 * decimals ($132); fractional amounts show two places ($132.50).
 */
function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * Map a Firebase Music Together section to Webflow CMS field data.
 */
export function mapSectionToFieldData(
  section: MusicTogetherSection,
  options: MapSectionOptions
): MtSectionWebflowFieldData {
  const familyCount = options.familyCount ?? 0;
  const spotsRemaining = mtSpotsRemaining(section, familyCount);

  const priceDisplay = formatDollars(section.priceFullCents);

  const spotsDisplay =
    spotsRemaining <= 0
      ? 'Full'
      : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left`;

  // Format date and time display values from sessions.
  const { dateDisplay, timeDisplay } = formatSessions(
    section.sessions,
    'America/New_York'
  );

  const fieldData: MtSectionWebflowFieldData = {
    'firebase-id': section.id,
    name: section.name,
    slug: generateSlug(section.name),
    'is-dev-environment': options.isDev,
    'price-full-cents': section.priceFullCents,
    'capacity-families': section.capacityFamilies,
    'spots-remaining': spotsRemaining,
    status: section.status,
    'price-display': priceDisplay,
    'spots-display': spotsDisplay,
    'date-display': dateDisplay,
    'time-display': timeDisplay,
  };

  // The `date-time` Webflow field is a native DateTime — use the first
  // session so Webflow can sort sections chronologically. Guard undefined
  // (a section may not have any sessions yet).
  const firstSessionAt = mtSectionFirstSessionAt(section);
  if (firstSessionAt) {
    fieldData['date-time'] = firstSessionAt.toISOString();
  }

  if (section.location) {
    fieldData['location'] = section.location;
  }

  if (section.room) {
    fieldData['room'] = section.room;
  }

  if (section.description) {
    fieldData['description'] = section.description;
  }

  // Installment summary — only when the section actually offers a plan.
  if (mtSectionOffersInstallments(section)) {
    const plan = section.installmentPlan!;
    const allEqual = plan.every(
      (item) => item.amountCents === plan[0].amountCents
    );
    const total = plan.reduce((sum, item) => sum + item.amountCents, 0);
    fieldData['installment-summary'] = allEqual
      ? `or ${plan.length} payments of ${formatDollars(plan[0].amountCents)}`
      : `or ${plan.length} payments totaling ${formatDollars(total)}`;
  }

  return fieldData;
}

/**
 * Service for syncing Music Together sections to Webflow CMS
 */
export class MtSectionService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync a section to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   */
  async syncSection(input: SyncSectionInput): Promise<SyncSectionResult> {
    const {
      section,
      publish = false,
      isDev = false,
      familyCount,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      section.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let isNew: boolean;

    const fieldData = mapSectionToFieldData(section, { isDev, familyCount });

    if (existingItemId) {
      await this.updateItem(existingItemId, fieldData);
      webflowItemId = existingItemId;
      isNew = false;
    } else {
      const newItem = await this.createItem(fieldData);
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
   * Remove a section from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   */
  async removeSection(
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
   * Resolve the Webflow item ID for a section, preferring a known ID over a
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
      console.error('Error finding Webflow section item:', error);
      return null;
    }
  }

  private async createItem(
    fieldData: MtSectionWebflowFieldData
  ): Promise<WebflowItemWithId> {
    const response = await this.client.collections.items.createItem(
      this.collectionId,
      { isArchived: false, isDraft: false, fieldData }
    );

    if (!response.id) {
      throw new Error('Webflow API did not return an item ID after creation');
    }

    return response as WebflowItemWithId;
  }

  private async updateItem(
    itemId: string,
    fieldData: MtSectionWebflowFieldData
  ): Promise<void> {
    // Omit `slug` on update — Webflow auto-suffixes slug collisions on
    // create (e.g. `name-94fde` when `name` is taken), but on update it
    // 400s with a uniqueness error. Re-sending the deterministic slug
    // would freeze every later sync (incl. spots-remaining).
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: false,
      fieldData: fieldDataWithoutSlug,
    });
  }
}
