import { describe, it, expect } from 'vitest';
import { isStudentActive, type Student } from './student';

describe('Student domain helpers', () => {
  const baseStudent: Student = {
    id: 'student-123',
    name: 'Olive Thompson',
    instrument: 'violin',
    isAdultStudent: false,
    primaryTeacherId: 'instructor-abc',
    registeredLessonLength: '30-min-initial',
    isHopeScholarship: false,
    primaryContactName: 'Rita Thompson',
    primaryContactEmail: 'rita@example.com',
    primaryContactPhone: '555-111-2222',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  };

  describe('isStudentActive', () => {
    it('returns true for an active student', () => {
      expect(isStudentActive({ ...baseStudent, status: 'active' })).toBe(true);
    });

    it('returns false for an inactive student', () => {
      expect(isStudentActive({ ...baseStudent, status: 'inactive' })).toBe(
        false
      );
    });
  });
});
