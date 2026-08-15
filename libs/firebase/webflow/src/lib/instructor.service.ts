/**
 * Instructor Service for Webflow CMS
 *
 * Handles syncing instructor data from Firebase to Webflow CMS.
 * Follows one-way sync pattern: Firebase -> Webflow (as per ADR-016).
 *
 * Field Mapping:
 * - Firebase `id` -> Webflow `firebase-id` (for lookup)
 * - Firebase `name` -> Webflow `name` (title field)
 * - Firebase `photoUrl` -> Webflow `profile-image` (URL reference)
 * - Firebase `bio` -> Webflow `bio` (rich text)
 * - Firebase `specialties` -> Webflow `specialties` (plain text, comma-separated)
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { Instructor } from '@maple/ts/domain';
import { generateSlug } from './artist.service';

/**
 * Input for syncing an instructor to Webflow CMS
 */
export interface SyncInstructorInput {
  instructor: Instructor;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment */
  isDev?: boolean;
  /**
   * Known Webflow item ID from a prior sync (stored on the instructor entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing an instructor to Webflow
 */
export interface SyncInstructorResult {
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
 * Field data structure for Webflow CMS instructor items
 * Includes required name/slug fields plus our custom fields
 */
export interface InstructorWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  'profile-image'?: {
    url: string;
    alt?: string;
  };
  bio?: string;
  specialties?: string;
  [key: string]: unknown;
}

/**
 * Options for mapping instructor to Webflow field data
 */
export interface MapInstructorOptions {
  /** Whether this sync is from a dev environment */
  isDev: boolean;
}

/**
 * Map Firebase Instructor to Webflow CMS field data.
 * Exported for testing purposes.
 *
 * Synced fields (overwritten on each sync):
 * - firebase-id: For sync reference
 * - name: Title field (required by Webflow)
 * - slug: URL slug (required by Webflow, auto-generated from name)
 * - profile-image: URL to Firebase Storage image
 * - is-dev-environment: True if synced from dev environment
 * - bio: Instructor bio text
 * - specialties: Comma-separated list of specialties
 *
 * @param instructor - Firebase instructor to map
 * @param options - Mapping options (isDev flag)
 * @returns Webflow CMS field data
 */
export function mapInstructorToFieldData(
  instructor: Instructor,
  options: MapInstructorOptions
): InstructorWebflowFieldData {
  const fieldData: InstructorWebflowFieldData = {
    'firebase-id': instructor.id,
    name: instructor.name,
    slug: generateSlug(instructor.name),
    'is-dev-environment': options.isDev,
  };

  // Add profile image if available
  if (instructor.photoUrl) {
    fieldData['profile-image'] = {
      url: instructor.photoUrl,
      alt: `${instructor.name} profile photo`,
    };
  }

  // Add bio if available
  if (instructor.bio) {
    fieldData['bio'] = instructor.bio;
  }

  // Add specialties as comma-separated string
  if (instructor.specialties && instructor.specialties.length > 0) {
    fieldData['specialties'] = instructor.specialties.join(', ');
  }

  return fieldData;
}

/**
 * Service for syncing instructors to Webflow CMS
 */
export class InstructorService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync an instructor to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   * Optionally publishes the item to the live site.
   *
   * @param input - Instructor data to sync (includes publish and isDev flags)
   * @returns Result with Webflow item ID
   */
  async syncInstructor(input: SyncInstructorInput): Promise<SyncInstructorResult> {
    const {
      instructor,
      publish = false,
      isDev = false,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      instructor.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let isNew: boolean;

    if (existingItemId) {
      await this.updateItem(existingItemId, instructor, isDev);
      webflowItemId = existingItemId;
      isNew = false;
    } else {
      const newItem = await this.createItem(instructor, isDev);
      webflowItemId = newItem.id;
      isNew = true;
    }

    // Publish item to live site if requested
    if (publish) {
      await this.publishItem(webflowItemId);
    }

    return {
      success: true,
      webflowItemId,
      isNew,
    };
  }

  /**
   * Publish an item to the live Webflow site.
   * This makes the item visible on the public website.
   *
   * @param itemId - Webflow item ID to publish
   */
  async publishItem(itemId: string): Promise<void> {
    await this.client.collections.items.publishItem(this.collectionId, {
      itemIds: [itemId],
    });
  }

  /**
   * Remove an instructor from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   *
   * @param firebaseId - Firebase instructor ID
   * @param publish - Whether to also publish the deletion to the live site
   * @returns True if deleted, false if not found
   */
  async removeInstructor(
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
   * Resolve the Webflow item ID for an instructor, preferring a known ID
   * over a collection scan. Returns `null` if no matching item exists yet.
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
   * Create a new instructor item in Webflow CMS
   */
  private async createItem(
    instructor: Instructor,
    isDev: boolean
  ): Promise<WebflowItemWithId> {
    const fieldData = mapInstructorToFieldData(instructor, { isDev });

    // Dev-synced items are kept as drafts so a full-site publish can never make
    // them live (mirrors the class/MT section sync). Prod items are non-draft.
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
   * Update an existing instructor item in Webflow CMS
   */
  private async updateItem(
    itemId: string,
    instructor: Instructor,
    isDev: boolean
  ): Promise<void> {
    const fieldData = mapInstructorToFieldData(instructor, { isDev });

    // Omit `slug` on update — Webflow auto-suffixes slug collisions on
    // create (e.g. `name-94fde` when `name` is taken), but on update it
    // 400s with a uniqueness error and freezes every later sync.
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: isDev,
      fieldData: fieldDataWithoutSlug,
    });
  }
}
