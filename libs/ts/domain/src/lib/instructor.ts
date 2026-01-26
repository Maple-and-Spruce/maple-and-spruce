/**
 * Instructor domain types
 *
 * Represents instructors who teach classes/workshops at Maple & Spruce.
 * Implements Payee interface for payment tracking.
 *
 * Instructors have a different payment structure than Artists:
 * - Artists receive commission on product sales
 * - Instructors receive payment per class (flat, hourly, or percentage)
 */

import type { Payee, PayeeStatus, PayoutMethod } from './payee';

/**
 * How an instructor is paid for teaching
 */
export type InstructorPayRateType = 'flat' | 'hourly' | 'percentage';

/**
 * Instructor entity - implements Payee interface
 */
export interface Instructor extends Payee {
  /** Instructor's bio for class pages (teaching-focused) */
  bio?: string;
  /** Areas of expertise (e.g., ['weaving', 'natural dyeing']) */
  specialties?: string[];
  /**
   * Payment rate in cents (for flat/hourly) or decimal (for percentage).
   * - flat: per-class payment in cents (e.g., 5000 = $50 per class)
   * - hourly: per-hour payment in cents (e.g., 2500 = $25/hour)
   * - percentage: decimal of class revenue (e.g., 0.70 = 70% to instructor)
   */
  payRate?: number;
  /** How payRate is interpreted */
  payRateType?: InstructorPayRateType;
  /**
   * Webflow CMS item ID for instructor profile sync.
   * @see docs/decisions/ADR-016-webflow-integration-strategy.md
   */
  webflowItemId?: string;
}

/**
 * Input for creating a new instructor (no id, timestamps auto-generated)
 */
export type CreateInstructorInput = Omit<
  Instructor,
  'id' | 'createdAt' | 'updatedAt' | 'webflowItemId'
>;

/**
 * Input for updating an instructor (all fields optional except id)
 */
export type UpdateInstructorInput = Partial<
  Omit<Instructor, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Public-facing instructor information for website display.
 * Excludes sensitive data like email, payment rates, notes, and timestamps.
 */
export interface PublicInstructor {
  id: string;
  name: string;
  bio?: string;
  specialties?: string[];
  photoUrl?: string;
}

/**
 * Convert a full Instructor to PublicInstructor by stripping sensitive fields.
 * Note: Only call this for active instructors - filtering should happen at query level.
 */
export function toPublicInstructor(instructor: Instructor): PublicInstructor {
  return {
    id: instructor.id,
    name: instructor.name,
    bio: instructor.bio,
    specialties: instructor.specialties,
    photoUrl: instructor.photoUrl,
  };
}

/**
 * Calculate instructor payment for a class.
 *
 * @param instructor The instructor being paid
 * @param classDurationMinutes Duration of the class in minutes
 * @param classRevenueCents Total revenue from class registrations in cents
 * @returns Payment amount in cents, or undefined if pay rate not configured
 */
export function calculateInstructorPayment(
  instructor: Instructor,
  classDurationMinutes: number,
  classRevenueCents: number
): number | undefined {
  if (instructor.payRate === undefined || !instructor.payRateType) {
    return undefined;
  }

  switch (instructor.payRateType) {
    case 'flat':
      // payRate is flat amount in cents
      return instructor.payRate;
    case 'hourly':
      // payRate is hourly rate in cents
      const hours = classDurationMinutes / 60;
      return Math.round(instructor.payRate * hours);
    case 'percentage':
      // payRate is decimal percentage (e.g., 0.70 = 70%)
      return Math.round(classRevenueCents * instructor.payRate);
    default:
      return undefined;
  }
}
