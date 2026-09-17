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
   * class's category" without a Cloud Function call (legacy #776).
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
 * A confirmed "this item does not exist" — the ONLY error safe to create on.
 *
 * Anything else (429, 5xx, a socket timeout) means "I could not tell", and
 * treating that as absence is what turns one flaky request into a permanent
 * duplicate CMS item that no later sync will ever reconcile.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 404
  );
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
    // Webflow conditional visibility can't be authored through the API, but an
    // element's visibility CAN bind to a Switch field. This is what shows the
    // sold-out "Other upcoming dates" list on the class template page, so the
    // rule lives here in code rather than as a Designer-only setting (legacy #776).
    'is-full': spotsRemaining <= 0,
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
   * Syncs in flight, keyed by class id, so concurrent calls for the SAME class
   * queue instead of racing. Static: two triggers in one container share a
   * module instance, which is the common case here — `syncClassToWebflow` and
   * `syncRegistrationCount` both sync the same class.
   *
   * This closes the same-instance race only. Two different Cloud Run instances
   * still have no shared lock, and closing THAT needs a Firestore lease, which
   * this service has no access to by design. The reconciliation in
   * `resolveExistingItemId` is what covers the cross-instance case: it cannot
   * prevent the second create, but it converges on one item afterwards.
   */
  private static readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Sync a class to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   *
   * Serialized per class — see `inFlight`.
   */
  async syncClass(input: SyncClassInput): Promise<SyncClassResult> {
    const key = input.classEntity.id;
    const previous = ClassService.inFlight.get(key) ?? Promise.resolve();
    // Chain off the previous sync for this class, ignoring whether it failed:
    // one sync's failure must not cascade into the next.
    const run = previous
      .catch(() => undefined)
      .then(() => this.syncClassSerialized(input));
    ClassService.inFlight.set(key, run);
    try {
      return await run;
    } finally {
      if (ClassService.inFlight.get(key) === run) {
        ClassService.inFlight.delete(key);
      }
    }
  }

  private async syncClassSerialized(
    input: SyncClassInput
  ): Promise<SyncClassResult> {
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
      // A confirmed 404 — the item really was deleted in Webflow. (A transient
      // failure threw rather than landing here.) Fall through to a fresh scan
      // so we can recreate, or adopt another item with this firebase-id.
    }

    const matches = await this.findAllByFirebaseId(firebaseId);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].id;

    // More than one item for a single class means a create raced (or did so
    // historically). Converge: keep the oldest — deterministic, so two racing
    // instances make the same choice — and delete the rest. Left alone, the
    // item nothing points at is never updated again and its spot count freezes
    // at creation time, which is how one class ends up rendering two cards
    // that disagree about availability.
    const [keeper, ...extras] = [...matches].sort((a, b) =>
      String(a.createdOn ?? '').localeCompare(String(b.createdOn ?? ''))
    );
    for (const extra of extras) {
      console.warn('Reconciling duplicate Webflow item for class', {
        firebaseId,
        keptItemId: keeper.id,
        deletedItemId: extra.id,
      });
      // Unpublish first so it also leaves the live site, then remove the
      // staged item. A 404 on the second call means the first already removed
      // it outright, which is success, not failure.
      try {
        await this.client.collections.items.deleteItemLive(
          this.collectionId,
          extra.id
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      try {
        await this.client.collections.items.deleteItem(
          this.collectionId,
          extra.id
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    return keeper.id;
  }

  /**
   * Fetch a Webflow item by its Webflow ID. Returns `null` ONLY on a
   * confirmed 404; every other failure is re-thrown.
   *
   * This used to swallow all errors and return `null`, which the caller reads
   * as "no item exists" and answers by creating one. A single 429 during a
   * burst was therefore enough to mint a duplicate.
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
      if (!isNotFound(error)) {
        throw error;
      }
      console.warn('Webflow item is gone (404), falling back to scan:', {
        itemId,
      });
      return null;
    }
  }

  /**
   * Find a Webflow CMS item by Firebase ID. Paginates through the entire
   * collection — Webflow's listItems caps page size at 100, so we must
   * page until we either match or exhaust the collection.
   */
  private async findAllByFirebaseId(
    firebaseId: string
  ): Promise<WebflowItemWithId[]> {
    const PAGE_SIZE = 100;
    let offset = 0;
    const matches: WebflowItemWithId[] = [];

    // Deliberately NOT wrapped in try/catch. A scan that failed is not a scan
    // that found nothing, and the caller's answer to "found nothing" is to
    // create an item. Let the error propagate and let the next write retry.
    //
    // Collects EVERY match rather than the first, because Webflow enforces no
    // uniqueness on `firebase-id` — so duplicates are representable, and the
    // caller has to be able to see and reconcile them.
    //
    // Bound the loop so a misbehaving API can't spin forever; 5000 items is
    // far above any realistic collection size for this site.
    while (offset < 5000) {
      const response = await this.client.collections.items.listItems(
        this.collectionId,
        { limit: PAGE_SIZE, offset }
      );

      const items = response.items ?? [];
      for (const item of items) {
        const fieldData = item.fieldData as Record<string, unknown>;
        if (item.id && fieldData?.['firebase-id'] === firebaseId) {
          matches.push(item as WebflowItemWithId);
        }
      }

      if (items.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return matches;
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
