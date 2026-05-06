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
  /** Current registration count for spots remaining calculation */
  registrationCount?: number;
}

/**
 * Result from syncing a class to Webflow
 */
export interface SyncClassResult {
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

  const durationDisplay = classEntity.durationMinutes >= 60
    ? classEntity.durationMinutes % 60 === 0
      ? `${classEntity.durationMinutes / 60} hour${classEntity.durationMinutes / 60 === 1 ? '' : 's'}`
      : `${(classEntity.durationMinutes / 60).toFixed(1)} hours`
    : `${classEntity.durationMinutes} min`;

  const spotsDisplay = spotsRemaining <= 0
    ? 'Class Full'
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
      registrationCount,
    } = input;

    const existingItem = await this.findByFirebaseId(classEntity.id);

    let webflowItemId: string;
    let isNew: boolean;

    const fieldData = mapClassToFieldData(classEntity, {
      isDev,
      instructorName,
      instructorBio,
      instructorImage,
      categoryName,
      registrationCount,
    });

    if (existingItem) {
      await this.updateItem(existingItem.id, fieldData);
      webflowItemId = existingItem.id;
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
   * Remove a class from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   */
  async removeClass(firebaseId: string, publish = false): Promise<boolean> {
    const existingItem = await this.findByFirebaseId(firebaseId);
    if (!existingItem) return false;

    if (publish) {
      await this.client.collections.items.deleteItemLive(
        this.collectionId,
        existingItem.id
      );
    } else {
      await this.client.collections.items.deleteItem(
        this.collectionId,
        existingItem.id
      );
    }
    return true;
  }

  /**
   * Find a Webflow CMS item by Firebase ID
   */
  private async findByFirebaseId(
    firebaseId: string
  ): Promise<WebflowItemWithId | null> {
    try {
      const response = await this.client.collections.items.listItems(
        this.collectionId,
        { limit: 100 }
      );

      const items = response.items ?? [];
      const matchingItem = items.find((item) => {
        const fieldData = item.fieldData as Record<string, unknown>;
        return fieldData?.['firebase-id'] === firebaseId;
      });

      if (matchingItem?.id) {
        return matchingItem as WebflowItemWithId;
      }

      return null;
    } catch (error) {
      console.error('Error finding Webflow class item:', error);
      return null;
    }
  }

  private async createItem(
    fieldData: ClassWebflowFieldData
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
    fieldData: ClassWebflowFieldData
  ): Promise<void> {
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: false,
      fieldData,
    });
  }
}
