'use client';

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Grid2 as Grid,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarsIcon from '@mui/icons-material/Stars';
import type { Instructor, RequestState, Student } from '@maple/ts/domain';
import { INSTRUMENT_LABELS, LESSON_LENGTH_LABELS } from './labels';

interface StudentListProps {
  studentsState: RequestState<Student[]>;
  instructors: Instructor[];
  onEdit: (student: Student) => void;
  onDelete: (student: Student) => void;
}

const statusColors: Record<string, 'success' | 'default'> = {
  active: 'success',
  inactive: 'default',
};

function StudentCard({
  student,
  teacherName,
  onEdit,
  onDelete,
}: {
  student: Student;
  teacherName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" component="h3" noWrap>
              {student.name}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 0.5 }}
            >
              {INSTRUMENT_LABELS[student.instrument]}
              {student.registeredLessonLength &&
                ` • ${LESSON_LENGTH_LABELS[student.registeredLessonLength]}`}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 0.5 }}
            >
              Teacher: {teacherName}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1 }}
              noWrap
            >
              {student.isAdultStudent ? 'Contact' : 'Parent/guardian'}:{' '}
              {student.primaryContactName} · {student.primaryContactEmail}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={student.status}
                size="small"
                color={statusColors[student.status]}
              />
              {student.isHopeScholarship && (
                <Chip
                  label="Hope Scholarship"
                  size="small"
                  color="info"
                  variant="outlined"
                  icon={<StarsIcon />}
                />
              )}
              {student.isAdultStudent && (
                <Chip
                  label="Adult"
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton onClick={onEdit} size="small" aria-label="Edit">
              <EditIcon />
            </IconButton>
            <IconButton
              onClick={onDelete}
              size="small"
              aria-label="Delete"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3].map((i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="60%" height={32} />
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="50%" />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Skeleton variant="rounded" width={80} height={24} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export function StudentList({
  studentsState,
  instructors,
  onEdit,
  onDelete,
}: StudentListProps) {
  if (studentsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

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

  const students = studentsState.data;

  if (students.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No students yet</Typography>
        <Typography>
          Click &quot;Add Student&quot; to create the first record.
        </Typography>
      </Box>
    );
  }

  const teacherNameById = new Map(
    instructors.map((i) => [i.id, i.name])
  );

  return (
    <Grid container spacing={2}>
      {students.map((student) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={student.id}>
          <StudentCard
            student={student}
            teacherName={
              teacherNameById.get(student.primaryTeacherId) ?? 'Unassigned'
            }
            onEdit={() => onEdit(student)}
            onDelete={() => onDelete(student)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
