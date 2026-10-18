/**
 * Students grouped by the day they come, the way Katie thinks about her week
 * (#159).
 *
 * The day comes from the student's **weekly time** — the planning note — not
 * from booked lessons: lessons are booked a few at a time now (#157), so a
 * student between bookings has none, and would otherwise vanish from their day.
 *
 * Days run Monday to Sunday. A student with no weekly time goes under "No
 * regular time"; an inactive student under "Inactive", last, whatever they
 * once had. Pure, so it is tested apart from the list that renders it.
 */
import { WEEKDAY_LONG } from '@maple/ts/domain';
import type { Student, StudentLessonSchedule } from '@maple/ts/domain';

export interface StudentDayEntry {
  student: Student;
  /** The weekly time that puts the student on this day; none in the last two groups. */
  schedule?: StudentLessonSchedule;
}

export interface StudentDayGroup {
  key: string;
  label: string;
  /** 0 = Sunday … 6 = Saturday; absent for "No regular time" and "Inactive". */
  weekday?: number;
  entries: StudentDayEntry[];
}

/** Monday first, Sunday last. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "4:00 PM" from minutes past midnight. */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const byName = (a: StudentDayEntry, b: StudentDayEntry) =>
  a.student.name.localeCompare(b.student.name);

export function groupStudentsByDay(
  students: Student[],
  schedules: StudentLessonSchedule[],
  /**
   * Only this teacher's students: those they teach as primary teacher, and
   * any whose weekly time is with them. Omit for everyone.
   */
  teacherId?: string
): StudentDayGroup[] {
  const active = schedules.filter((s) => s.status === 'active');
  const schedulesFor = new Map<string, StudentLessonSchedule[]>();
  for (const schedule of active) {
    if (teacherId && schedule.teacherId !== teacherId) continue;
    const list = schedulesFor.get(schedule.studentId) ?? [];
    list.push(schedule);
    schedulesFor.set(schedule.studentId, list);
  }

  const days = new Map<number, StudentDayEntry[]>();
  const noTime: StudentDayEntry[] = [];
  const inactive: StudentDayEntry[] = [];

  for (const student of students) {
    const own = schedulesFor.get(student.id) ?? [];
    if (teacherId && student.primaryTeacherId !== teacherId && own.length === 0) {
      continue;
    }
    if (student.status !== 'active') {
      inactive.push({ student });
      continue;
    }
    if (own.length === 0) {
      noTime.push({ student });
      continue;
    }
    // A student with two weekly times appears on both days.
    for (const schedule of own) {
      const list = days.get(schedule.dayOfWeek) ?? [];
      list.push({ student, schedule });
      days.set(schedule.dayOfWeek, list);
    }
  }

  const groups: StudentDayGroup[] = [];
  for (const weekday of WEEK_ORDER) {
    const entries = days.get(weekday);
    if (!entries) continue;
    entries.sort(
      (a, b) =>
        (a.schedule?.startMinutes ?? 0) - (b.schedule?.startMinutes ?? 0) ||
        byName(a, b)
    );
    groups.push({
      key: `day-${weekday}`,
      label: WEEKDAY_LONG[weekday],
      weekday,
      entries,
    });
  }
  if (noTime.length > 0) {
    groups.push({
      key: 'no-time',
      label: 'No regular time',
      entries: noTime.sort(byName),
    });
  }
  if (inactive.length > 0) {
    groups.push({
      key: 'inactive',
      label: 'Inactive',
      entries: inactive.sort(byName),
    });
  }
  return groups;
}
