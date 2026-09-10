'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EventIcon from '@mui/icons-material/Event';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  MaterialReactTable,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table';
import type {
  Instructor,
  Lesson,
  RequestState,
  Student,
  WeekdayTimeBlock,
} from '@maple/ts/domain';
import { formatWeekdayTimeBlock } from '@maple/ts/domain';
import { surfaces, borders, radii, shadows } from '@maple/react/theme';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from './labels';

interface StudentListProps {
  studentsState: RequestState<Student[]>;
  instructors: Instructor[];
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  /** Open the schedule-lesson flow for a student. Omit to hide the action. */
  onScheduleLesson?: (student: Student) => void;
  /** Open the create-invoice flow for a student. Omit to hide the action. */
  onCreateInvoice?: (student: Student) => void;
  /**
   * If provided, the student name links to this path plus the student's id
   * (e.g. `/students`). Leave undefined to render a plain name.
   */
  detailHrefBase?: string;
  /**
   * All lessons (any student). The table derives each student's recurring
   * weekly slot (day-of-week + time block) from their `scheduled` lessons.
   * Omit to leave the Day/Time column blank.
   */
  lessons?: Lesson[];
}

const statusColors: Record<string, 'success' | 'default'> = {
  active: 'success',
  inactive: 'default',
};

interface StudentRow {
  id: string;
  student: Student;
  name: string;
  instrumentLabel: string;
  lessonLengthLabel: string;
  dayDisplay: string;
  timeBlockDisplay: string;
  weekdaySortKey: number;
  teacherName: string;
  contactName: string;
  contactEmail: string;
  status: Student['status'];
  isHopeScholarship: boolean;
  isAdultStudent: boolean;
}

/**
 * Group `scheduled` lessons by student and summarize each student's recurring
 * slot. Uses scheduled (not strictly future) lessons so the slot is stable
 * between terms and deterministic in tests. Each student's block duration is
 * taken from their earliest scheduled lesson.
 */
function buildScheduleByStudent(
  lessons: Lesson[]
): Map<string, WeekdayTimeBlock> {
  const byStudent = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    if (lesson.status !== 'scheduled') continue;
    const list = byStudent.get(lesson.studentId);
    if (list) list.push(lesson);
    else byStudent.set(lesson.studentId, [lesson]);
  }

  const result = new Map<string, WeekdayTimeBlock>();
  for (const [studentId, studentLessons] of byStudent) {
    const sorted = [...studentLessons].sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
    result.set(
      studentId,
      formatWeekdayTimeBlock(
        sorted.map((l) => l.scheduledAt),
        sorted[0].durationMinutes
      )
    );
  }
  return result;
}

/** Per-row "⋯" menu consolidating a student's actions. Owns its own anchor. */
function RowActionsMenu({
  student,
  isHopeScholarship,
  onEdit,
  onDelete,
  onScheduleLesson,
  onCreateInvoice,
}: {
  student: Student;
  isHopeScholarship: boolean;
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  onScheduleLesson?: (student: Student) => void;
  onCreateInvoice?: (student: Student) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          aria-label={`Actions for ${student.name}`}
          aria-haspopup="menu"
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}>
        {onScheduleLesson && (
          <MenuItem onClick={run(() => onScheduleLesson(student))}>
            <ListItemIcon>
              <EventIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Schedule lesson</ListItemText>
          </MenuItem>
        )}
        {onCreateInvoice && (
          <MenuItem
            onClick={run(() => onCreateInvoice(student))}
            disabled={isHopeScholarship}
          >
            <ListItemIcon>
              <ReceiptLongIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {isHopeScholarship ? 'Create invoice (Hope)' : 'Create invoice'}
            </ListItemText>
          </MenuItem>
        )}
        {(onScheduleLesson || onCreateInvoice) && <Divider />}
        <MenuItem onClick={run(() => onEdit(student))}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={run(() => onDelete(student))}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}

