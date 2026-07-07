'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid';
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

export function StudentList({
  studentsState,
  instructors,
  onEdit,
  onDelete,
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

  const columns: GridColDef<StudentRow>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Student',
        flex: 1,
        minWidth: 160,
        renderCell: (params: GridRenderCellParams<StudentRow>) => {
          const { student } = params.row;
          const name = (
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {student.name}
            </Typography>
          );
          return detailHrefBase ? (
            <Link
              href={`${detailHrefBase}/${student.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {name}
            </Link>
          ) : (
            name
          );
        },
      },
      {
        field: 'instrumentLabel',
        headerName: 'Instrument',
        width: 140,
        renderCell: (params: GridRenderCellParams<StudentRow>) => (
          <Box sx={{ py: 0.5 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
              {params.row.instrumentLabel}
            </Typography>
            {params.row.lessonLengthLabel && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ lineHeight: 1.3 }}
              >
                {params.row.lessonLengthLabel}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        field: 'weekdaySortKey',
        headerName: 'Lesson Day / Time',
        flex: 1,
        minWidth: 150,
        sortComparator: (a: number, b: number) => a - b,
        valueGetter: (_value, row) => row.weekdaySortKey,
        renderCell: (params: GridRenderCellParams<StudentRow>) =>
          params.row.dayDisplay ? (
            <Box sx={{ py: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                {params.row.dayDisplay}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ lineHeight: 1.3 }}
              >
                {params.row.timeBlockDisplay}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          ),
      },
      {
        field: 'teacherName',
        headerName: 'Teacher',
        width: 140,
      },
      {
        field: 'contactName',
        headerName: 'Contact',
        flex: 1,
        minWidth: 170,
        renderCell: (params: GridRenderCellParams<StudentRow>) => (
          <Box sx={{ py: 0.5, minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ lineHeight: 1.3 }}>
              {params.row.contactName}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ lineHeight: 1.3, display: 'block' }}
            >
              {params.row.contactEmail}
            </Typography>
          </Box>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 170,
        renderCell: (params: GridRenderCellParams<StudentRow>) => (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
            <Chip
              label={params.row.status}
              size="small"
              color={statusColors[params.row.status]}
            />
            {params.row.isHopeScholarship && (
              <Chip
                label="Hope Scholarship"
                size="small"
                color="info"
                variant="outlined"
                icon={<StarsIcon />}
              />
            )}
            {params.row.isAdultStudent && (
              <Chip label="Adult" size="small" variant="outlined" />
            )}
          </Stack>
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 110,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params: GridRenderCellParams<StudentRow>) => (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Edit">
              <IconButton
                onClick={() => onEdit(params.row.student)}
                size="small"
                aria-label="Edit"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton
                onClick={() => onDelete(params.row.student)}
                size="small"
                aria-label="Delete"
                color="error"
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        ),
      },
    ],
    [detailHrefBase, onEdit, onDelete]
  );

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

  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        backgroundColor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.default}`,
        boxShadow: shadows.sm,
        overflow: 'hidden',
      }}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        loading={studentsState.status === 'loading'}
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          border: 'none',
          backgroundColor: surfaces.paper,
          '--DataGrid-containerBackground': surfaces.tableHeader,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: surfaces.tableHeader,
            borderBottom: `1px solid ${borders.subtle}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            borderColor: borders.subtle,
          },
          '& .MuiDataGrid-row:last-child .MuiDataGrid-cell': {
            borderBottom: 'none',
          },
        }}
      />
    </Paper>
  );
}
