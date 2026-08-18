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
import { ClassService } from './class.service';
import { ClassCategoryService } from './class-category.service';
import { InstructorService } from './instructor.service';
import { MtSectionService } from './mt-section.service';
import { MtSemesterService } from './mt-semester.service';
import { MtDemoWebflowService } from './mt-demo.service';

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
  'WEBFLOW_CLASSES_COLLECTION_ID',
  'WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID',
  'WEBFLOW_INSTRUCTORS_COLLECTION_ID',
  'WEBFLOW_MT_SECTIONS_COLLECTION_ID',
  'WEBFLOW_MT_SEMESTERS_COLLECTION_ID',
  'WEBFLOW_MT_DEMOS_COLLECTION_ID',
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
  private readonly _classService: ClassService | null;
  private readonly _classCategoryService: ClassCategoryService | null;
  private readonly _instructorService: InstructorService | null;
  private readonly _sectionService: MtSectionService | null;
  private readonly _semesterService: MtSemesterService | null;
  private readonly _demoService: MtDemoWebflowService | null;
  public readonly siteId: string;
  public readonly artistsCollectionId: string;
  public readonly classesCollectionId: string;
  public readonly classCategoriesCollectionId: string;
  public readonly instructorsCollectionId: string;
  public readonly mtSectionsCollectionId: string;
  public readonly mtSemestersCollectionId: string;
  public readonly mtDemosCollectionId: string;

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
    this.classesCollectionId = this.strings.WEBFLOW_CLASSES_COLLECTION_ID;
    this.classCategoriesCollectionId = this.strings.WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID;
    this.instructorsCollectionId = this.strings.WEBFLOW_INSTRUCTORS_COLLECTION_ID;
    this.mtSectionsCollectionId = this.strings.WEBFLOW_MT_SECTIONS_COLLECTION_ID;
    this.mtSemestersCollectionId = this.strings.WEBFLOW_MT_SEMESTERS_COLLECTION_ID;
    this.mtDemosCollectionId = this.strings.WEBFLOW_MT_DEMOS_COLLECTION_ID;

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
      ...(process.env['WEBFLOW_BASE_URL']
        ? { baseUrl: process.env['WEBFLOW_BASE_URL'] }
        : {}),
    });

    this._artistService = new ArtistService(
      this.client,
      this.artistsCollectionId
    );

    this._classService = this.classesCollectionId
      ? new ClassService(this.client, this.classesCollectionId)
      : null;

    this._classCategoryService = this.classCategoriesCollectionId
      ? new ClassCategoryService(this.client, this.classCategoriesCollectionId)
      : null;

    this._instructorService = this.instructorsCollectionId
      ? new InstructorService(this.client, this.instructorsCollectionId)
      : null;

    this._sectionService = this.mtSectionsCollectionId
      ? new MtSectionService(this.client, this.mtSectionsCollectionId)
      : null;

    this._semesterService = this.mtSemestersCollectionId
      ? new MtSemesterService(this.client, this.mtSemestersCollectionId)
      : null;

    this._demoService = this.mtDemosCollectionId
      ? new MtDemoWebflowService(this.client, this.mtDemosCollectionId)
      : null;
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
   * Get the class service for syncing classes to Webflow CMS
   */
  get classService(): ClassService {
    if (!this._classService) {
      throw new Error(
        'Webflow classes collection ID not configured. Set WEBFLOW_CLASSES_COLLECTION_ID.'
      );
    }
    return this._classService;
  }

  /**
   * Get the class category service for syncing class categories to Webflow CMS
   */
  get classCategoryService(): ClassCategoryService {
    if (!this._classCategoryService) {
      throw new Error(
        'Webflow class categories collection ID not configured. Set WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID.'
      );
    }
    return this._classCategoryService;
  }

  /**
   * Get the instructor service for syncing instructors to Webflow CMS
   */
  get instructorService(): InstructorService {
    if (!this._instructorService) {
      throw new Error(
        'Webflow instructors collection ID not configured. Set WEBFLOW_INSTRUCTORS_COLLECTION_ID.'
      );
    }
    return this._instructorService;
  }

  /**
   * Get the Music Together section service for syncing sections to Webflow CMS
   */
  get sectionService(): MtSectionService {
    if (!this._sectionService) {
      throw new Error(
        'Webflow MT sections collection ID not configured. Set WEBFLOW_MT_SECTIONS_COLLECTION_ID.'
      );
    }
    return this._sectionService;
  }

  /**
   * Get the Music Together semester service for syncing semesters to Webflow CMS
   */
  get semesterService(): MtSemesterService {
    if (!this._semesterService) {
      throw new Error(
        'Webflow MT semesters collection ID not configured. Set WEBFLOW_MT_SEMESTERS_COLLECTION_ID.'
      );
    }
    return this._semesterService;
  }

  /**
   * Get the Music Together demo service for syncing demos to Webflow CMS
   */
  get demoService(): MtDemoWebflowService {
    if (!this._demoService) {
      throw new Error(
        'Webflow MT demos collection ID not configured. Set WEBFLOW_MT_DEMOS_COLLECTION_ID.'
      );
    }
    return this._demoService;
  }

  /**
   * Get the raw collections API
   */
  get collections() {
    return this.client.collections;
  }
}