export function StudentList({
  studentsState,
  instructors,
  onEdit,
  onDelete,
  onScheduleLesson,
  onCreateInvoice,
  detailHrefBase,
  lessons,
}: StudentListProps) {
  const teacherNameById = useMemo(
    () => new Map(instructors.map((i) => [i.id, i.name])),
    [instructors]
  );

  const scheduleByStudent = useMemo(
    () => buildScheduleByStudent(lessons ?? []),
    [lessons]
  );

  const rows = useMemo<StudentRow[]>(() => {
    if (studentsState.status !== 'success') return [];
    return studentsState.data.map((student) => {
      const schedule = scheduleByStudent.get(student.id);
      return {
        id: student.id,
        student,
        name: student.name,
        instrumentLabel: INSTRUMENT_LABELS[student.instrument],
        lessonLengthLabel: student.registeredLessonLength
          ? LESSON_LENGTH_LABELS[student.registeredLessonLength]
          : '',
        dayDisplay: schedule?.dayDisplay ?? '',
        timeBlockDisplay: schedule?.timeBlockDisplay ?? '',
        weekdaySortKey: schedule?.weekdaySortKey ?? Number.POSITIVE_INFINITY,
        teacherName:
          teacherNameById.get(student.primaryTeacherId) ?? 'Unassigned',
        contactName: student.primaryContactName,
        contactEmail: student.primaryContactEmail,
        status: student.status,
        isHopeScholarship: student.isHopeScholarship,
        isAdultStudent: student.isAdultStudent,
      };
    });
  }, [studentsState, scheduleByStudent, teacherNameById]);

  const columns = useMemo<MRT_ColumnDef<StudentRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Student',
        size: 190,
        Cell: ({ row }) => {
          const { student } = row.original;
          if (!detailHrefBase) {
            return (
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {student.name}
              </Typography>
            );
          }
          // Decorated as a link so the detail page (schedule/invoice/history)
          // is discoverable.
          return (
            <Link
              href={`${detailHrefBase}/${student.id}`}
              style={{ textDecoration: 'none' }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: 'primary.main',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {student.name}
              </Typography>
            </Link>
          );
        },
      },
      {
        // Sorted on the numeric key, displayed as the day and time block.
        // POSITIVE_INFINITY for a student with no slot, so they group last
        // rather than scattering through the list (#847).
        accessorKey: 'weekdaySortKey',
        header: 'Lesson Day / Time',
        size: 170,
        Cell: ({ row }) =>
          row.original.dayDisplay ? (
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component="span"
                variant="body2"
                noWrap
                sx={{ display: 'block', fontWeight: 500, lineHeight: 1.35 }}
              >
                {row.original.dayDisplay}
              </Typography>
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: 'block', lineHeight: 1.35 }}
              >
                {row.original.timeBlockDisplay}
              </Typography>
            </Box>
          ) : (
            <Typography component="span" variant="body2" color="text.secondary">
              —
            </Typography>
          ),
      },
      {
        accessorKey: 'instrumentLabel',
        header: 'Instrument',
        size: 150,
        Cell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="span"
              variant="body2"
              noWrap
              sx={{ display: 'block', lineHeight: 1.35 }}
            >
              {row.original.instrumentLabel}
            </Typography>
            {row.original.lessonLengthLabel && (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: 'block', lineHeight: 1.35 }}
              >
                {row.original.lessonLengthLabel}
              </Typography>
            )}
          </Box>
        ),
      },
      { accessorKey: 'teacherName', header: 'Teacher', size: 150 },
      {
        accessorKey: 'contactName',
        header: 'Contact',
        size: 200,
        Cell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="span"
              variant="body2"
              noWrap
              sx={{ display: 'block', lineHeight: 1.35 }}
            >
              {row.original.contactName}
            </Typography>
            <Typography
              component="span"
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ display: 'block', lineHeight: 1.35 }}
            >
              {row.original.contactEmail}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 190,
        Cell: ({ row }) => (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            <Chip
              label={row.original.status}
              size="small"
              color={statusColors[row.original.status]}
            />
            {row.original.isHopeScholarship && (
              <Chip
                label="Hope Scholarship"
                size="small"
                color="info"
                variant="outlined"
                icon={<StarsIcon />}
              />
            )}
            {row.original.isAdultStudent && (
              <Chip label="Adult" size="small" variant="outlined" />
            )}
          </Stack>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        size: 100,
        enableSorting: false,
        enableColumnActions: false,
        muiTableBodyCellProps: { align: 'right' },
        muiTableHeadCellProps: { align: 'right' },
        Cell: ({ row }) => (
          <RowActionsMenu
            student={row.original.student}
            isHopeScholarship={row.original.isHopeScholarship}
            onEdit={onEdit}
            onDelete={onDelete}
            onScheduleLesson={onScheduleLesson}
            onCreateInvoice={onCreateInvoice}
          />
        ),
      },
    ],
    [detailHrefBase, onEdit, onDelete, onScheduleLesson, onCreateInvoice]
  );

  const table = useMaterialReactTable({
    columns,
    data: rows,
    state: { isLoading: studentsState.status === 'loading' },
    // The point of the trial (#851). Who the row is and when they come stay
    // on screen; what can be done about them stays reachable. Everything
    // between scrolls.
    enableColumnPinning: true,
    initialState: {
      // Katie reads her day in time order, so that is how the page opens
      // (#847). Students with no slot carry POSITIVE_INFINITY and land last.
      sorting: [{ id: 'weekdaySortKey', desc: false }],
      columnPinning: { left: ['name', 'weekdaySortKey'], right: ['actions'] },
      pagination: { pageIndex: 0, pageSize: 25 },
      density: 'comfortable',
    },
    // MRT paints pinned cells with a `:before` pseudo-element coloured from
    // `mrtTheme.baseBackgroundColor`, which defaults to the MUI theme's
    // background — the brand cream. The scrolling cells take the explicit
    // white below, so the two halves of the table did not match and the
    // pinned columns read as a rendering fault rather than a design choice.
    //
    // This is the supported lever; overriding the pseudo-element by hand
    // would fight the library on every upgrade.
    mrtTheme: { baseBackgroundColor: surfaces.paper },
    enableColumnFilters: false,
    enableGlobalFilter: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    muiTablePaperProps: {
      elevation: 0,
      sx: {
        backgroundColor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.default}`,
        boxShadow: shadows.sm,
        overflow: 'hidden',
      },
    },
    // Pinned cells sit ON TOP of the scrolling ones, and MRT ships them at
    // `opacity: 0.97` — enough for the columns underneath to read straight
    // through as ghost text. Forced opaque here.
    //
    // Only found by looking at it scrolled: every test passed, and the
    // computed background was already the right white.
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: surfaces.tableHeader,
        fontWeight: 600,
        '&[data-pinned="true"]': { opacity: 1 },
      },
    },
    muiTableBodyCellProps: {
      sx: {
        backgroundColor: surfaces.paper,
        borderColor: borders.subtle,
        '&[data-pinned="true"]': { opacity: 1 },
      },
    },
  });

  if (studentsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load students: {studentsState.error}
      </Alert>
    );
  }

  if (studentsState.status === 'idle') {
    return null;
  }

  if (studentsState.status === 'success' && rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No students yet</Typography>
        <Typography>
          Click &quot;Add Student&quot; to create the first record.
        </Typography>
      </Box>
    );
  }

  return <MaterialReactTable table={table} />;
}
