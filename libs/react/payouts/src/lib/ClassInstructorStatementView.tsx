'use client';

import { Alert, Box, Chip, Divider, Paper, Skeleton, Stack, Typography } from '@mui/material';
import {
  CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS,
  type RequestState,
  type StatementStaleReason,
} from '@maple/ts/domain';
import type { GetClassInstructorStatementResponse } from '@maple/ts/firebase/api-types';
import { StatementLinesTable } from './StatementLinesTable';
import { formatDay, formatMonth, formatRate } from './payout-format';

export interface ClassInstructorStatementViewProps {
  statementState: RequestState<GetClassInstructorStatementResponse>;
}

function staleMessage(reason: StatementStaleReason): string {
  return reason.kind === 'sessions-changed'
    ? `A class's sessions changed from ${reason.was} to ${reason.now} after this was generated.`
    : `A registration on this statement is now ${reason.status}.`;
}

/**
 * The instructor statement itself, laid out to print or save as a PDF.
 * Anything marked `data-print-hide` stays on screen only.
 */
export function ClassInstructorStatementView({ statementState }: ClassInstructorStatementViewProps) {
  if (statementState.status === 'idle' || statementState.status === 'loading') {
    return (
      <Stack spacing={2} aria-busy="true" aria-label="Loading statement">
        <Skeleton variant="text" width={320} height={48} />
        <Skeleton variant="rectangular" height={200} />
      </Stack>
    );
  }
  if (statementState.status === 'error') {
    return <Alert severity="error">Failed to load statement: {statementState.error}</Alert>;
  }

  const { statement, staleReasons } = statementState.data;

  return (
    <Paper
      component="article"
      aria-label="Instructor statement"
      variant="outlined"
      sx={{ p: { xs: 2, sm: 4 }, '@media print': { border: 'none', p: 0 } }}
    >
      {staleReasons.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-print-hide>
          This statement no longer matches the data. Void it and generate it again before paying.
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {staleReasons.map((r) => (
              <li key={`${r.kind}-${'registrationId' in r ? r.registrationId : r.classId}`}>
                {staleMessage(r)}
              </li>
            ))}
          </Box>
        </Alert>
      )}
      {statement.status === 'void' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This statement was voided and is kept for the record only.
        </Alert>
      )}
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 2
        }}>
        <Box>
          <Typography variant="overline" color="textSecondary">
            Maple &amp; Spruce · Instructor statement
          </Typography>
          <Typography variant="h4" component="h1">
            {statement.instructorName}
          </Typography>
          <Typography variant="h6" component="p" color="textSecondary">
            Classes held in {formatMonth(statement.month)}
          </Typography>
        </Box>
        {statement.status === 'paid' && (
          <Chip label="Paid" color="success" sx={{ fontWeight: 700, fontSize: '1rem', px: 1 }} />
        )}
      </Stack>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Your share is {formatRate(statement.payRate)} of what students paid for each class, after
        discounts and before sales tax. A class that runs across months is split evenly by session,
        and each session is paid in the month it was held.
      </Typography>
      <StatementLinesTable
        classes={statement.classes}
        adjustments={statement.adjustments}
        payRate={statement.payRate}
        grossCents={statement.grossCents}
        totalOwedCents={statement.totalOwedCents}
      />
      {statement.status === 'paid' && statement.paidOn && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2">
            Paid {formatDay(statement.paidOn)}
            {statement.paymentMethod &&
              ` by ${CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS[statement.paymentMethod]}`}
            {statement.paymentReference && ` (ref. ${statement.paymentReference})`}.
          </Typography>
        </>
      )}
    </Paper>
  );
}
