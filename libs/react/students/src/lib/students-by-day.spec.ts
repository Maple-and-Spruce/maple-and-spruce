import { describe, expect, it } from 'vitest';
import type { Student, StudentLessonSchedule } from '@maple/ts/domain';
import { clockLabel, groupStudentsByDay } from './students-by-day';

const NOW = new Date('2026-10-01T12:00:00Z');

const student = (id: string, name: string, over: Partial<Student> = {}): Student => ({
  id,
  name,
  instrument: 'violin',
  isAdultStudent: false,
  primaryTeacherId: 'katie',
  isHopeScholarship: false,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const weekly = (
  studentId: string,
  dayOfWeek: number,
  startMinutes: number,
  over: Partial<StudentLessonSchedule> = {}
): StudentLessonSchedule => ({
  id: `sched-${studentId}-${dayOfWeek}`,
  studentId,
  teacherId: 'katie',
  blockId: 'block',
  dayOfWeek,
  startMinutes,
  durationMinutes: 30,
  startsOn: NOW,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const names = (entries: { student: Student }[]) => entries.map((e) => e.student.name);

describe('groupStudentsByDay', () => {
  it('groups by the weekly time, Monday first, earliest first within a day', () => {
    const students = [
      student('a', 'Student A'),
      student('b', 'Student B'),
      student('c', 'Student C'),
      student('d', 'Student D'),
    ];
    const schedules = [
      weekly('a', 2, 17 * 60),
      weekly('b', 2, 16 * 60),
      weekly('c', 0, 10 * 60), // Sunday
      weekly('d', 1, 15 * 60),
    ];

    const groups = groupStudentsByDay(students, schedules);

    expect(groups.map((g) => g.label)).toEqual(['Monday', 'Tuesday', 'Sunday']);
    expect(names(groups[1].entries)).toEqual(['Student B', 'Student A']);
  });

  it('puts a student with no weekly time under "No regular time"', () => {
    const groups = groupStudentsByDay(
      [student('a', 'Student A'), student('z', 'Student Z')],
      [weekly('a', 3, 900)]
    );

    expect(groups.map((g) => g.label)).toEqual(['Wednesday', 'No regular time']);
    expect(names(groups[1].entries)).toEqual(['Student Z']);
  });

  it('ignores an ended weekly time', () => {
    const groups = groupStudentsByDay(
      [student('a', 'Student A')],
      [weekly('a', 3, 900, { status: 'ended' })]
    );

    expect(groups.map((g) => g.label)).toEqual(['No regular time']);
  });

  it('lists inactive students last, whatever their weekly time', () => {
    const groups = groupStudentsByDay(
      [student('a', 'Student A', { status: 'inactive' }), student('b', 'Student B')],
      [weekly('a', 2, 900), weekly('b', 4, 900)]
    );

    expect(groups.map((g) => g.label)).toEqual(['Thursday', 'Inactive']);
  });

  it('shows a student with two weekly times on both days', () => {
    const groups = groupStudentsByDay(
      [student('a', 'Student A')],
      [weekly('a', 2, 900), weekly('a', 5, 900)]
    );

    expect(groups.map((g) => g.label)).toEqual(['Tuesday', 'Friday']);
  });

  describe('one teacher’s students', () => {
    const students = [
      student('mine', 'Mine'),
      student('theirs', 'Theirs', { primaryTeacherId: 'nathan' }),
      student('subbed', 'Subbed', { primaryTeacherId: 'nathan' }),
    ];
    const schedules = [
      weekly('mine', 2, 900),
      weekly('theirs', 2, 960, { teacherId: 'nathan' }),
      weekly('subbed', 3, 900), // Katie teaches them on Wednesdays
    ];

    it('keeps the students they teach, by primary teacher or weekly time', () => {
      const groups = groupStudentsByDay(students, schedules, 'katie');

      expect(groups.flatMap((g) => names(g.entries))).toEqual(['Mine', 'Subbed']);
    });

    it('shows everyone without a teacher', () => {
      const groups = groupStudentsByDay(students, schedules);

      expect(groups.flatMap((g) => names(g.entries)).sort()).toEqual([
        'Mine',
        'Subbed',
        'Theirs',
      ]);
    });
  });
});

describe('clockLabel', () => {
  it.each([
    [0, '12:00 AM'],
    [9 * 60 + 5, '9:05 AM'],
    [12 * 60, '12:00 PM'],
    [16 * 60 + 30, '4:30 PM'],
  ])('%d → %s', (minutes, label) => {
    expect(clockLabel(minutes)).toBe(label);
  });
});
