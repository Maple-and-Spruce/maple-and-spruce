/**
 * Class Category Service for Webflow CMS
 *
 * Handles syncing class categories from Firebase to Webflow CMS.
 * Follows the one-way sync pattern: Firebase -> Webflow (ADR-016).
 *
 * Field Mapping:
 * - Firebase `id`          -> Webflow `firebase-id` (for lookup)
 * - Firebase `name`        -> Webflow `name` (title field)
 * - Firebase `description` -> Webflow `description`
 * - Firebase `order`       -> Webflow `order`
 * - Firebase `icon`        -> Webflow `icon`
 *
 * This collection exists so the Classes collection can carry a `category`
 * **Reference** field. Webflow can only filter a Collection List against the
 * current item's field when that field is a reference — a denormalized text
 * field like `category-name` cannot express "other classes in this class's
 * category". That filter is what renders related classes natively on the class
 * template page, replacing a Cloud Function round trip on the sold-out panel.
 *
 * `galleryImages` is deliberately not synced: it is an internal shared image
 * pool for the admin app, not public page content.
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { ClassCategory } from '@maple/ts/domain';
import { generateSlug } from './artist.service';

/**
 * Input for syncing a class category to Webflow CMS
 */
export interface SyncClassCategoryInput {
  category: ClassCategory;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment */
  isDev?: boolean;
  /**
   * Known Webflow item ID from a prior sync (stored on the category entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing a class category to Webflow
 */
export interface SyncClassCategoryResult {
  success: boolean;
  webflowItemId: string;
  isNew: boolean;
}

/**
 * Webflow item with guaranteed ID (after creation/lookup)
 */
interface WebflowItemWithId extends CollectionItem {
  id: string;
}

/**
 * Field data structure for Webflow CMS class category items
 */
export interface ClassCategoryWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  description?: string;
  order?: number;
  icon?: string;
  [key: string]: unknown;
}

/**
 * Options for mapping a class category to Webflow field data
 */
export interface MapClassCategoryOptions {
  /** Whether this sync is from a dev environment */
  isDev: boolean;
}

/**
 * Map a Firebase ClassCategory to Webflow CMS field data.
 * Exported for testing purposes.
 */
export function mapClassCategoryToFieldData(
  category: ClassCategory,
  options: MapClassCategoryOptions
): ClassCategoryWebflowFieldData {
  const fieldData: ClassCategoryWebflowFieldData = {
    'firebase-id': category.id,
    name: category.name,
    slug: generateSlug(category.name),
    'is-dev-environment': options.isDev,
    // `order` is always present on the entity and drives category ordering in
    // any Webflow list, so it is sent unconditionally (including 0).
    order: category.order,
  };

  if (category.description) {
    fieldData['description'] = category.description;
  }

  if (category.icon) {
    fieldData['icon'] = category.icon;
  }

  return fieldData;
}

/**
 * Service for syncing class categories to Webflow CMS
 */
export class ClassCategoryService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync a class category to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   */
  async syncClassCategory(
    input: SyncClassCategoryInput
  ): Promise<SyncClassCategoryResult> {
    const {
      category,
      publish = false,
      isDev = false,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      category.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let isNew: boolean;

    if (existingItemId) {
      await this.updateItem(existingItemId, category, isDev);
      webflowItemId = existingItemId;
      isNew = false;
    } else {
      const newItem = await this.createItem(category, isDev);
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
   * Remove a class category from Webflow CMS.
   *
   * Deleting a referenced category clears the `category` field on every class
   * item pointing at it, which empties those classes' related lists until the
   * classes re-sync. Categories are only deleted once no classes use them
   * (`ClassCategoryRepository.hasClasses` gates the admin delete), so this is
   * not a live-site concern in practice.
   *
   * @returns True if deleted, false if not found
   */
  async removeClassCategory(
    firebaseId: string,
    publish = false,
    knownWebflowItemId?: string
  ): Promise<boolean> {
    const existingItemId = await this.resolveExistingItemId(
      firebaseId,
      knownWebflowItemId
    );

    if (!existingItemId) {
      return false;
    }

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
   * Resolve the Webflow item ID for a category, preferring a known ID over a
   * collection scan. Returns `null` if no matching item exists yet.
   */
  private async resolveExistingItemId(
    firebaseId: string,
    knownWebflowItemId: string | undefined
  ): Promise<string | null> {
    if (knownWebflowItemId) {
      const verified = await this.getItemById(knownWebflowItemId);
      if (verified) return verified.id;
      // Item gone in Webflow — fall through to scan + recreate.
    }

    const found = await this.findByFirebaseId(firebaseId);
    return found?.id ?? null;
  }

  /**
   * Fetch a Webflow item by its Webflow ID. Returns `null` on 404 or
   * transient errors so the caller can fall back to a scan.
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
   * Find a Webflow CMS item by Firebase ID. Webflow doesn't support field
   * filters, so we paginate through the collection until we match or
   * exhaust it. Page size capped at 100 by the API.
   */
  private async findByFirebaseId(
    firebaseId: string
  ): Promise<WebflowItemWithId | null> {
    const PAGE_SIZE = 100;
    let offset = 0;

    try {
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

        if (matchingItem && matchingItem.id) {
          return matchingItem as WebflowItemWithId;
        }

        if (items.length < PAGE_SIZE) {
          return null;
        }

        offset += PAGE_SIZE;
      }
      return null;
    } catch (error) {
      console.error('Error finding Webflow item by Firebase ID:', error);
      return null;
    }
  }

  /**
   * Create a new class category item in Webflow CMS
   */
  private async createItem(
    category: ClassCategory,
    isDev: boolean
  ): Promise<WebflowItemWithId> {
    const fieldData = mapClassCategoryToFieldData(category, { isDev });

    // Dev-synced items are kept as drafts so a full-site publish can never make
    // them live (mirrors the class/instructor/MT sync). Prod items are non-draft.
    const response = await this.client.collections.items.createItem(
      this.collectionId,
      {
        isArchived: false,
        isDraft: isDev,
        fieldData,
      }
    );

    if (!response.id) {
      throw new Error('Webflow API did not return an item ID after creation');
    }

    return response as WebflowItemWithId;
  }

  /**
   * Update an existing class category item in Webflow CMS
   */
  private async updateItem(
    itemId: string,
    category: ClassCategory,
    isDev: boolean
  ): Promise<void> {
    const fieldData = mapClassCategoryToFieldData(category, { isDev });

    // Omit `slug` on update — Webflow auto-suffixes slug collisions on create
    // (e.g. `name-94fde` when `name` is taken), but on update it 400s with a
    // uniqueness error and freezes every later sync.
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: isDev,
      fieldData: fieldDataWithoutSlug,
    });
  }
}
