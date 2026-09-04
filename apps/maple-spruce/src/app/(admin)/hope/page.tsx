'use client';

import { useState } from 'react';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type {
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
} from '@maple/ts/firebase/api-types';
import { BackfillLessonsDialog, HopeQueue } from '@maple/react/lessons';
import { useHopeQueue, useStudents, useInstructors } from '../../../hooks';

/**
 * Hope Scholarship billing (#799).
 *
 * The one screen that answers "what have we taught and not been paid for".
 * Hope invoices through the EMA portal, never through Square, so none of this
 * touches `Invoice`.
 */
export default function HopePage() {
  const { queueState, fetchQueue, recordSubmissions, recording } =
    useHopeQueue();
  const { studentsState } = useStudents();
  const { instructorsState } = useInstructors();

  const [backfillOpen, setBackfillOpen] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const students =
    studentsState.status === 'success' ? studentsState.data : [];
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const handleRecord = async (
    lessonIds: string[],
    status: Parameters<typeof recordSubmissions>[1],
  ) => {
    const result = await recordSubmissions(lessonIds, status);
    // Skips are reported rather than thrown, so say so instead of silently
    // recording fewer claims than were asked for.
    setNotice(
      result.skipped.length > 0
        ? `Recorded ${result.recordedLessonIds.length}. Skipped ${result.skipped.length}: ${result.skipped
            .map((s) => s.reason)
            .join('; ')}`
        : null,
    );
  };

  const handleBackfill = async (input: {
    studentId: string;
    teacherId: string;
    durationMinutes: number;
    scheduledAts: Date[];
  }) => {
    setIsBackfilling(true);
    try {
      const fn = httpsCallable<
        CreateLessonSeriesRequest,
        CreateLessonSeriesResponse
      >(getMapleFunctions(), 'createLessonSeries');
      await fn({
        ...input,
        // Already taught. This is what makes the lessons claimable, and what
        // exempts them from block attribution server-side.
        status: 'rendered',
        blockId: null,
      });
      setBackfillOpen(false);
      await fetchQueue();
    } finally {
      setIsBackfilling(false);
    }
  };

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 1, gap: 2, flexWrap: 'wrap' }}
      >
        <Box>
          <Typography variant="h4" gutterBottom>
            Hope Scholarship billing
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Rendered lessons for Hope students, and what has been claimed from
            the EMA portal. Hope pays only for services rendered, so no-shows
            never appear here.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<HistoryIcon />}
          onClick={() => setBackfillOpen(true)}
        >
          Record past lessons
        </Button>
      </Stack>

      {notice && (
        <Alert severity="warning" sx={{ my: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Box sx={{ mt: 3 }}>
        {queueState.status === 'loading' && (
          <Skeleton variant="rectangular" height={320} />
        )}
        {queueState.status === 'error' && (
          <Alert severity="error">{queueState.error}</Alert>
        )}
        {queueState.status === 'success' && (
          <HopeQueue
            entries={queueState.data.entries}
            totals={queueState.data.totals}
            recording={recording}
            onRecord={handleRecord}
          />
        )}
      </Box>

      <BackfillLessonsDialog
        open={backfillOpen}
        students={students}
        instructors={instructors}
        isSubmitting={isBackfilling}
        onClose={() => setBackfillOpen(false)}
        onSubmit={handleBackfill}
      />
    </Box>
  );
}
