/**
 * Class Service for Webflow CMS
 *
 * Handles syncing class data from Firebase to Webflow CMS.
 * Follows one-way sync pattern: Firebase -> Webflow (as per ADR-016).
 *
 * Field Mapping:
 * - Firebase `id` -> Webflow `firebase-id` (for lookup)
 * - Firebase `name` -> Webflow `name` (title field)
 * - Firebase `sessions[0].dateTime` -> Webflow `date-time`
 * - Firebase `priceCents` -> Webflow `price-cents`
 * - Enriched `instructorName` / `categoryName` -> denormalized text fields
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { PublishableClass } from '@maple/ts/domain';
import { getFirstSession, formatSessions } from '@maple/ts/domain';

/**
 * Generate a URL-safe slug from a name.
 */
export function generateClassSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Input for syncing a class to Webflow CMS
 */
export interface SyncClassInput {
  classEntity: PublishableClass;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment */
  isDev?: boolean;
  /** Enriched instructor name (denormalized) */
  instructorName?: string;
  /** Enriched instructor bio (denormalized) */
  instructorBio?: string;
  /** Enriched instructor profile image URL (denormalized) */
  instructorImage?: string;
  /** Enriched category name (denormalized) */
  categoryName?: string;
  /**
   * Webflow item ID of this class's category in the Class Categories
   * collection. Populates the `category` Reference field, which is what lets
   * the class template page filter a Collection List to "other classes in this
   * class's category" without a Cloud Function call (#776).
   */
  categoryWebflowItemId?: string;
  /** Current registration count for spots remaining calculation */
  registrationCount?: number;
  /**
   * Known Webflow item ID from a prior sync (stored on the class entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing a class to Webflow
 */
export interface SyncClassResult {
  success: boolean;
  webflowItemId: string;
  /**
   * The slug Webflow actually assigned the item (including any auto-appended
   * collision suffix). Empty string if the API response omitted it. Persist
   * this so public `/classes/{slug}` links resolve to the real page.
   */
  webflowSlug: string;
  isNew: boolean;
}

/**
 * Webflow item with guaranteed ID
 */
interface WebflowItemWithId extends CollectionItem {
  id: string;
}

/**
 * Pull the slug out of a Webflow item response. `fieldData.slug` is the real,
 * Webflow-assigned slug; returns '' when the response shape lacks it so the
 * caller can decline to overwrite a previously stored slug.
 */
function extractSlug(item: CollectionItem | undefined): string {
  const fieldData = item?.fieldData as { slug?: unknown } | undefined;
  return typeof fieldData?.slug === 'string' ? fieldData.slug : '';
}

/**
 * Field data structure for Webflow CMS class items
 */
export interface ClassWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  'date-time': string;
  [key: string]: unknown;
}

/**
 * Options for mapping class to Webflow field data
 */
export interface MapClassOptions {
  isDev: boolean;
  instructorName?: string;
  instructorBio?: string;
  instructorImage?: string;
  categoryName?: string;
  categoryWebflowItemId?: string;
  registrationCount?: number;
}

/**
 * Map Firebase Class to Webflow CMS field data.
 */
