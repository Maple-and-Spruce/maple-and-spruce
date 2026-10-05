'use client';

/**
 * The students, one section per day of the week (#159).
 *
 * Katie thinks of her teaching a day at a time, so the list reads like her
 * week: Monday's students in time order, then Tuesday's. A row opens the
 * student on Next lessons; the menu holds only what the student page does
 * not — editing the record and deleting it.
 */
import { useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import type {
  Instructor,
  RequestState,
  Student,
  StudentLessonSchedule,
} from '@maple/ts/domain';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from './labels';
import { clockLabel, groupStudentsByDay } from './students-by-day';

export interface StudentsByDayProps {
  studentsState: RequestState<Student[]>;
  schedulesState: RequestState<StudentLessonSchedule[]>;
  instructors: Instructor[];
  /** Only this teacher's students; omit for everyone. */
  teacherId?: string;
  /** Name the teacher on each row — useful when showing everyone's. */
  showTeacher: boolean;
  /** Today's weekday (0 = Sunday), so today's section is marked. */
  todayWeekday?: number;
  hrefFor: (student: Student) => string;
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
}

function RowMenu({
  student,
  onEdit,
  onDelete,
}: {
  student: Student;
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Actions for ${student.name}`}
        aria-haspopup="menu"
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onEdit(student);
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit student…</ListItemText>
        </MenuItem>
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setAnchor(null);
            onDelete(student);
          }}
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

export function StudentsByDay({
  studentsState,
  schedulesState,
  instructors,
  teacherId,
  showTeacher,
  todayWeekday,
  hrefFor,
  onEdit,
  onDelete,
}: StudentsByDayProps) {
  const failed = [studentsState, schedulesState].find((s) => s.status === 'error');
  if (failed && failed.status === 'error') {
    return <Alert severity="error">Could not load students: {failed.error}</Alert>;
  }
  if (studentsState.status !== 'success' || schedulesState.status !== 'success') {
    return (
      <Box aria-busy="true">
        {[0, 1].map((i) => (
          <Paper key={i} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Skeleton variant="text" width={120} />
            <Skeleton variant="text" height={40} />
            <Skeleton variant="text" height={40} />
          </Paper>
        ))}
      </Box>
    );
  }

  const groups = groupStudentsByDay(
    studentsState.data,
    schedulesState.data,
    teacherId
  );
  if (groups.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No students yet</Typography>
        <Typography>
          {teacherId
            ? 'None of your students are here yet. Show everyone’s to see the rest.'
            : 'Click "Add Student" to create the first record.'}
        </Typography>
      </Box>
    );
  }

  const teacherName = new Map(instructors.map((i) => [i.id, i.name]));

  return (
    <>
      {groups.map((group) => (
        <Paper
          key={group.key}
          variant="outlined"
          component="section"
          aria-labelledby={`${group.key}-heading`}
          sx={{ mb: 2 }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              pt: 1.5,
            }}
          >
            <Typography variant="h6" component="h2" id={`${group.key}-heading`}>
              {group.label}
            </Typography>
            {group.weekday !== undefined && group.weekday === todayWeekday && (
              <Chip label="Today" size="small" color="primary" />
            )}
            <Typography variant="body2" color="textSecondary" sx={{ ml: 'auto' }}>
              {group.entries.length}
            </Typography>
          </Box>
          <List dense aria-label={group.label}>
            {group.entries.map(({ student, schedule }) => {
              const detail = [
                INSTRUMENT_LABELS[student.instrument] ?? student.instrument,
                student.registeredLessonLength
                  ? LESSON_LENGTH_LABELS[student.registeredLessonLength]
                  : null,
                showTeacher
                  ? (teacherName.get(schedule?.teacherId ?? student.primaryTeacherId) ??
                    'Unassigned')
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Box
                  key={`${student.id}-${schedule?.id ?? 'none'}`}
                  component="li"
                  sx={{ display: 'flex', alignItems: 'center', pr: 1 }}
                >
                  <ListItemButton
                    component={Link}
                    href={hrefFor(student)}
                    sx={{ gap: 2, flex: 1, minWidth: 0 }}
                  >
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ width: 72, flexShrink: 0 }}
                    >
                      {schedule ? clockLabel(schedule.startMinutes) : '—'}
                    </Typography>
                    <ListItemText
                      primary={student.name}
                      secondary={detail}
                      slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                    />
                    {student.isHopeScholarship && (
                      <Chip
                        label="Hope"
                        size="small"
                        color="info"
                        variant="outlined"
                        icon={<StarsIcon />}
                      />
                    )}
                  </ListItemButton>
                  <RowMenu student={student} onEdit={onEdit} onDelete={onDelete} />
                </Box>
              );
            })}
          </List>
        </Paper>
      ))}
    </>
  );
}
