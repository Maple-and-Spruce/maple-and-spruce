'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Chip,
  Divider,
  IconButton,
  ListSubheader,
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
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import PaidIcon from '@mui/icons-material/Paid';
import UpcomingIcon from '@mui/icons-material/Upcoming';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
import { brandTableOptions, BRAND_TABLE_PAGE_SIZE } from '@maple/react/ui';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from './labels';

interface StudentListProps {
  studentsState: RequestState<Student[]>;
  instructors: Instructor[];
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
  /** Set or change the student's weekly slot. Omit to hide the action. */
  onSetWeeklySchedule?: (student: Student) => void;
  /** Charge for lessons already taught and not paid for. Omit to hide. */
  onChargePastLessons?: (student: Student) => void;
  /** Line up the next lessons, with an optional charge ahead. Omit to hide. */
  onPlanNextLessons?: (student: Student) => void;
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

type RowAction = (student: Student) => void;

/**
 * Per-row actions, in the order Katie does them: the student record, the
 * weekly slot, settling past lessons, lining up the next ones. The one-off and
 * record-keeping actions come after, and delete sits alone at the bottom.
 *
 * Edit is also a visible button beside the menu, because changing a rate,
 * instrument or teacher is the commonest thing done from this table.
 */
function RowActionsMenu({
  student,
  isHopeScholarship,
  detailHref,
  onEdit,
  onDelete,
  onSetWeeklySchedule,
  onChargePastLessons,
  onPlanNextLessons,
  onScheduleLesson,
  onCreateInvoice,
}: {
  student: Student;
  isHopeScholarship: boolean;
  detailHref?: string;
  onEdit: RowAction;
  onDelete: RowAction;
  onSetWeeklySchedule?: RowAction;
  onChargePastLessons?: RowAction;
  onPlanNextLessons?: RowAction;
  onScheduleLesson?: RowAction;
  onCreateInvoice?: RowAction;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const item = (
    label: string,
    icon: ReactNode,
    action: RowAction | undefined,
    disabled = false
  ) =>
    action ? (
      <MenuItem
        key={label}
        onClick={run(() => action(student))}
        disabled={disabled}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText>{label}</ListItemText>
      </MenuItem>
    ) : null;

  // Hope families bill through EMA, so the billing actions say so rather than
  // vanishing: a missing item reads as a bug, a labelled one as a rule.
  const hope = (label: string) =>
    isHopeScholarship ? label.replace(/…$/, ' (Hope)') : label;

  const lessonItems = [
    item('Weekly schedule…', <EventRepeatIcon fontSize="small" />, onSetWeeklySchedule),
    item(
      hope('Charge for past lessons…'),
      <PaidIcon fontSize="small" />,
      onChargePastLessons,
      isHopeScholarship
    ),
    item('Next lessons…', <UpcomingIcon fontSize="small" />, onPlanNextLessons),
  ].filter(Boolean);

  const otherItems = [
    item('Add a one-off lesson…', <EventIcon fontSize="small" />, onScheduleLesson),
    item(
      hope('Create invoice…'),
      <ReceiptLongIcon fontSize="small" />,
      onCreateInvoice,
      isHopeScholarship
    ),
  ].filter(Boolean);

  return (
    <Stack direction="row" spacing={0.25} sx={{
      justifyContent: 'flex-end'
    }}>
      <Tooltip title="Edit student">
        <IconButton
          size="small"
          aria-label={`Edit ${student.name}`}
          onClick={() => onEdit(student)}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="More actions">
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
        {item('Edit student…', <EditIcon fontSize="small" />, onEdit)}
        {lessonItems.length > 0 && <Divider />}
        {lessonItems.length > 0 && <ListSubheader>Lessons</ListSubheader>}
        {lessonItems}
        {otherItems.length > 0 && <Divider />}
        {otherItems}
        {detailHref && <Divider />}
        {detailHref && (
          <MenuItem component={Link} href={detailHref} onClick={close}>
            <ListItemIcon>
              <OpenInNewIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Open student page</ListItemText>
          </MenuItem>
        )}
        <Divider />
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
    </Stack>
  );
}

export function StudentList({
  studentsState,
  instructors,
  onEdit,
  onDelete,
  onSetWeeklySchedule,
  onChargePastLessons,
  onPlanNextLessons,
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
        // rather than scattering through the list (#86).
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
                color="textSecondary"
                noWrap
                sx={{ display: 'block', lineHeight: 1.35 }}
              >
                {row.original.timeBlockDisplay}
              </Typography>
            </Box>
          ) : (
            <Typography component="span" variant="body2" color="textSecondary">
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
                color="textSecondary"
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
              color="textSecondary"
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
        size: 110,
        enableSorting: false,
        enableColumnActions: false,
        muiTableBodyCellProps: { align: 'right' },
        muiTableHeadCellProps: { align: 'right' },
        Cell: ({ row }) => (
          <RowActionsMenu
            student={row.original.student}
            isHopeScholarship={row.original.isHopeScholarship}
            detailHref={
              detailHrefBase
                ? `${detailHrefBase}/${row.original.student.id}`
                : undefined
            }
            onEdit={onEdit}
            onDelete={onDelete}
            onSetWeeklySchedule={onSetWeeklySchedule}
            onChargePastLessons={onChargePastLessons}
            onPlanNextLessons={onPlanNextLessons}
            onScheduleLesson={onScheduleLesson}
            onCreateInvoice={onCreateInvoice}
          />
        ),
      },
    ],
    [
      detailHrefBase,
      onEdit,
      onDelete,
      onSetWeeklySchedule,
      onChargePastLessons,
      onPlanNextLessons,
      onScheduleLesson,
      onCreateInvoice,
    ]
  );

  const table = useMaterialReactTable({
    // Brand surfaces and the two pinning fixes from the trial (#87, #88).
    ...brandTableOptions<StudentRow>(),
    columns,
    data: rows,
    state: { isLoading: studentsState.status === 'loading' },
    // The point of the trial (#87). Who the row is and when they come stay
    // on screen; what can be done about them stays reachable. Everything
    // between scrolls.
    enableColumnPinning: true,
    initialState: {
      // Katie reads her day in time order, so that is how the page opens
      // (#86). Students with no slot carry POSITIVE_INFINITY and land last.
      sorting: [{ id: 'weekdaySortKey', desc: false }],
      columnPinning: { left: ['name', 'weekdaySortKey'], right: ['actions'] },
      pagination: { pageIndex: 0, pageSize: BRAND_TABLE_PAGE_SIZE },
      density: 'comfortable',
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
