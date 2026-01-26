import { describe, it, expect } from 'vitest';
import {
  toPublicInstructor,
  calculateInstructorPayment,
  type Instructor,
} from './instructor';

describe('Instructor domain helpers', () => {
  const baseInstructor: Instructor = {
    id: 'instructor-123',
    name: 'Sarah Miller',
    email: 'sarah@example.com',
    phone: '555-123-4567',
    photoUrl: 'https://example.com/sarah.jpg',
    status: 'active',
    notes: 'Expert weaver',
    bio: 'Sarah has been weaving for 20 years.',
    specialties: ['weaving', 'natural dyeing', 'fiber arts'],
    payRate: 5000,
    payRateType: 'flat',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  describe('toPublicInstructor', () => {
    it('converts Instructor to PublicInstructor with all fields', () => {
      const result = toPublicInstructor(baseInstructor);

      expect(result).toEqual({
        id: 'instructor-123',
        name: 'Sarah Miller',
        bio: 'Sarah has been weaving for 20 years.',
        specialties: ['weaving', 'natural dyeing', 'fiber arts'],
        photoUrl: 'https://example.com/sarah.jpg',
      });
    });

    it('excludes sensitive fields', () => {
      const result = toPublicInstructor(baseInstructor);

      // Should not include these sensitive fields
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('notes');
      expect(result).not.toHaveProperty('payRate');
      expect(result).not.toHaveProperty('payRateType');
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('createdAt');
      expect(result).not.toHaveProperty('updatedAt');
    });

    it('handles undefined optional fields', () => {
      const minimalInstructor: Instructor = {
        id: 'instructor-456',
        name: 'John Smith',
        email: 'john@example.com',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = toPublicInstructor(minimalInstructor);

      expect(result).toEqual({
        id: 'instructor-456',
        name: 'John Smith',
        bio: undefined,
        specialties: undefined,
        photoUrl: undefined,
      });
    });
  });

  describe('calculateInstructorPayment', () => {
    describe('flat rate', () => {
      it('returns flat rate regardless of duration or revenue', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 5000, // $50 flat
          payRateType: 'flat',
        };

        expect(calculateInstructorPayment(instructor, 60, 20000)).toBe(5000);
        expect(calculateInstructorPayment(instructor, 120, 40000)).toBe(5000);
        expect(calculateInstructorPayment(instructor, 30, 10000)).toBe(5000);
      });
    });

    describe('hourly rate', () => {
      it('calculates payment based on duration', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 2500, // $25/hour
          payRateType: 'hourly',
        };

        // 60 minutes = 1 hour = $25
        expect(calculateInstructorPayment(instructor, 60, 20000)).toBe(2500);
        // 120 minutes = 2 hours = $50
        expect(calculateInstructorPayment(instructor, 120, 20000)).toBe(5000);
        // 90 minutes = 1.5 hours = $37.50
        expect(calculateInstructorPayment(instructor, 90, 20000)).toBe(3750);
      });

      it('handles partial hours', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 3000, // $30/hour
          payRateType: 'hourly',
        };

        // 45 minutes = 0.75 hours = $22.50
        expect(calculateInstructorPayment(instructor, 45, 10000)).toBe(2250);
      });
    });

    describe('percentage rate', () => {
      it('calculates payment as percentage of revenue', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 0.7, // 70%
          payRateType: 'percentage',
        };

        // 70% of $200 = $140
        expect(calculateInstructorPayment(instructor, 120, 20000)).toBe(14000);
        // 70% of $500 = $350
        expect(calculateInstructorPayment(instructor, 120, 50000)).toBe(35000);
      });

      it('rounds to nearest cent', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 0.65, // 65%
          payRateType: 'percentage',
        };

        // 65% of $123.45 = $80.2425 → $80.24
        expect(calculateInstructorPayment(instructor, 120, 12345)).toBe(8024);
      });
    });

    describe('edge cases', () => {
      it('returns undefined when payRate is undefined', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: undefined,
          payRateType: 'flat',
        };

        expect(calculateInstructorPayment(instructor, 120, 20000)).toBeUndefined();
      });

      it('returns undefined when payRateType is undefined', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 5000,
          payRateType: undefined,
        };

        expect(calculateInstructorPayment(instructor, 120, 20000)).toBeUndefined();
      });

      it('returns undefined when both are undefined', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: undefined,
          payRateType: undefined,
        };

        expect(calculateInstructorPayment(instructor, 120, 20000)).toBeUndefined();
      });

      it('handles zero revenue for percentage', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 0.7,
          payRateType: 'percentage',
        };

        expect(calculateInstructorPayment(instructor, 120, 0)).toBe(0);
      });

      it('handles zero duration for hourly', () => {
        const instructor: Instructor = {
          ...baseInstructor,
          payRate: 2500,
          payRateType: 'hourly',
        };

        expect(calculateInstructorPayment(instructor, 0, 20000)).toBe(0);
      });
    });
  });
});
