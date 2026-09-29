'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS,
  type ClassInstructorStatement,
  type ClassInstructorStatementStatus,
  type RequestState,
} from '@maple/ts/domain';
import type { GetClassInstructorStatementsResponse } from '@maple/ts/firebase/api-types';
import { formatDay, formatMoney, formatMonth } from './payout-format';

export interface ClassInstructorStatementsListProps {
  statementsState: RequestState<GetClassInstructorStatementsResponse>;
  onMarkPaid: (statement: ClassInstructorStatement) => void;
  onVoid: (statement: ClassInstructorStatement) => void;
  statementHref: (id: string) => string;
  /** Show void statements too. Off by default: they're history, not work. */
  includeVoid?: boolean;
}

const STATUS_COLOR: Record<ClassInstructorStatementStatus, 'default' | 'success' | 'warning'> = {
  pending: 'warning',
  paid: 'success',
  void: 'default',
};

function LoadingSkeleton() {
  return (
    <Stack spacing={1} aria-busy="true" aria-label="Loading statements">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rectangular" height={40} />
      ))}
    </Stack>
  );
}

/** Every class-instructor statement, newest month first. */
export function ClassInstructorStatementsList({
  statementsState,
  onMarkPaid,
  onVoid,
  statementHref,
  includeVoid = false,
}: ClassInstructorStatementsListProps) {
  if (statementsState.status === 'idle' || statementsState.status === 'loading') {
    return <LoadingSkeleton />;
  }
  if (statementsState.status === 'error') {
    return <Alert severity="error">Failed to load statements: {statementsState.error}</Alert>;
  }

  const { paidThisYearByInstructor } = statementsState.data;
  const statements = statementsState.data.statements.filter(
    (s) => includeVoid || s.status !== 'void'
  );
  if (statements.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography variant="body1">No statements yet.</Typography>
        <Typography variant="body2">Generate one from a finished month above.</Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table
        size="small"
        aria-label="Class instructor statements"
        sx={{ '& th, & td': { whiteSpace: 'nowrap' } }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Month</TableCell>
            <TableCell>Instructor</TableCell>
            <TableCell align="right">Owed</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Paid</TableCell>
            <TableCell align="right">Paid this year</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {statements.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link href={statementHref(s.id)}>{formatMonth(s.month)}</Link>
              </TableCell>
              <TableCell>{s.instructorName}</TableCell>
              <TableCell align="right">{formatMoney(s.totalOwedCents)}</TableCell>
              <TableCell>
                <Chip size="small" label={s.status} color={STATUS_COLOR[s.status]} />
              </TableCell>
              <TableCell>
                {s.status === 'paid' && s.paidOn
                  ? `${formatDay(s.paidOn)} · ${
                      s.paymentMethod ? CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS[s.paymentMethod] : ''
                    }${s.paymentReference ? ` · ${s.paymentReference}` : ''}`
                  : '—'}
              </TableCell>
              <TableCell align="right">
                {formatMoney(paidThisYearByInstructor[s.instructorId] ?? 0)}
              </TableCell>
              <TableCell align="right">
                {s.status === 'pending' && (
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" variant="contained" onClick={() => onMarkPaid(s)}>
                      Mark paid
                    </Button>
                    <Button size="small" color="error" onClick={() => onVoid(s)}>
                      Void
                    </Button>
                  </Stack>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
