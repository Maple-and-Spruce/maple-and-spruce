'use client';

/**
 * The Hope submission queue (#799).
 *
 * Answers one question on one screen: **what have we taught a Hope student and
 * not yet been paid for?** Before this, that lived only in the EMA portal and in
 * Katie's memory, and a missed submission had no unpaid state to chase.
 *
 * Selection is bulk because submitting is bulk — Katie works a term at a time,
 * not a lesson at a time.
 *
 * A no-show can never appear here: the server filters on `isSubmittableToHope`
 * and re-checks it on write, so this component never has to remember to.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type {
  HopeQueueEntry,
  HopeQueueTotals,
  HopeSubmissionStatus,
} from '@maple/ts/domain';
import { isAwaitingHopeSubmission } from '@maple/ts/domain';
import { formatCents } from './hope-rates';

export interface HopeQueueProps {
  entries: HopeQueueEntry[];
  totals: HopeQueueTotals;
  /** Lesson ids currently being written. */
  recording?: Set<string>;
  onRecord: (lessonIds: string[], status: HopeSubmissionStatus) => void;
}

function claimStatusChip(entry: HopeQueueEntry) {
  const status = entry.submission?.status;
  if (status === 'paid') {
    return <Chip size="small" color="success" label="Paid" />;
  }
  if (status === 'submitted') {
    return <Chip size="small" color="info" variant="outlined" label="Submitted" />;
  }
  if (status === 'rejected') {
    return <Chip size="small" color="error" label="Rejected" />;
  }
  return <Chip size="small" color="warning" label="Not submitted" />;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Totals({ totals }: { totals: HopeQueueTotals }) {
  return (
    <Stack
      direction="row"
      spacing={3}
      sx={{ flexWrap: 'wrap', gap: 2, mb: 2 }}
      divider={<Divider orientation="vertical" flexItem />}
    >
      <Box>
        <Typography variant="overline" color="text.secondary" display="block">
          Taught, not yet paid
        </Typography>
        <Typography variant="h5">
          {formatCents(totals.awaitingCents)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totals.awaitingCount} lesson{totals.awaitingCount === 1 ? '' : 's'}
          {totals.rejectedCount > 0 &&
            ` · ${totals.rejectedCount} rejected`}
        </Typography>
      </Box>
      <Box>
        <Typography variant="overline" color="text.secondary" display="block">
          Submitted to EMA
        </Typography>
        <Typography variant="h5">
          {formatCents(totals.submittedCents)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {totals.submittedCount} awaiting payment
        </Typography>
      </Box>
      <Box>
        <Typography variant="overline" color="text.secondary" display="block">
          Paid
        </Typography>
        <Typography variant="h5">{formatCents(totals.paidCents)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {totals.paidCount} lesson{totals.paidCount === 1 ? '' : 's'}
        </Typography>
      </Box>
    </Stack>
  );
}

export function HopeQueue({
  entries,
  totals,
  recording = new Set(),
  onRecord,
}: HopeQueueProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const awaiting = useMemo(
    () => entries.filter(isAwaitingHopeSubmission),
    [entries]
  );

  const toggle = (lessonId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });

  const selectedIds = [...selected];
  const busy = recording.size > 0;

  const record = (status: HopeSubmissionStatus) => {
    onRecord(selectedIds, status);
    setSelected(new Set());
  };

  if (entries.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No rendered lessons for Hope Scholarship students yet.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Totals totals={totals} />

      {totals.rejectedCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {totals.rejectedCount} claim
          {totals.rejectedCount === 1 ? ' was' : 's were'} rejected by EMA and
          still need resubmitting. The studio taught these and has not been paid.
        </Alert>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}
        alignItems="center"
      >
        <Button
          size="small"
          variant="outlined"
          disabled={awaiting.length === 0 || busy}
          onClick={() =>
            setSelected(new Set(awaiting.map((e) => e.lesson.id)))
          }
        >
          Select all not submitted ({awaiting.length})
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={selectedIds.length === 0 || busy}
          startIcon={
            busy ? <CircularProgress size={16} color="inherit" /> : null
          }
          onClick={() => record('submitted')}
        >
          {busy
            ? 'Saving…'
            : `Mark ${selectedIds.length || ''} submitted`.trim()}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="success"
          disabled={selectedIds.length === 0 || busy}
          onClick={() => record('paid')}
        >
          Mark paid
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          disabled={selectedIds.length === 0 || busy}
          onClick={() => record('rejected')}
        >
          Mark rejected
        </Button>
      </Stack>

      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>Student</TableCell>
              <TableCell>Lesson</TableCell>
              <TableCell align="right">Rate</TableCell>
              <TableCell>Claim</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => {
              const id = entry.lesson.id;
              const isRecording = recording.has(id);
              return (
                <TableRow key={id} hover selected={selected.has(id)}>
                  <TableCell padding="checkbox">
                    {isRecording ? (
                      <CircularProgress size={16} />
                    ) : (
                      <Checkbox
                        size="small"
                        checked={selected.has(id)}
                        onChange={() => toggle(id)}
                        inputProps={{
                          'aria-label': `Select ${entry.studentName} on ${formatDate(entry.lesson.scheduledAt)}`,
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell>{entry.studentName}</TableCell>
                  <TableCell>
                    {formatDate(entry.lesson.scheduledAt)}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {entry.lesson.durationMinutes} min
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {formatCents(entry.submission?.rateCents ?? entry.rateCents)}
                  </TableCell>
                  <TableCell>
                    {claimStatusChip(entry)}
                    {entry.submission?.rejectionReason && (
                      <Typography
                        variant="caption"
                        color="error"
                        display="block"
                      >
                        {entry.submission.rejectionReason}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
