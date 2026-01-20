/**
 * Artist Service for Webflow CMS
 *
 * Handles syncing artist data from Firebase to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Field Mapping:
 * - Firebase `id` → Webflow `firebase-id` (for lookup)
 * - Firebase `name` → Webflow `name` (title field)
 * - Firebase `photoUrl` → Webflow `profile-image` (URL reference)
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type { Artist } from '@maple/ts/domain';

/**
 * Input for creating an artist in Webflow CMS
 */
export interface SyncArtistInput {
  artist: Artist;
}

/**
 * Result from syncing an artist to Webflow
 */
export interface SyncArtistResult {
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
 * Field data structure for Webflow CMS items
 * Includes required name/slug fields plus our custom fields
 */
interface WebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'profile-image'?: {
    url: string;
    alt?: string;
  };
  [key: string]: unknown;
}

/**
 * Service for syncing artists to Webflow CMS
 */
export class ArtistService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync an artist to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   *
   * @param input - Artist data to sync
   * @returns Result with Webflow item ID
   */
  async syncArtist(input: SyncArtistInput): Promise<SyncArtistResult> {
    const { artist } = input;

    // Check if artist already exists in Webflow by firebase-id
    const existingItem = await this.findByFirebaseId(artist.id);

    if (existingItem) {
      // Update existing item
      await this.updateItem(existingItem.id, artist);
      return {
        success: true,
        webflowItemId: existingItem.id,
        isNew: false,
      };
    } else {
      // Create new item
      const newItem = await this.createItem(artist);
      return {
        success: true,
        webflowItemId: newItem.id,
        isNew: true,
      };
    }
  }

  /**
   * Remove an artist from Webflow CMS.
   *
   * @param firebaseId - Firebase artist ID
   * @returns True if deleted, false if not found
   */
  async removeArtist(firebaseId: string): Promise<boolean> {
    const existingItem = await this.findByFirebaseId(firebaseId);

    if (!existingItem) {
      return false;
    }

    await this.client.collections.items.deleteItem(
      this.collectionId,
      existingItem.id
    );

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
          limit: 100, // Reasonable limit for artist collection
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
   * Create a new artist item in Webflow CMS
   */
  private async createItem(artist: Artist): Promise<WebflowItemWithId> {
    const fieldData = this.mapArtistToFieldData(artist);

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
   * Update an existing artist item in Webflow CMS
   */
  private async updateItem(itemId: string, artist: Artist): Promise<void> {
    const fieldData = this.mapArtistToFieldData(artist);

    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: false,
      fieldData,
    });
  }

  /**
   * Map Firebase Artist to Webflow CMS field data
   *
   * Synced fields (overwritten on each sync):
   * - firebase-id: For sync reference
   * - name: Title field (required by Webflow)
   * - slug: URL slug (required by Webflow, auto-generated from name)
   * - profile-image: URL to Firebase Storage image
   *
   * Webflow-only fields (preserved, not touched):
   * - featured
   * - display-order
   * - pull-quote
   */
  private mapArtistToFieldData(artist: Artist): WebflowFieldData {
    const fieldData: WebflowFieldData = {
      'firebase-id': artist.id,
      name: artist.name,
      slug: this.generateSlug(artist.name),
    };

    // Add profile image if available
    if (artist.photoUrl) {
      fieldData['profile-image'] = {
        url: artist.photoUrl,
        alt: `${artist.name} profile photo`,
      };
    }

    return fieldData;
  }

  /**
   * Generate a URL-safe slug from artist name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
