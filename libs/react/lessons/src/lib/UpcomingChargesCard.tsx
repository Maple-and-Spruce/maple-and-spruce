'use client';

/**
 * UpcomingChargesCard (#798) — what the billing job is about to take, and the
 * means to stop it.
 *
 * The job plans a charge and then takes it, both unattended. So the only thing
 * between a wrong rule and a wrong charge is that somebody saw it coming. This
 * is that screen, and it exists **before** any UI that creates a billing rule,
 * on purpose: it must never be possible to start charging without being able
 * to look at what will be charged.
 *
 * Two stop actions, kept separate because they are different facts:
 *   Cancel — the teaching is not going to happen.
 *   Waive  — it happened and the studio is not charging for it.
 *
 * A waiver takes a reason, so a comped block is still legible months later.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { LessonScheduledCharge } from '@maple/ts/domain';
import {
  canStopCharge,
  chargeStatusDetail,
  groupLessonCharges,
  shortChargeStatus,
  totalCents,
} from '@maple/ts/domain';

export interface UpcomingChargesCardProps {
  charges: LessonScheduledCharge[];
  /** Student id -> display name. */
  studentNames?: Record<string, string>;
  /** Hide the student column when the card sits on one student's page. */
  hideStudent?: boolean;
  isLoading?: boolean;
  pendingId?: string | null;
  error?: string | null;
  /** Reference point for "due"; injectable so stories are deterministic. */
  now?: Date;
  onCancel: (chargeId: string) => void;
  onWaive: (chargeId: string, reason: string) => void;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function dueLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function UpcomingChargesCard({
  charges,
  studentNames = {},
  hideStudent = false,
  isLoading = false,
  pendingId = null,
  error = null,
  now,
  onCancel,
  onWaive,
}: UpcomingChargesCardProps) {
  const [waiving, setWaiving] = useState<LessonScheduledCharge | null>(null);
  const [reason, setReason] = useState('');

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Skeleton variant="text" width={220} />
        <Skeleton variant="rectangular" height={64} sx={{ mt: 1 }} />
      </Paper>
    );
  }

  const groups = groupLessonCharges(charges, now ?? new Date());
  const nothing =
    groups.failed.length === 0 &&
    groups.dueNow.length === 0 &&
    groups.upcoming.length === 0;

  const row = (charge: LessonScheduledCharge, tone?: 'error' | 'warning') => (
    <Paper
      key={charge.id}
      variant="outlined"
      sx={{
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        ...(tone ? { borderColor: `${tone}.main` } : {}),
      }}
    >
      <Typography
        sx={{ minWidth: 90, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {money(charge.amountCents)}
      </Typography>

      <Box sx={{ flexGrow: 1, minWidth: 180 }}>
        {!hideStudent && (
          <Typography sx={{ fontWeight: 600 }}>
            {studentNames[charge.studentId] ?? charge.studentId}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          {charge.lessonIds.length} lesson
          {charge.lessonIds.length === 1 ? '' : 's'} · due{' '}
          {dueLabel(charge.dueAt)}
        </Typography>
        {chargeStatusDetail(charge) && (
          <Typography variant="body2" color="text.secondary">
            {chargeStatusDetail(charge)}
          </Typography>
        )}
      </Box>

      {canStopCharge(charge) ? (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            disabled={pendingId === charge.id}
            onClick={() => {
              setReason('');
              setWaiving(charge);
            }}
          >
            Waive
          </Button>
          <Button
            size="small"
            color="inherit"
            disabled={pendingId === charge.id}
            onClick={() => onCancel(charge.id)}
          >
            Cancel
          </Button>
        </Stack>
      ) : (
        <Chip size="small" label={shortChargeStatus(charge)} />
      )}
    </Paper>
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        Automatic charges
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {nothing && (
        <Typography variant="body2" color="text.secondary">
          Nothing is scheduled to be charged. Lessons are only charged
          automatically once a student is on a billing rule and has a card on
          file.
        </Typography>
      )}

      <Stack spacing={2}>
        {groups.failed.length > 0 && (
          <Box>
            <Alert severity="error" sx={{ mb: 1 }}>
              {groups.failed.length} charge
              {groups.failed.length === 1 ? '' : 's'} failed, totalling{' '}
              {money(totalCents(groups.failed))}. Nothing retries on its own —
              these need chasing by hand.
            </Alert>
            <Stack spacing={1}>
              {groups.failed.map((c) => row(c, 'error'))}
            </Stack>
          </Box>
        )}

        {groups.dueNow.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Due now — {money(totalCents(groups.dueNow))}
            </Typography>
            <Stack spacing={1}>
              {groups.dueNow.map((c) => row(c, 'warning'))}
            </Stack>
          </Box>
        )}

        {groups.upcoming.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Upcoming — {money(totalCents(groups.upcoming))}
            </Typography>
            <Stack spacing={1}>{groups.upcoming.map((c) => row(c))}</Stack>
          </Box>
        )}

        {groups.settled.length > 0 && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Settled
            </Typography>
            <Stack spacing={1}>
              {groups.settled.slice(0, 10).map((c) => row(c))}
            </Stack>
          </Box>
        )}
      </Stack>

      <Dialog open={!!waiving} onClose={() => setWaiving(null)} fullWidth maxWidth="sm">
        <DialogTitle>Waive this charge</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The lessons stay on the books and nothing is charged for them. Say
            why, so the comped block still makes sense later.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Makeup for a lesson we cancelled"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaiving(null)}>Back</Button>
          <Button
            variant="contained"
            disabled={!reason.trim()}
            onClick={() => {
              if (waiving) onWaive(waiving.id, reason.trim());
              setWaiving(null);
            }}
          >
            Waive {waiving ? money(waiving.amountCents) : ''}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
