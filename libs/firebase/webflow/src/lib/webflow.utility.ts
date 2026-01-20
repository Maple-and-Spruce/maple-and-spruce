/**
 * Webflow CMS API utility
 *
 * Provides a wrapper around the Webflow SDK for syncing data to Webflow CMS collections.
 *
 * With separate Firebase projects for dev and prod, secrets are per-project:
 * - Dev project (maple-and-spruce-dev): WEBFLOW_API_TOKEN for dev site
 * - Prod project (maple-and-spruce): WEBFLOW_API_TOKEN for prod site
 *
 * @see https://developers.webflow.com/reference/cms-api-introduction
 */
import { WebflowClient } from 'webflow-api';
import { ArtistService } from './artist.service';

/**
 * Secret names for Firebase Functions secrets
 * Use with defineSecret() from firebase-functions/params
 *
 * Each Firebase project has its own WEBFLOW_API_TOKEN with the appropriate value.
 */
export const WEBFLOW_SECRET_NAMES = ['WEBFLOW_API_TOKEN'] as const;

/**
 * String parameter names for Firebase Functions
 * Use with defineString() from firebase-functions/params
 *
 * WEBFLOW_SITE_ID: The Webflow site ID
 * WEBFLOW_ARTISTS_COLLECTION_ID: The Artists CMS collection ID
 */
export const WEBFLOW_STRING_NAMES = [
  'WEBFLOW_SITE_ID',
  'WEBFLOW_ARTISTS_COLLECTION_ID',
] as const;

export type WebflowSecrets = Record<
  (typeof WEBFLOW_SECRET_NAMES)[number],
  string
>;

export type WebflowStrings = Record<
  (typeof WEBFLOW_STRING_NAMES)[number],
  string
>;

/**
 * Webflow utility class
 *
 * Initialize with secrets and strings from Firebase Functions params.
 * Provides access to the Artist sync service.
 *
 * @example
 * ```typescript
 * // In a Firebase Function using Firestore triggers:
 * export const syncArtistToWebflow = Functions.firestoreTrigger
 *   .usingSecrets(...WEBFLOW_SECRET_NAMES)
 *   .usingStrings(...WEBFLOW_STRING_NAMES)
 *   .onWrite('artists/{artistId}', async (change, context, secrets, strings) => {
 *     const webflow = new Webflow(secrets, strings);
 *     // Handle sync...
 *   });
 * ```
 */
export class Webflow {
  private readonly client: WebflowClient;
  private readonly _artistService: ArtistService;
  public readonly siteId: string;
  public readonly artistsCollectionId: string;

  constructor(
    private readonly secrets: WebflowSecrets,
    private readonly strings: WebflowStrings
  ) {
    const accessToken = this.secrets.WEBFLOW_API_TOKEN;

    if (!accessToken) {
      throw new Error(
        'Webflow API token not configured. Set WEBFLOW_API_TOKEN secret.'
      );
    }

    this.siteId = this.strings.WEBFLOW_SITE_ID;
    this.artistsCollectionId = this.strings.WEBFLOW_ARTISTS_COLLECTION_ID;

    if (!this.siteId) {
      throw new Error('Webflow site ID not configured. Set WEBFLOW_SITE_ID.');
    }

    if (!this.artistsCollectionId) {
      throw new Error(
        'Webflow artists collection ID not configured. Set WEBFLOW_ARTISTS_COLLECTION_ID.'
      );
    }

    this.client = new WebflowClient({
      accessToken,
    });

    this._artistService = new ArtistService(
      this.client,
      this.artistsCollectionId
    );
  }

  /**
   * Get the Webflow client for direct API access
   */
  getClient(): WebflowClient {
    return this.client;
  }

  /**
   * Get the artist service for syncing artists to Webflow CMS
   */
  get artistService(): ArtistService {
    return this._artistService;
  }

  /**
   * Get the raw collections API
   */
  get collections() {
    return this.client.collections;
  }
}
