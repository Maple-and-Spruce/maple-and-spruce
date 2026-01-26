/**
 * Class domain types
 *
 * Represents classes/workshops offered by Maple & Spruce.
 * Classes are browsable by category, date, instructor (catalog-first, not calendar-first).
 *
 * Future payments will use Square (consistent with existing POS integration).
 */

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
  /** Class date and time */
  dateTime: Date;
  /** Duration in minutes */
  durationMinutes: number;
  /** Maximum number of participants */
  capacity: number;
  /** Price in cents (e.g., 4500 = $45.00) */
  priceCents: number;
  /** Primary image URL */
  imageUrl?: string;
  /** Class category ID for filtering */
  categoryId?: string;
  /** Skill level recommendation */
  skillLevel: ClassSkillLevel;
  /** Class status */
  status: ClassStatus;
  /** Location (defaults to store address if not specified) */
  location?: string;
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
  createdAt: Date;
  updatedAt: Date;
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
 * Public-facing class information for website display.
 * Includes calculated spotsRemaining and enriched instructor/category names.
 */
export interface PublicClass {
  id: string;
  name: string;
  shortDescription?: string;
  description: string;
  instructorId?: string;
  /** Enriched from Instructor.name */
  instructorName?: string;
  /** ISO string for easy client parsing */
  dateTime: string;
  durationMinutes: number;
  capacity: number;
  /** Calculated: capacity - registrationCount */
  spotsRemaining: number;
  priceCents: number;
  imageUrl?: string;
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
 * Convert a Class to PublicClass with enrichment data.
 *
 * @param classEntity The class to convert
 * @param instructorName Optional instructor name for enrichment
 * @param categoryName Optional category name for enrichment
 * @param registrationCount Number of confirmed registrations (default 0)
 */
export function toPublicClass(
  classEntity: Class,
  instructorName?: string,
  categoryName?: string,
  registrationCount = 0
): PublicClass {
  return {
    id: classEntity.id,
    name: classEntity.name,
    shortDescription: classEntity.shortDescription,
    description: classEntity.description,
    instructorId: classEntity.instructorId,
    instructorName,
    dateTime: classEntity.dateTime.toISOString(),
    durationMinutes: classEntity.durationMinutes,
    capacity: classEntity.capacity,
    spotsRemaining: Math.max(0, classEntity.capacity - registrationCount),
    priceCents: classEntity.priceCents,
    imageUrl: classEntity.imageUrl,
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
 * A class is open if it's published and scheduled in the future.
 */
export function isClassRegistrationOpen(classEntity: Class): boolean {
  return (
    classEntity.status === 'published' && classEntity.dateTime > new Date()
  );
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
 * Calculate end time for a class
 */
export function getClassEndTime(classEntity: Class): Date {
  return new Date(
    classEntity.dateTime.getTime() + classEntity.durationMinutes * 60 * 1000
  );
}
