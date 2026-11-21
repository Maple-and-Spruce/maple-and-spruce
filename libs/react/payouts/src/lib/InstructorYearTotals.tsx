'use client';

import {
  Alert,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { RequestState } from '@maple/ts/domain';
import type { GetClassInstructorStatementsResponse } from '@maple/ts/firebase/api-types';
import { formatMoney } from './payout-format';

export interface InstructorYearTotalsProps {
  statementsState: RequestState<GetClassInstructorStatementsResponse>;
}

/**
 * What each instructor was actually paid in each calendar year, by the day it
 * was paid. These are the figures for the 1099-NEC and the workers' comp
 * audit, so they count paid statements only.
 */
export function InstructorYearTotals({ statementsState }: InstructorYearTotalsProps) {
  if (statementsState.status === 'idle' || statementsState.status === 'loading') {
    return <Skeleton variant="rectangular" height={80} aria-busy="true" aria-label="Loading yearly totals" />;
  }
  if (statementsState.status === 'error') {
    return <Alert severity="error">Failed to load yearly totals: {statementsState.error}</Alert>;
  }

  const { statements, paidByYearByInstructor = {} } = statementsState.data;
  const nameById = new Map(statements.map((s) => [s.instructorId, s.instructorName]));
  const years = [
    ...new Set(Object.values(paidByYearByInstructor).flatMap((byYear) => Object.keys(byYear))),
  ].sort((a, b) => b.localeCompare(a));
  const rows = Object.entries(paidByYearByInstructor)
    .map(([instructorId, byYear]) => ({
      instructorId,
      name: nameById.get(instructorId) ?? instructorId,
      byYear,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0 || years.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        Nothing has been marked paid yet.
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small" aria-label="Paid by calendar year" sx={{ width: 'auto' }}>
        <TableHead>
          <TableRow>
            <TableCell>Instructor</TableCell>
            {years.map((year) => (
              <TableCell key={year} align="right">
                {year}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.instructorId}>
              <TableCell>{row.name}</TableCell>
              {years.map((year) => (
                <TableCell key={year} align="right">
                  {formatMoney(row.byYear[year] ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
