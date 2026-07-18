import type { Student } from '@maple/ts/domain';

/**
 * Mock music lesson student data for Storybook stories.
 */

export const mockStudent: Student = {
  id: 'student-001',
  name: 'Olive Thompson',
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-001',
  registeredLessonLength: '30-min-initial',
  isHopeScholarship: false,
  primaryContactName: 'Rita Thompson',
  primaryContactEmail: 'rita@example.com',
  primaryContactPhone: '304-555-1234',
  status: 'active',
  notes: 'Loves Twinkle variations.',
  createdAt: new Date('2026-01-10T10:00:00Z'),
  updatedAt: new Date('2026-03-01T14:00:00Z'),
};

export const mockStudentHope: Student = {
  id: 'student-002',
  name: 'Felix Rivera',
  instrument: 'piano',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-002',
  registeredLessonLength: '45-min',
  isHopeScholarship: true,
  primaryContactName: 'Dana Rivera',
  primaryContactEmail: 'dana@example.com',
  primaryContactPhone: '304-555-5678',
  status: 'active',
  notes: 'Billed through Hope/EMA portal per lesson.',
  createdAt: new Date('2026-02-05T10:00:00Z'),
  updatedAt: new Date('2026-02-05T10:00:00Z'),
};

export const mockStudentAdult: Student = {
  id: 'student-003',
  name: 'Maya Chen',
  instrument: 'guitar',
  isAdultStudent: true,
  primaryTeacherId: 'instructor-003',
  registeredLessonLength: '60-min',
  isHopeScholarship: false,
  primaryContactName: 'Maya Chen',
  primaryContactEmail: 'maya@example.com',
  status: 'active',
  createdAt: new Date('2026-03-12T09:00:00Z'),
  updatedAt: new Date('2026-03-12T09:00:00Z'),
};

export const mockStudentInactive: Student = {
  id: 'student-004',
  name: 'Jonas Park',
  instrument: 'cello',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-001',
  isHopeScholarship: false,
  primaryContactName: 'Soo Park',
  primaryContactEmail: 'soo@example.com',
  status: 'inactive',
  notes: 'On hiatus — family moved out of state.',
  createdAt: new Date('2025-09-01T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
};

export const mockStudentMinimal: Student = {
  id: 'student-005',
  name: 'Iris Park',
  instrument: 'voice',
  isAdultStudent: false,
  primaryTeacherId: 'instructor-001',
  isHopeScholarship: false,
  primaryContactName: 'Lee Park',
  primaryContactEmail: 'lee@example.com',
  status: 'active',
  createdAt: new Date('2026-04-01T10:00:00Z'),
  updatedAt: new Date('2026-04-01T10:00:00Z'),
};

export const mockStudents: Student[] = [
  mockStudent,
  mockStudentHope,
  mockStudentAdult,
  mockStudentInactive,
  mockStudentMinimal,
];
