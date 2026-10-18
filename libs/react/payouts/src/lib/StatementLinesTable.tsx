'use client';

import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { StatementAdjustment, StatementClassLine } from '@maple/ts/domain';
import { formatMoney, formatRate, formatSessionDate } from './payout-format';

export interface StatementLinesTableProps {
  classes: StatementClassLine[];
  adjustments: StatementAdjustment[];
  payRate: number | undefined;
  grossCents: number;
  totalOwedCents: number;
  /** Heading for the total row. */
  totalLabel?: string;
}

function sessionsLabel(line: StatementClassLine): string {
  const dates = line.sessions.map((s) => formatSessionDate(s.at)).join(', ');
  return line.totalSessions > 1
    ? `${dates} (${line.sessions.length} of ${line.totalSessions} sessions)`
    : dates;
}

/**
 * The classes and adjustments on a statement or a preview: sessions, headcount,
 * what students paid (pre-tax, after discount), and the instructor's share.
 */
export function StatementLinesTable({
  classes,
  adjustments,
  payRate,
  grossCents,
  totalOwedCents,
  totalLabel = 'Total owed',
}: StatementLinesTableProps) {
  return (
    <Table size="small" aria-label="Statement lines">
      <TableHead>
        <TableRow>
          <TableCell>Class</TableCell>
          <TableCell>Sessions</TableCell>
          <TableCell align="right">Students</TableCell>
          <TableCell align="right">Paid by students</TableCell>
          <TableCell align="right">Share ({formatRate(payRate)})</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {classes.map((line) => (
          <TableRow key={line.classId}>
            <TableCell>
              {line.className}
              {line.includesEarlierMonths && (
                <Chip size="small" label="Includes earlier month" variant="outlined" sx={{ ml: 1 }} />
              )}
            </TableCell>
            <TableCell>{sessionsLabel(line)}</TableCell>
            <TableCell align="right">{line.headcount}</TableCell>
            <TableCell align="right">{formatMoney(line.grossCents)}</TableCell>
            <TableCell align="right">{formatMoney(line.shareCents)}</TableCell>
          </TableRow>
        ))}
        {adjustments.map((adjustment) => (
          <TableRow key={adjustment.registrationId}>
            <TableCell colSpan={4}>
              <Typography variant="body2">
                Refund after payout: {adjustment.className}
                {adjustment.refundedAt &&
                  ` (refunded ${formatSessionDate(adjustment.refundedAt)})`}
              </Typography>
            </TableCell>
            <TableCell align="right">{formatMoney(adjustment.shareCents)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>
            <Typography variant="subtitle2" component="span">
              {totalLabel}
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Typography variant="body2" component="span">
              {formatMoney(grossCents)}
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Typography variant="subtitle1" component="span" sx={{ fontWeight: 700 }}>
              {formatMoney(totalOwedCents)}
            </Typography>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
