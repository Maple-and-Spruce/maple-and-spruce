'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  Link as MuiLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type {
  PosLessonAttribution,
  PosLessonAttributionStatus,
  RequestState,
  Student,
} from '@maple/ts/domain';
import { formatCents } from '@maple/react/lessons';

interface PosLessonAttributionTableProps {
  attributionsState: RequestState<PosLessonAttribution[]>;
  studentsById: Map<string, Student>;
  onReview: (attribution: PosLessonAttribution) => void;
  /** Pre-filtered list (by the page's active tab). */
  filteredAttributions?: PosLessonAttribution[];
}

const statusColor: Record<
  PosLessonAttributionStatus,
  'warning' | 'success' | 'default'
> = {
  pending: 'warning',
  attributed: 'success',
  dismissed: 'default',
};

function formatDate(value: Date | string | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

export function PosLessonAttributionTable({
  attributionsState,
  studentsById,
  onReview,
  filteredAttributions,
}: PosLessonAttributionTableProps) {
  if (attributionsState.status === 'loading') {
    return (
      <Box>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={44} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }
  if (attributionsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load POS lesson sales: {attributionsState.error}
      </Alert>
    );
  }
  if (attributionsState.status === 'idle') return null;

  const rows = filteredAttributions ?? attributionsState.data;
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No POS lesson sales here.
      </Typography>
    );
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Date</TableCell>
          <TableCell>Item</TableCell>
          <TableCell align="right">Amount</TableCell>
          <TableCell>Paid by</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Student</TableCell>
          <TableCell align="right">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((a) => (
          <TableRow key={a.id}>
            <TableCell>{formatDate(a.occurredAt)}</TableCell>
            <TableCell>{a.itemName}</TableCell>
            <TableCell align="right">{formatCents(a.amountPaidCents)}</TableCell>
            <TableCell>
              {a.customerName || a.customerEmail || '—'}
            </TableCell>
            <TableCell>
              <Chip
                label={a.status}
                size="small"
                color={statusColor[a.status]}
                variant={a.status === 'attributed' ? 'filled' : 'outlined'}
              />
            </TableCell>
            <TableCell>
              {a.studentId ? (
                studentsById.get(a.studentId)?.name ?? a.studentId
              ) : (
                <Typography variant="body2" color="text.secondary">
                  —
                </Typography>
              )}
              {a.invoiceId && a.attributedBy === 'auto' && (
                <Typography variant="caption" color="text.secondary" display="block">
                  auto
                </Typography>
              )}
            </TableCell>
            <TableCell align="right">
              {a.status === 'pending' ? (
                <Button size="small" variant="outlined" onClick={() => onReview(a)}>
                  Review
                </Button>
              ) : a.squareReceiptUrl ? (
                <MuiLink
                  href={a.squareReceiptUrl}
                  target="_blank"
                  rel="noopener"
                  variant="body2"
                >
                  Receipt
                </MuiLink>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
