/**
 * POS Lesson Config domain type
 *
 * Which Square catalog items count as "a music lesson" when rung up at the
 * POS. Lessons are not synced to the Square catalog per-student the way
 * classes are (they're scheduled events, not sellable items), so the studio
 * rings up a generic lesson item (e.g. a "Guitar Lesson" button). This config
 * holds the catalog object (variation) ids of those items; `processPosSale`
 * routes a line item whose catalogObjectId is in the set to lesson
 * attribution (#628). Managed from the admin app (PR 2).
 */
export interface PosLessonConfig {
  /** Square catalog object (variation) ids that represent music lessons. */
  lessonCatalogObjectIds: string[];
  updatedAt?: Date;
  updatedByUid?: string;
}
