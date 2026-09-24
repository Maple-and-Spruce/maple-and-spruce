'use client';

/**
 * Lesson Billing (#81) — every automatic charge across the studio.
 *
 * The daily job plans a charge and then takes it, both unattended. This is the
 * one place that shows what is about to happen and lets Katie stop it, so it
 * exists **before** any screen that creates a billing rule: it must never be
 * possible to start charging families without being able to look at what will
 * be charged.
 */
import { useMemo } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import {
  BillingRulesCard,
  RunBillingCard,
  UpcomingChargesCard,
} from '@maple/react/lessons';
import { useLessonBilling, useStudents } from '../../../hooks';

export default function LessonBillingPage() {
  const { billingState, pendingId, actionError, stopCharge, saveRule, runBilling } =
    useLessonBilling();
  const { studentsState } = useStudents();

  const students = studentsState.status === 'success' ? studentsState.data : [];
  const studentNames = useMemo(
    () => Object.fromEntries(students.map((s) => [s.id, s.name])),
    [students]
  );

  const rules = billingState.status === 'success' ? billingState.data.rules : [];
  const cardless = students.filter(
    (s) => s.status === 'active' && !s.isHopeScholarship && !s.squareCardId
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Lesson Billing
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Charges are planned ahead of the lessons they pay for and taken by a job
        that runs each morning. Anything still scheduled can be stopped here.
      </Typography>

      <UpcomingChargesCard
        charges={
          billingState.status === 'success' ? billingState.data.charges : []
        }
        studentNames={studentNames}
        isLoading={billingState.status === 'loading'}
        pendingId={pendingId}
        error={
          actionError ??
          (billingState.status === 'error' ? billingState.error : null)
        }
        onCancel={(id) => stopCharge(id, 'cancelled')}
        onWaive={(id, reason) => stopCharge(id, 'waived', reason)}
      />

      {/*
        Rules and the run control sit below the charges on purpose: see what is
        about to happen first, change the policy second (#107).
      */}
      <BillingRulesCard
        rules={rules}
        students={students}
        isLoading={billingState.status === 'loading'}
        pendingId={pendingId}
        error={actionError}
        onSave={(draft) => saveRule(draft)}
      />

      <RunBillingCard
        pendingId={pendingId}
        error={actionError}
        hasRules={rules.some((r) => !r.archived)}
        onRun={runBilling}
      />

      {cardless.length > 0 && (
        <Alert severity="warning">
          {cardless.length} active private-pay student
          {cardless.length === 1 ? ' has' : 's have'} no card on file, so
          nothing can be charged for them automatically:{' '}
          {cardless.map((s) => s.name).join(', ')}.
        </Alert>
      )}
    </Box>
  );
}
