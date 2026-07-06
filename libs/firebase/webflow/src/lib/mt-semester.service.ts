/**
 * Music Together Semester Service for Webflow CMS
 *
 * Handles syncing Music Together semester (term) data from Firebase to Webflow
 * CMS. Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Unlike sections, semesters have NO 'draft' status — a `planned` term is meant
 * to show publicly (so the site can describe an upcoming term). Every semester
 * is synced regardless of status; only a DELETE removes the Webflow item.
 *
 * Field Mapping:
 * - Firebase `id` → Webflow `firebase-id` (for lookup)
 * - Firebase `name` → Webflow `name` (title field)
 * - Firebase `season` → Webflow `season` + `season-label`
 * - Firebase `year` → Webflow `year`
 * - Firebase `status` → Webflow `status`
 * - `startDate`/`endDate` → Webflow `start-date`/`end-date` (native DateTime)
 * - `mtSemesterSortValue(semester)` → Webflow `sort-value`
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import { WebflowClient } from 'webflow-api';
import type { CollectionItem } from 'webflow-api/api';
import type {
  MusicTogetherSemester,
  MusicTogetherSemesterBreak,
} from '@maple/ts/domain';
import {
  getMusicTogetherSeasonLabel,
  mtSemesterSortValue,
} from '@maple/ts/domain';
import { generateSlug } from './artist.service';

/**
 * Input for syncing a Music Together semester to Webflow CMS
 */
export interface SyncSemesterInput {
  semester: MusicTogetherSemester;
  /** If true, publish the item to the live site after sync */
  publish?: boolean;
  /** Whether this sync is from a dev environment */
  isDev?: boolean;
  /**
   * Known Webflow item ID from a prior sync (stored on the semester entity).
   * When provided, we skip the by-firebase-id list scan and update directly.
   * Falls back to the scan if the item has been deleted from Webflow.
   */
  existingWebflowItemId?: string;
}

/**
 * Result from syncing a semester to Webflow
 */
export interface SyncSemesterResult {
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
 * Field data structure for Webflow CMS Music Together semester items
 */
export interface MtSemesterWebflowFieldData {
  name: string;
  slug: string;
  'firebase-id': string;
  'is-dev-environment': boolean;
  [key: string]: unknown;
}

/**
 * Options for mapping a semester to Webflow field data
 */
export interface MapSemesterOptions {
  isDev: boolean;
}

const TZ = 'America/New_York';

/** Format a date as "September 10, 2026" in the studio timezone. */
function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: TZ,
  }).format(date);
}

/** Format a date as "September 10" (no year) in the studio timezone. */
function formatMonthDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: TZ,
  }).format(date);
}

/** The calendar year of a date in the studio timezone. */
function yearInTz(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: TZ,
  }).format(date);
}

/**
 * Human date-range string, e.g. "September 10 – November 12, 2026". Collapses a
 * shared year onto the end date; degrades to a single date when only one bound
 * is set, and empty when neither is.
 */
function formatDateRangeDisplay(startDate?: Date, endDate?: Date): string {
  if (startDate && endDate) {
    if (yearInTz(startDate) === yearInTz(endDate)) {
      return `${formatMonthDay(startDate)} – ${formatLongDate(endDate)}`;
    }
    return `${formatLongDate(startDate)} – ${formatLongDate(endDate)}`;
  }
  if (startDate) return formatLongDate(startDate);
  if (endDate) return formatLongDate(endDate);
  return '';
}

/** Summarize breaks as "Label: start – end" entries joined with "; ". */
function formatBreaksSummary(breaks: MusicTogetherSemesterBreak[]): string {
  return breaks
    .map(
      (b) =>
        `${b.label}: ${formatMonthDay(b.startDate)} – ${formatMonthDay(b.endDate)}`
    )
    .join('; ');
}

/**
 * Map a Firebase Music Together semester to Webflow CMS field data.
 */
export function mapSemesterToFieldData(
  semester: MusicTogetherSemester,
  options: MapSemesterOptions
): MtSemesterWebflowFieldData {
  const fieldData: MtSemesterWebflowFieldData = {
    'firebase-id': semester.id,
    name: semester.name,
    slug: generateSlug(semester.name),
    'is-dev-environment': options.isDev,
    season: semester.season,
    'season-label': getMusicTogetherSeasonLabel(semester.season),
    year: semester.year,
    status: semester.status,
    'sort-value': mtSemesterSortValue(semester),
    'date-range-display': formatDateRangeDisplay(
      semester.startDate,
      semester.endDate
    ),
  };

  // Native DateTime fields — only set when the underlying date exists.
  if (semester.startDate) {
    fieldData['start-date'] = semester.startDate.toISOString();
  }

  if (semester.endDate) {
    fieldData['end-date'] = semester.endDate.toISOString();
  }

  if (semester.enrollmentOpensAt) {
    fieldData['enrollment-opens-at'] = semester.enrollmentOpensAt.toISOString();
  }

  if (typeof semester.weeks === 'number') {
    fieldData['weeks'] = semester.weeks;
    fieldData['weeks-display'] = `${semester.weeks} week${
      semester.weeks === 1 ? '' : 's'
    }`;
  }

  if (semester.notes) {
    fieldData['notes'] = semester.notes;
  }

  if (semester.breaks && semester.breaks.length > 0) {
    fieldData['breaks-summary'] = formatBreaksSummary(semester.breaks);
  }

  return fieldData;
}

/**
 * Service for syncing Music Together semesters to Webflow CMS
 */
export class MtSemesterService {
  constructor(
    private readonly client: WebflowClient,
    private readonly collectionId: string
  ) {}

  /**
   * Sync a semester to Webflow CMS.
   * Creates a new item if it doesn't exist, updates if it does.
   */
  async syncSemester(input: SyncSemesterInput): Promise<SyncSemesterResult> {
    const {
      semester,
      publish = false,
      isDev = false,
      existingWebflowItemId,
    } = input;

    const existingItemId = await this.resolveExistingItemId(
      semester.id,
      existingWebflowItemId
    );

    let webflowItemId: string;
    let isNew: boolean;

    const fieldData = mapSemesterToFieldData(semester, { isDev });

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
   * Remove a semester from Webflow CMS.
   * When publish=true, uses deleteItemLive so the deletion is reflected on
   * the live site without a manual republish.
   */
  async removeSemester(
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
   * Resolve the Webflow item ID for a semester, preferring a known ID over a
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
      console.error('Error finding Webflow semester item:', error);
      return null;
    }
  }

  private async createItem(
    fieldData: MtSemesterWebflowFieldData
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
    fieldData: MtSemesterWebflowFieldData
  ): Promise<void> {
    // Omit `slug` on update — Webflow auto-suffixes slug collisions on
    // create (e.g. `name-94fde` when `name` is taken), but on update it
    // 400s with a uniqueness error. Re-sending the deterministic slug
    // would freeze every later sync.
    const { slug: _slug, ...fieldDataWithoutSlug } = fieldData;
    await this.client.collections.items.updateItem(this.collectionId, itemId, {
      isArchived: false,
      isDraft: false,
      fieldData: fieldDataWithoutSlug,
    });
  }
}
