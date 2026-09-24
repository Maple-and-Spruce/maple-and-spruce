'use client';

/**
 * RunBillingCard (#107) — see what the job would do, then let it.
 *
 * `triggerLessonBilling` existed with a `dryRun` flag and no button, so the only
 * way to find out what a new rule would charge was to wait for 09:00 and read it
 * off the families' cards. That is a bad way to discover an offset typo.
 *
 * **Preview leads.** It writes nothing — no charge documents, no payments — and
 * reports the same counters as a real run, so it is the safe half and gets the
 * prominent button. The real run is behind a confirmation that says plainly that
 * money moves, because it does: the job plans charges and then takes the ones
 * that are due, in one pass.
 *
 * The counters are shown rather than summarised into "it worked". `skippedNoRate`
 * and `planningFailed` are the two that matter most and neither is an error the
 * job can raise — a student with no resolvable rate is silently unbilled, and an
 * unbilled student is how revenue goes missing.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { RunLessonBillingResult } from '@maple/ts/firebase/api-types';

export interface RunBillingCardProps {
  /** `preview-run` or `billing-run` while one is in flight. */
  pendingId?: string | null;
  error?: string | null;
  /** Nothing to bill from yet, so both buttons would be theatre. */
  hasRules?: boolean;
  onRun: (opts: { dryRun: boolean }) => Promise<RunLessonBillingResult | null>;
}

/** The counters, in the order someone reading them cares about. */
const READOUT: Array<{ key: keyof RunLessonBillingResult; label: string; warn?: boolean }> = [
  { key: 'studentsConsidered', label: 'Students considered' },
  { key: 'chargesPlanned', label: 'Charges planned' },
  { key: 'chargesAlreadyPlanned', label: 'Already planned' },
  { key: 'charged', label: 'Charged' },
  { key: 'lessonsAlreadyCovered', label: 'Lessons already covered' },
  { key: 'skippedNoCard', label: 'Skipped, no card', warn: true },
  { key: 'skippedNoRate', label: 'Skipped, no rate', warn: true },
  { key: 'chargeFailed', label: 'Charges failed', warn: true },
  { key: 'planningFailed', label: 'Planning failed', warn: true },
];

export function RunBillingCard({
  pendingId = null,
  error = null,
  hasRules = true,
  onRun,
}: RunBillingCardProps) {
  const [result, setResult] = useState<RunLessonBillingResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  const busy = pendingId === 'preview-run' || pendingId === 'billing-run';

  const run = async (dryRun: boolean) => {
    setResult(null);
    const outcome = await onRun({ dryRun });
    if (outcome) setResult(outcome);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <PlayArrowIcon fontSize="small" color="action" />
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Run the billing job
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The job runs itself each morning. Preview reports exactly what it would
        do and writes nothing, which is how to check a new rule without finding
        out by charging somebody.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!hasRules && (
        <Alert severity="info" sx={{ mb: 2 }}>
          There are no rules yet, so a run would consider nobody.
        </Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          variant="contained"
          disabled={busy || !hasRules}
          onClick={() => run(true)}
        >
          {pendingId === 'preview-run' ? 'Previewing…' : 'Preview'}
        </Button>
        <Button
          color="inherit"
          disabled={busy || !hasRules}
          onClick={() => setConfirming(true)}
        >
          Run it now
        </Button>
      </Stack>

      {result && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {result.dryRun ? 'What a run would do' : 'What the run did'}
          </Typography>
          <Stack spacing={0.25}>
            {READOUT.map(({ key, label, warn }) => {
              const value = result[key] as number;
              return (
                <Stack key={key} direction="row" spacing={1}>
                  <Typography
                    variant="body2"
                    sx={{ minWidth: 200 }}
                    color="text.secondary"
                  >
                    {label}
                  </Typography>
                  <Typography
                    variant="body2"
                    color={warn && value > 0 ? 'error.main' : 'text.primary'}
                    sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                  >
                    {value}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
          {result.skippedNoRate > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              {result.skippedNoRate} charge
              {result.skippedNoRate === 1 ? '' : 's'} priced at nothing and were
              skipped — those students have no rate set, so nobody is billing
              them. Set a rate on the student, or a flat amount on the rule.
            </Alert>
          )}
          {result.planningFailed > 0 && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {result.planningFailed} student
              {result.planningFailed === 1 ? '' : 's'} could not be planned. The
              rest of the run went ahead; the reason is in the function logs.
            </Alert>
          )}
        </Box>
      )}

      <Dialog open={confirming} onClose={() => setConfirming(false)} fullWidth maxWidth="sm">
        <DialogTitle>Run the billing job now?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This plans charges from the rules and then takes every charge that is
            already due, in one pass.
          </Typography>
          <Alert severity="warning">
            Cards will be charged. There is no undo — a charge taken by mistake
            has to be refunded by hand in Square. Preview first if you are not
            sure.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Back</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              run(false);
            }}
          >
            Run it now
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