export function mapClassToFieldData(
  classEntity: PublishableClass,
  options: MapClassOptions
): ClassWebflowFieldData {
  const spotsRemaining =
    options.registrationCount !== undefined
      ? classEntity.capacity - options.registrationCount
      : classEntity.capacity;

  // Format display values
  const priceDollars = classEntity.priceCents / 100;
  const priceDisplay = priceDollars === 0
    ? 'Free'
    : Number.isInteger(priceDollars)
      ? `$${priceDollars}`
      : `$${priceDollars.toFixed(2)}`;

  const baseDuration = classEntity.durationMinutes >= 60
    ? classEntity.durationMinutes % 60 === 0
      ? `${classEntity.durationMinutes / 60} hour${classEntity.durationMinutes / 60 === 1 ? '' : 's'}`
      : `${(classEntity.durationMinutes / 60).toFixed(1)} hours`
    : `${classEntity.durationMinutes} min`;
  // Multi-session classes: clarify duration is per session, not summed across sessions
  const durationDisplay = classEntity.sessions.length > 1
    ? `${baseDuration} each`
    : baseDuration;

  const spotsDisplay = spotsRemaining <= 0
    ? 'Waitlist Available'
    : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} remaining`;

  // Format date and time display values from sessions
  const { dateDisplay, timeDisplay } = formatSessions(
    classEntity.sessions,
    'America/New_York'
  );

  // The `date-time` Webflow field is a native DateTime — use the first
  // session so Webflow can sort classes chronologically.
  const firstSessionDate = getFirstSession(classEntity).dateTime;
  const dateTimeIso =
    firstSessionDate instanceof Date
      ? firstSessionDate.toISOString()
      : String(firstSessionDate);

  const fieldData: ClassWebflowFieldData = {
    'firebase-id': classEntity.id,
    name: classEntity.name,
    slug: generateClassSlug(classEntity.name),
    'is-dev-environment': options.isDev,
    'date-time': dateTimeIso,
    'duration-minutes': classEntity.durationMinutes,
    'price-cents': classEntity.priceCents,
    capacity: classEntity.capacity,
    'spots-remaining': spotsRemaining,
    'price-display': priceDisplay,
    'duration-display': durationDisplay,
    'spots-display': spotsDisplay,
    'date-display': dateDisplay,
    'time-display': timeDisplay,
    'skill-level':
      classEntity.skillLevel === 'all-levels'
        ? 'All Levels'
        : classEntity.skillLevel.charAt(0).toUpperCase() +
          classEntity.skillLevel.slice(1),
  };

  if (classEntity.shortDescription) {
    fieldData['short-description'] = classEntity.shortDescription;
  }

  if (classEntity.description) {
    fieldData['description'] = classEntity.description;
  }

  if (classEntity.imageUrl) {
    fieldData['class-image'] = {
      url: classEntity.imageUrl,
      alt: `${classEntity.name} class image`,
    };
  }

  if (classEntity.galleryImages && classEntity.galleryImages.length > 0) {
    fieldData['class-gallery'] = classEntity.galleryImages.map((img) => ({
      url: img.url,
      alt: img.alt,
    }));
  }

  if (classEntity.location) {
    fieldData['location'] = classEntity.location;
  }

  if (classEntity.materialsIncluded) {
    fieldData['materials-included'] = classEntity.materialsIncluded;
  }

  if (classEntity.whatToBring) {
    fieldData['what-to-bring'] = classEntity.whatToBring;
  }

  if (classEntity.minimumAge !== undefined) {
    fieldData['minimum-age'] = classEntity.minimumAge;
  }

  if (options.instructorName) {
    fieldData['instructor-name'] = options.instructorName;
  }

  if (options.instructorBio) {
    fieldData['instructor-bio'] = options.instructorBio;
  }

  if (options.instructorImage) {
    fieldData['instructor-image'] = {
      url: options.instructorImage,
      alt: options.instructorName
        ? `${options.instructorName} profile photo`
        : 'Instructor profile photo',
    };
  }

  if (options.categoryName) {
    fieldData['category-name'] = options.categoryName;
  }

  // The `category` Reference field drives the native related-classes list on
  // the class template page. Only set when known — writing an empty string
  // would clear a previously-linked reference on every partial sync.
  if (options.categoryWebflowItemId) {
    fieldData['category'] = options.categoryWebflowItemId;
  }

  return fieldData;
}

/**
 * Service for syncing classes to Webflow CMS
 */
export class ClassService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync a class to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   */
  async syncClass(input: SyncClassInput): Promise<SyncClassResult> {
    const {
      classEntity,
      publish = false,
      isDev = false,
      instructorName,
      instructorBio,
      instructorImage,
      categoryName,
      categoryWebflowItemId,
      registrationCount,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      classEntity.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let webflowSlug: string;
    let isNew: boolean;

    const fieldData = mapClassToFieldData(classEntity, {
      isDev,
      instructorName,
      instructorBio,
      instructorImage,
      categoryName,
      categoryWebflowItemId,
      registrationCount,
    });

    if (existingItemId) {
      webflowSlug = await this.updateItem(existingItemId, fieldData, isDev);
      webflowItemId = existingItemId;
      isNew = false;
    } else {
      const newItem = await this.createItem(fieldData, isDev);
      webflowItemId = newItem.id;
      webflowSlug = extractSlug(newItem);
      isNew = true;
    }

    if (publish) {
      await this.publishItem(webflowItemId);
    }

    return { success: true, webflowItemId, webflowSlug, isNew };
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
   * List the Webflow item IDs currently LIVE (published) in the classes
   * collection, keyed by each item's `firebase-id`.
   *
   * `listItemsLive` returns only published items, so drafts are excluded by
   * construction — including every dev-synced class (see `createItem`). That
   * makes this safe to use as the "what is actually public right now" source
   * of truth without a separate dev filter.
   */
  async listLiveItemIdsByFirebaseId(): Promise<Map<string, string>> {
    const PAGE_SIZE = 100;
    const byFirebaseId = new Map<string, string>();
    let offset = 0;

    // Bound the loop so a misbehaving API can't spin forever, matching
    // `findByFirebaseId`.
    while (offset < 5000) {
      const response = await this.client.collections.items.listItemsLive(
        this.collectionId,
        { limit: PAGE_SIZE, offset }
      );

      const items = response.items ?? [];
      for (const item of items) {
        const fieldData = item.fieldData as Record<string, unknown>;
        const firebaseId = fieldData?.['firebase-id'];
        if (item.id && typeof firebaseId === 'string') {
          byFirebaseId.set(firebaseId, item.id);
        }
      }

      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return byFirebaseId;
  }

  /**
   * Unpublish items from the live site.
   *
   * Webflow's live-delete endpoint *unpublishes* and sets `isDraft = true` —
   * it does NOT delete the CMS item. The class keeps its `webflowItemId` and
   * slug, so a later sync can republish it untouched (e.g. if a class is
   * rescheduled into the future).
   */
  async unpublishItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;

    // Webflow caps bulk live-deletes at 100 items per request.
    const BATCH_SIZE = 100;
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      await this.client.collections.items.deleteItemsLive(this.collectionId, {
        items: itemIds.slice(i, i + BATCH_SIZE).map((id) => ({ id })),
      });
    }
  }

  /**
   * Remove a class from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   */
  async removeClass(
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
   * Resolve the Webflow item ID for a class, preferring a known ID over a
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
      console.error('Error finding Webflow class item:', error);
      return null;
    }
  }

  private async createItem(
    fieldData: ClassWebflowFieldData,
    isDev: boolean
  ): Promise<WebflowItemWithId> {
    // Dev-synced items are kept as drafts so a full-site publish can never make
    // them live (mirrors the MT section/demo sync). Prod items are non-draft.
    const response = await this.client.collections.items.createItem(
      this.collectionId,
      { isArchived: false, isDraft: isDev, fieldData }
    );

    if (!response.id) {
      throw new Error('Webflow API did not return an item ID after creation');
    }

    return response as WebflowItemWithId;
  }

  /**
   * Update an item's field data. Returns the item's real Webflow slug from
   * the response (unchanged by the update — we never re-send it), or '' if the
   * response omits it.
   */
  private async updateItem(
    itemId: string,
    fieldData: ClassWebflowFieldData,
    isDev: boolean
  ): Promise<string> {
    // Omit `slug` on update — Webflow auto-suffixes slug collisions on
    // create (e.g. `name-94fde` when `name` is taken), but on update it
    // 400s with a uniqueness error. Re-sending the deterministic slug
    // would freeze every later sync (incl. spots-remaining).
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    const response = await this.client.collections.items.updateItem(
      this.collectionId,
      itemId,
      {
        isArchived: false,
        isDraft: isDev,
        fieldData: fieldDataWithoutSlug,
      }
    );
    return extractSlug(response);
  }
}
