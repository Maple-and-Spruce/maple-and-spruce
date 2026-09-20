'use client';

/**
 * Teaching Days (legacy #838) — the day, top to bottom, the way Katie keeps it.
 *
 * Her source of truth has been a spreadsheet laid out as one day in time order
 * with **open slots sitting in the sequence** between the students. Nothing in
 * the portal could show that: `/students/[id]` reads one student at a time and
 * `/my-day` is a teacher's own week. Neither answers the two questions she
 * actually asks — *is 4:30 free?* and *who is after Rowan?*
 *
 * Composed client-side from reads that already exist, so this costs no new
 * Cloud Function against the ADR-029 budget.
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { DayColumn } from '@maple/react/lessons';
import { buildDayColumn, WEEKDAY_LONG } from '@maple/ts/domain';
import {
  useAllStudentLessonSchedules,
  useInstructors,
  useLessonBlocks,
  useStudents,
} from '../../../hooks';

/** Weekdays teaching actually happens on. Sunday is not a teaching day here. */
const TEACHING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export default function TeachingDaysPage() {
  const { lessonBlocksState } = useLessonBlocks();
  const { schedulesState } = useAllStudentLessonSchedules();
  const { studentsState } = useStudents();
  const { instructorsState } = useInstructors();

  const blocks =
    lessonBlocksState.status === 'success' ? lessonBlocksState.data : [];
  const schedules =
    schedulesState.status === 'success' ? schedulesState.data : [];
  const students = studentsState.status === 'success' ? studentsState.data : [];
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  // Default to the busiest teaching day rather than today: the point of the
  // view is planning, and Katie opens it to look at Tuesday.
  const busiestWeekday = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of schedules) {
      if (s.status !== 'active') continue;
      counts.set(s.dayOfWeek, (counts.get(s.dayOfWeek) ?? 0) + 1);
    }
    let best = 2; // Tuesday
    let most = -1;
    for (const [day, n] of counts) {
      if (n > most) {
        most = n;
        best = day;
      }
    }
    return best;
  }, [schedules]);

  const [weekday, setWeekday] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<string>('');
  const day = weekday ?? busiestWeekday;

  const rows = useMemo(
    () =>
      buildDayColumn(day, blocks, schedules, {
        teacherId: teacherId || undefined,
      }),
    [day, blocks, schedules, teacherId]
  );

  const studentNames = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.name])),
    [students]
  );
  const teacherNames = useMemo(
    () => Object.fromEntries(instructors.map((i) => [i.id, i.name])),
    [instructors]
  );

  const isLoading =
    lessonBlocksState.status === 'loading' ||
    schedulesState.status === 'loading';

  const error =
    [lessonBlocksState, schedulesState].find((s) => s.status === 'error')
      ?.error ?? null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Teaching Days
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Standing slots in time order, with the openings between them. An opening
        marked “every other week” is the alternate week of a biweekly student’s
        hour, so it fits exactly one more biweekly student.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Select
          size="small"
          value={day}
          onChange={(e) => setWeekday(Number(e.target.value))}
          sx={{ minWidth: 160 }}
        >
          {TEACHING_WEEKDAYS.map((d) => (
            <MenuItem key={d} value={d}>
              {WEEKDAY_LONG[d]}
            </MenuItem>
          ))}
        </Select>

        <Select
          size="small"
          displayEmpty
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All teachers</MenuItem>
          {instructors.map((i) => (
            <MenuItem key={i.id} value={i.id}>
              {i.name}
            </MenuItem>
          ))}
        </Select>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <DayColumn
        weekday={day}
        rows={rows}
        studentNames={studentNames}
        teacherNames={teacherNames}
        isLoading={isLoading}
      />
    </Box>
  );
}
