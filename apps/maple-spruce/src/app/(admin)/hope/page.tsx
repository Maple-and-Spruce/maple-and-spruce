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
import {
  BackfillLessonsDialog,
  HopeProductsCard,
  HopeStudentBilling,
} from '@maple/react/lessons';
import { formatHopePrice } from '@maple/ts/domain';
import {
  useHopeProducts,
  useHopeQueue,
  useStudents,
  useInstructors,
} from '../../../hooks';

/**
 * Hope Scholarship billing (legacy #799).
 *
 * The one screen that answers "what have we taught and not invoiced in the EMA
 * portal". One card per Hope student: their EMA orders, the taught lessons
 * those orders have room for (ready to invoice), and the ones that need the
 * family to order more. Grouped by student because that is how the portal is
 * worked, one family at a time. Hope invoices through EMA, never through
 * Square, so none of this touches `Invoice`.
 */
export default function HopePage() {
  const {
    queueState,
    fetchQueue,
    recordSubmissions,
    recording,
    saveOrder,
    isSavingOrder,
  } = useHopeQueue();
  const { studentsState } = useStudents();
  const { productsState, isSaving: isSavingProduct, saveProduct } =
    useHopeProducts();
  const { instructorsState } = useInstructors();

  const [backfillOpen, setBackfillOpen] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const students =
    studentsState.status === 'success' ? studentsState.data : [];
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const products =
    productsState.status === 'success' ? productsState.data : [];

  const handleMarkInvoiced = async (
    lessonIds: string[],
    emaReference?: string,
  ) => {
    const result = await recordSubmissions(lessonIds, 'submitted', {
      emaReference,
    });
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
        {queueState.status === 'success' && (() => {
          const { entries, orders, totals } = queueState.data;
          const hopeStudents = students.filter((st) => st.isHopeScholarship);
          const withWork = hopeStudents.filter(
            (st) =>
              entries.some((e) => e.studentId === st.id) ||
              orders.some((o) => o.studentId === st.id),
          );
          return (
            <>
              <Stack direction="row" spacing={3} sx={{ mb: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Ready to invoice
                  </Typography>
                  <Typography variant="h5">
                    {formatHopePrice(totals.readyCents)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {totals.readyCount} lessons
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Need an order
                  </Typography>
                  <Typography variant="h5">{totals.needsOrderCount}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    taught lessons
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Invoiced
                  </Typography>
                  <Typography variant="h5">
                    {formatHopePrice(totals.invoicedCents)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {totals.invoicedCount} lessons
                  </Typography>
                </Box>
              </Stack>
              {withWork.length === 0 && (
                <Alert severity="info">
                  No taught Hope lessons or EMA orders yet.
                </Alert>
              )}
              {withWork.map((student) => (
                <HopeStudentBilling
                  key={student.id}
                  studentName={student.name}
                  studentHref={`/students/${student.id}`}
                  entries={entries.filter((e) => e.studentId === student.id)}
                  orders={orders.filter((o) => o.studentId === student.id)}
                  products={products}
                  defaultProductId={student.hopeProductId}
                  recording={recording}
                  isSavingOrder={isSavingOrder}
                  onSaveOrder={(input) =>
                    saveOrder({ ...input, studentId: student.id })
                  }
                  onMarkInvoiced={handleMarkInvoiced}
                />
              ))}
            </>
          );
        })()}
      </Box>

      {/*
        Below the queue: the products are set up once and rarely touched, the
        queue is the daily work. A price change re-prices unclaimed lessons,
        so the queue is refetched after a save.
      */}
      <Box sx={{ mt: 4 }}>
        <HopeProductsCard
          productsState={productsState}
          isSaving={isSavingProduct}
          onSave={async (input) => {
            await saveProduct(input);
            await fetchQueue();
          }}
        />
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
