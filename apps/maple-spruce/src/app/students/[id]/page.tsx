'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Skeleton,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import StarsIcon from '@mui/icons-material/Stars';
import type {
  CreateLessonInput,
  CreateLessonSeriesInput,
  Lesson,
  UpdateLessonInput,
} from '@maple/ts/domain';
import { DeleteConfirmDialog } from '@maple/react/ui';
import {
  EditLessonDialog,
  LessonList,
  ScheduleLessonDialog,
} from '@maple/react/lessons';
import {
  INSTRUMENT_LABELS,
  LESSON_LENGTH_LABELS,
} from '@maple/react/students';
import { AppShell } from '../../../components/layout';
import { useInstructors, useLessons, useStudents } from '../../../hooks';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params?.id ?? '';

  const { studentsState } = useStudents();
  const { instructorsState } = useInstructors();
  const {
    lessonsState,
    createLesson,
    createLessonSeries,
    updateLesson,
  } = useLessons({ studentId });

  const student = useMemo(() => {
    if (studentsState.status !== 'success') return undefined;
    return studentsState.data.find((s) => s.id === studentId);
  }, [studentsState, studentId]);

  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const primaryTeacherName = useMemo(() => {
    if (!student) return '—';
    const match = instructors.find((i) => i.id === student.primaryTeacherId);
    return match?.name ?? 'Unassigned';
  }, [student, instructors]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<Lesson | undefined>();
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateSingle = async (input: CreateLessonInput) => {
    setIsSubmitting(true);
    try {
      await createLesson(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSeries = async (input: CreateLessonSeriesInput) => {
    setIsSubmitting(true);
    try {
      await createLessonSeries(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (input: UpdateLessonInput) => {
    setIsSubmitting(true);
    try {
      await updateLesson(input);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelLesson) return;
    setIsSubmitting(true);
    try {
      await updateLesson({ id: cancelLesson.id, status: 'cancelled' });
      setCancelLesson(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (studentsState.status === 'loading') {
    return (
      <AppShell>
        <Skeleton variant="text" width={240} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ mb: 3 }} />
      </AppShell>
    );
  }

  if (studentsState.status === 'success' && !student) {
    return (
      <AppShell>
        <Alert severity="error">Student not found.</Alert>
        <Button component={Link} href="/students" sx={{ mt: 2 }}>
          Back to students
        </Button>
      </AppShell>
    );
  }

  if (!student) {
    return (
      <AppShell>
        <Skeleton variant="rectangular" height={120} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link href="/students" style={{ color: 'inherit' }}>
          Students
        </Link>
        <Typography color="text.primary">{student.name}</Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            {student.name}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {INSTRUMENT_LABELS[student.instrument]}
            {student.registeredLessonLength &&
              ` · ${LESSON_LENGTH_LABELS[student.registeredLessonLength]}`}
            {` · Teacher: ${primaryTeacherName}`}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5 }}
          >
            {student.isAdultStudent ? 'Contact' : 'Parent/guardian'}:{' '}
            {student.primaryContactName} · {student.primaryContactEmail}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={student.status}
              size="small"
              color={student.status === 'active' ? 'success' : 'default'}
            />
            {student.isHopeScholarship && (
              <Chip
                icon={<StarsIcon />}
                label="Hope Scholarship"
                size="small"
                color="info"
                variant="outlined"
              />
            )}
            {student.isAdultStudent && (
              <Chip label="Adult" size="small" variant="outlined" />
            )}
          </Box>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setScheduleOpen(true)}
          disabled={instructors.length === 0}
        >
          Schedule lessons
        </Button>
      </Box>

      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        Lessons
      </Typography>
      <LessonList
        lessonsState={lessonsState}
        instructors={instructors}
        primaryTeacherId={student.primaryTeacherId}
        onEdit={(lesson) => setEditLesson(lesson)}
        onCancel={(lesson) => setCancelLesson(lesson)}
      />

      <ScheduleLessonDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        studentId={student.id}
        defaultTeacherId={student.primaryTeacherId}
        instructors={instructors}
        defaultDurationMinutes={
          student.registeredLessonLength === '45-min'
            ? 45
            : student.registeredLessonLength === '60-min'
              ? 60
              : 30
        }
        onCreateSingle={handleCreateSingle}
        onCreateSeries={handleCreateSeries}
        isSubmitting={isSubmitting}
      />

      <EditLessonDialog
        open={!!editLesson}
        onClose={() => setEditLesson(undefined)}
        lesson={editLesson}
        primaryTeacherId={student.primaryTeacherId}
        instructors={instructors}
        onSubmit={handleEditSubmit}
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!cancelLesson}
        onClose={() => setCancelLesson(null)}
        onConfirm={handleConfirmCancel}
        isDeleting={isSubmitting}
        title="Cancel this lesson?"
        itemName={
          cancelLesson
            ? cancelLesson.scheduledAt.toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
            : ''
        }
        warningContent={
          <Alert severity="info">
            The lesson stays on record with status &quot;cancelled&quot;. For
            recurring series, other occurrences are unaffected.
          </Alert>
        }
      />
    </AppShell>
  );
}
