/**
 * Class domain types
 *
 * Represents classes/workshops offered by Maple & Spruce.
 * Classes are browsable by category, date, instructor (catalog-first, not calendar-first).
 *
 * Classes support one or more scheduled sessions. Registration logic still
 * treats a class as a single bookable unit — the `sessions` array only
 * affects display across the admin, Webflow CMS, and calendar endpoints.
 *
 * Future payments will use Square (consistent with existing POS integration).
 */
import type { GalleryImage } from './gallery-image';
import type { Room } from './room';

/**
 * Skill level recommendation for a class
 */
export type ClassSkillLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'all-levels';

/**
 * Class lifecycle status
 */
export type ClassStatus = 'draft' | 'published' | 'cancelled' | 'completed';

/**
 * A single scheduled session of a class.
 *
 * Each session has its own start `dateTime`. Every session in a class
 * shares the same `durationMinutes` (stored on the parent Class).
 */
export interface ClassSession {
  /** Start date and time of this session */
  dateTime: Date;
}

/**
 * Class/Workshop entity
 */
export interface Class {
  id: string;
  /** Class name/title */
  name: string;
  /** Full description for class detail page */
  description: string;
  /** Short tagline for listings (max 160 chars) */
  shortDescription?: string;
  /** Instructor ID (references Instructor entity) */
  instructorId?: string;
  /**
   * Scheduled sessions for the class. Ordered earliest-first after
   * normalization. May be empty for drafts produced by the Copy admin
   * action; non-empty is enforced by `classValidation` for any class
   * about to be `published`. Use `asPublishable` / `PublishableClass`
   * when downstream code needs the non-empty guarantee at the type level.
   */
  sessions: ClassSession[];
  /** Duration in minutes (applies to every session) */
  durationMinutes: number;
  /**
   * Optional override for when registration closes.
   * Defaults to the first session's start time if undefined.
   */
  registrationClosesAt?: Date;
  /** Maximum number of participants */
  capacity: number;
  /** Price in cents (e.g., 4500 = $45.00) */
  priceCents: number;
  /** Primary image URL */
  imageUrl?: string;
  /**
   * Optional supplementary images shown alongside the primary `imageUrl`.
   * Order is encoded by array position. Capped at `GALLERY_IMAGE_MAX`.
   */
  galleryImages?: GalleryImage[];
  /** Class category ID for filtering */
  categoryId?: string;
  /** Skill level recommendation */
  skillLevel: ClassSkillLevel;
  /** Class status */
  status: ClassStatus;
  /** Location (defaults to store address if not specified) */
  location?: string;
  /**
   * Which bookable room sessions occupy, if any. Flows through to the
   * derived CalendarEvents so the class blocks the room's availability.
   */
  room?: Room | null;
  /** Materials included in the price */
  materialsIncluded?: string;
  /** What students should bring */
  whatToBring?: string;
  /** Minimum age requirement (undefined = no minimum) */
  minimumAge?: number;
  /**
   * Webflow CMS item ID for class listing sync.
   * @see docs/decisions/ADR-016-webflow-integration-strategy.md
   */
  webflowItemId?: string;
  /**
   * The real Webflow CMS slug for this class, captured from the Webflow API
   * response during sync. Webflow auto-suffixes slug collisions (e.g.
   * `stained-glass-tryit-class-b192d`), so the live URL is NOT derivable from
   * `name`. Prefer this over a name-derived slug when building public
   * `/classes/{slug}` links. Undefined until the class has synced (or been
   * backfilled) — callers must fall back to the name-derived slug.
   */
  webflowSlug?: string;
  /**
   * Opt-in to the friend-referral program for this class. When set, every
   * confirmed registration auto-generates a single-use Discount and the
   * confirmation email includes a code the customer can share.
   *
   * Initially configured by editing the class document directly in
   * Firestore; admin form controls will land in a follow-up.
   */
  referralDiscount?: ClassReferralDiscount;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-class friend-referral configuration.
 * - `percent`: percentage off the friend's first registration (1–100).
 * - `expiresAfterDays`: how long the generated code stays valid before
 *   the friend must use it (1–365).
 */
export interface ClassReferralDiscount {
  percent: number;
  expiresAfterDays: number;
}

/**
 * Input for creating a new class (no id, timestamps, or webflowItemId)
 */
export type CreateClassInput = Omit<
  Class,
  'id' | 'createdAt' | 'updatedAt' | 'webflowItemId'
>;

/**
 * Input for updating a class (all fields optional except id)
 */
export type UpdateClassInput = Partial<
  Omit<Class, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Session representation for public API consumers (ISO string date).
 */
export interface PublicClassSession {
  dateTime: string;
}

/**
 * Public-facing class information for website display.
 * Includes calculated spotsRemaining and enriched instructor/category names.
 */
export interface PublicClass {
  id: string;
  name: string;
  /**
   * URL slug for the public class detail page, so `/classes/{slug}` resolves
   * correctly. Prefers the real Webflow-assigned slug (`Class.webflowSlug`,
   * which includes any auto-appended collision suffix) and falls back to a
   * name-derived slug for classes that haven't synced yet.
   */
  slug: string;
  shortDescription?: string;
  description: string;
  instructorId?: string;
  /** Enriched from Instructor.name */
  instructorName?: string;
  /** ISO strings for easy client parsing, ordered earliest-first. */
  sessions: PublicClassSession[];
  /** ISO string; omitted if no override (default cutoff = first session). */
  registrationClosesAt?: string;
  durationMinutes: number;
  capacity: number;
  /** Calculated: capacity - registrationCount */
  spotsRemaining: number;
  priceCents: number;
  imageUrl?: string;
  galleryImages?: GalleryImage[];
  categoryId?: string;
  /** Enriched from ClassCategory.name */
  categoryName?: string;
  skillLevel: ClassSkillLevel;
  location?: string;
  materialsIncluded?: string;
  whatToBring?: string;
  minimumAge?: number;
}

/**
 * Return class sessions sorted earliest-first without mutating the input.
 */
/** Coerce a dateTime value that may be a string (from JSON serialization) to a Date. */
function ensureDate(dt: Date | string): Date {
  return dt instanceof Date ? dt : new Date(dt);
}

export function getSortedSessions(classEntity: Class): ClassSession[] {
  return [...classEntity.sessions].sort(
    (a, b) => ensureDate(a.dateTime).getTime() - ensureDate(b.dateTime).getTime()
  );
}

/**
 * A `Class` whose `sessions` is statically known to be non-empty.
 *
 * Use this when downstream code (Webflow CMS mapping, registration cutoff,
 * "first session" displays) genuinely cannot do its job without at least
 * one session. Narrow a `Class` with `asPublishable` at the boundary so
 * the type carries the invariant the rest of the way through.
 */
export type PublishableClass = Class & {
  sessions: [ClassSession, ...ClassSession[]];
};

/**
 * Narrow a `Class` to `PublishableClass` if it has at least one session.
 * Returns `null` for empty-sessions drafts (e.g., produced by the Copy
 * admin action).
 */
export function asPublishable(classEntity: Class): PublishableClass | null {
  return classEntity.sessions.length > 0
    ? (classEntity as PublishableClass)
    : null;
}

/**
 * Return the earliest session of a publishable class. Total — the
 * non-empty guarantee comes from the input type, not a runtime check.
 */
export function getFirstSession(classEntity: PublishableClass): ClassSession {
  return getSortedSessions(classEntity)[0];
}

/**
 * Return the `Date` at which registration closes for a publishable class.
 * Prefers the explicit `registrationClosesAt` override; otherwise falls back
 * to the first session's start time.
 */
export function getRegistrationCutoff(classEntity: PublishableClass): Date {
  return ensureDate(classEntity.registrationClosesAt ?? getFirstSession(classEntity).dateTime);
}

/**
 * Convert a Class to PublicClass with enrichment data.
 *
 * @param classEntity The class to convert
 * @param instructorName Optional instructor name for enrichment
 * @param categoryName Optional category name for enrichment
 * @param registrationCount Number of confirmed registrations (default 0)
 */
/**
 * Build the URL slug for a class name. Mirrors the logic in
 * `@maple/firebase/webflow`'s `generateClassSlug` — kept inline here so the
 * domain layer doesn't reach into the firebase layer. Keep the two in sync.
 */
function buildClassSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toPublicClass(
  classEntity: Class,
  instructorName?: string,
  categoryName?: string,
  registrationCount = 0
): PublicClass {
  return {
    id: classEntity.id,
    name: classEntity.name,
    slug: classEntity.webflowSlug ?? buildClassSlug(classEntity.name),
    shortDescription: classEntity.shortDescription,
    description: classEntity.description,
    instructorId: classEntity.instructorId,
    instructorName,
    sessions: getSortedSessions(classEntity).map((s) => ({
      dateTime: s.dateTime.toISOString(),
    })),
    registrationClosesAt: classEntity.registrationClosesAt?.toISOString(),
    durationMinutes: classEntity.durationMinutes,
    capacity: classEntity.capacity,
    spotsRemaining: Math.max(0, classEntity.capacity - registrationCount),
    priceCents: classEntity.priceCents,
    imageUrl: classEntity.imageUrl,
    galleryImages: classEntity.galleryImages,
    categoryId: classEntity.categoryId,
    categoryName,
    skillLevel: classEntity.skillLevel,
    location: classEntity.location,
    materialsIncluded: classEntity.materialsIncluded,
    whatToBring: classEntity.whatToBring,
    minimumAge: classEntity.minimumAge,
  };
}

/**
 * Format class price for display (e.g., "$45")
 */
export function formatClassPrice(priceCents: number): string {
  const dollars = priceCents / 100;
  // Classes typically have whole dollar prices
  if (Number.isInteger(dollars)) {
    return `$${dollars}`;
  }
  return `$${dollars.toFixed(2)}`;
}

/**
 * Check if a class is open for registration.
 * A class is open if it's published and the registration cutoff
 * (explicit `registrationClosesAt` or earliest session) is in the future.
 */
export function isClassRegistrationOpen(classEntity: Class): boolean {
  if (classEntity.status !== 'published') return false;
  const publishable = asPublishable(classEntity);
  if (!publishable) return false;
  return getRegistrationCutoff(publishable) > new Date();
}

/**
 * Check if a class has available spots.
 *
 * @param classEntity The class to check
 * @param registrationCount Current number of registrations
 */
export function hasAvailableSpots(
  classEntity: Class,
  registrationCount: number
): boolean {
  return registrationCount < classEntity.capacity;
}

/**
 * Calculate end time for a specific session.
 */
export function getSessionEndTime(
  session: ClassSession,
  durationMinutes: number
): Date {
  return new Date(ensureDate(session.dateTime).getTime() + durationMinutes * 60 * 1000);
}

/**
 * Format a list of sessions for human display in the configured timezone.
 *
 * Examples (ET):
 * - Single session, any time: `"Apr 15 · 6:00 PM"`
 * - Multi session, shared time: `"Apr 15, Apr 22, Apr 29 · 6:00 PM"`
 * - Multi session, varying times: `"Apr 15 6:00 PM, Apr 22 7:00 PM, Apr 29 6:00 PM"`
 *
 * Returns an object so callers (e.g., the Webflow CMS mapper) can surface
 * the date portion and time portion in separate fields.
 */
export interface FormattedSessions {
  /**
   * Combined human-readable label — dates only if the time is shared,
   * otherwise dates + per-session times interleaved.
   */
  dateDisplay: string;
  /**
   * Shared time string (e.g., `"6:00 PM"`) when every session is at the
   * same time in the target timezone; otherwise `"Varies"`.
   */
  timeDisplay: string;
  /** True when every session shares the same HH:mm in the target timezone. */
  sharedTime: boolean;
}

export function formatSessions(
  sessions: ClassSession[],
  timeZone = 'America/New_York'
): FormattedSessions {
  if (sessions.length === 0) {
    return { dateDisplay: '', timeDisplay: '', sharedTime: true };
  }

  const sorted = [...sessions].sort(
    (a, b) => ensureDate(a.dateTime).getTime() - ensureDate(b.dateTime).getTime()
  );

  const timeOf = (d: Date | string): string =>
    ensureDate(d).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    });

  const dateOf = (d: Date | string): string =>
    // Glue month + day with a non-breaking space so e.g. "Jun 13" never wraps
    // mid-token in a comma-separated list of dates.
    ensureDate(d)
      .toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone,
      })
      .replace(' ', ' ');

  const firstTime = timeOf(sorted[0].dateTime);
  const sharedTime = sorted.every((s) => timeOf(s.dateTime) === firstTime);

  if (sharedTime) {
    return {
      dateDisplay: sorted.map((s) => dateOf(s.dateTime)).join(', '),
      timeDisplay: firstTime,
      sharedTime: true,
    };
  }

  return {
    dateDisplay: sorted
      .map((s) => `${dateOf(s.dateTime)} ${timeOf(s.dateTime)}`)
      .join(', '),
    timeDisplay: 'Varies',
    sharedTime: false,
  };
}
