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
    const { instructor, publish = false, isDev = false } = input;

    // Check if instructor already exists in Webflow by firebase-id
    const existingItem = await this.findByFirebaseId(instructor.id);

    let webflowItemId: string;
    let isNew: boolean;

    if (existingItem) {
      // Update existing item
      await this.updateItem(existingItem.id, instructor, isDev);
      webflowItemId = existingItem.id;
      isNew = false;
    } else {
      // Create new item
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
    publish = false
  ): Promise<boolean> {
    const existingItem = await this.findByFirebaseId(firebaseId);

    if (!existingItem) {
      return false;
    }

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
      // List items and filter by firebase-id field
      // Note: Webflow API doesn't support field filtering, so we fetch all and filter
      const response = await this.client.collections.items.listItems(
        this.collectionId,
        {
          limit: 100, // Reasonable limit for instructor collection
        }
      );

      const items = response.items ?? [];

      // Find item matching our firebase-id
      const matchingItem = items.find((item) => {
        const fieldData = item.fieldData as Record<string, unknown>;
        return fieldData?.['firebase-id'] === firebaseId;
      });

      // Ensure we have an ID before returning
      if (matchingItem && matchingItem.id) {
        return matchingItem as WebflowItemWithId;
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

    const response = await this.client.collections.items.createItem(
      this.collectionId,
      {
        isArchived: false,
        isDraft: false, // Publish immediately
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

    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: false,
      fieldData,
    });
  }
}
