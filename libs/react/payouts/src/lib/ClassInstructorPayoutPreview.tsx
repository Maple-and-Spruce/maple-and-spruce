'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { describeMissingReadiness, type RequestState, errorMessageFor } from '@maple/ts/domain';
import type {
  ClassInstructorPayoutPreview as Preview,
  PreviewClassInstructorPayoutsResponse,
} from '@maple/ts/firebase/api-types';
import { StatementLinesTable } from './StatementLinesTable';
import { formatDay, formatDayRange, formatMoney } from './payout-format';

export interface ClassInstructorPayoutPreviewProps {
  previewState: RequestState<PreviewClassInstructorPayoutsResponse>;
  onGenerate: (instructorId: string) => Promise<void>;
  /** Open the mark-paid dialog for a statement waiting to be paid. */
  onMarkPaid: (statementId: string) => void;
  /** Link to an existing statement. */
  statementHref: (id: string) => string;
}

/** Why Generate is off for this instructor, if it is. */
function blockedReason(preview: Preview): string | undefined {
  if (preview.missingRateConfig) return 'Set a percentage pay rate on this instructor first.';
  if (preview.totalOwedCents <= 0) {
    return 'Refunds cancel out what is owed so far; they carry to the next statement.';
  }
  return undefined;
}

/**
 * A contract instructor who isn't cleared to teach. The pay rate is left out
 * when "Rate not set" already says so. A warning only: Generate is unaffected.
 */
function NotClearedChip({ preview }: { preview: Preview }) {
  const missing = (preview.readinessMissing ?? []).filter(
    (item) => !(item === 'pay-rate' && preview.missingRateConfig)
  );
  if (missing.length === 0) return null;
  const text = describeMissingReadiness(missing);
  return (
    <Tooltip title={`Not cleared to teach: missing ${text}`}>
      <Chip
        size="small"
        icon={<WarningAmberIcon />}
        label="Not cleared"
        color="warning"
        variant="outlined"
        aria-label={`Not cleared to teach: missing ${text}`}
      />
    </Tooltip>
  );
}

function LoadingSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-label="Loading payouts">
      {[1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={160} />
      ))}
    </Stack>
  );
}

function PendingStatements({
  preview,
  onMarkPaid,
  statementHref,
}: {
  preview: Preview;
  onMarkPaid: (statementId: string) => void;
  statementHref: (id: string) => string;
}) {
  if (preview.pendingStatements.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" component="h4" sx={{ mb: 0.5 }}>
        Waiting to be marked paid
      </Typography>
      <Stack spacing={0.5} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {preview.pendingStatements.map((statement) => (
          <Stack
            key={statement.id}
            component="li"
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center' }}
          >
            <Link href={statementHref(statement.id)} sx={{ flex: 1 }}>
              {statement.coversFrom && statement.coversTo
                ? `Classes held ${formatDayRange(statement.coversFrom, statement.coversTo)}`
                : 'Statement'}
              : {formatMoney(statement.totalOwedCents)}
            </Link>
            <Button size="small" variant="outlined" onClick={() => onMarkPaid(statement.id)}>
              Mark paid
            </Button>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

function PreviewCard({
  preview,
  onGenerate,
  onMarkPaid,
  statementHref,
}: {
  preview: Preview;
  onGenerate: (instructorId: string) => Promise<void>;
  onMarkPaid: (statementId: string) => void;
  statementHref: (id: string) => string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasUnclaimed = preview.classes.length > 0 || preview.adjustments.length > 0;
  const reason = hasUnclaimed ? blockedReason(preview) : undefined;

  const generate = async () => {
    // Synchronous guard: a double click must not ask for two statements.
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      await onGenerate(preview.instructorId);
    } catch (e) {
      setError(errorMessageFor(e, 'Failed to generate statement'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card variant="outlined" component="section" aria-label={preview.instructorName}>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { sm: 'center' }, mb: 1 }}
        >
          <Typography variant="h6" component="h3" sx={{ flex: 1 }}>
            {preview.instructorName}
          </Typography>
          {preview.missingRateConfig && (
            <Chip size="small" icon={<WarningAmberIcon />} label="Rate not set" color="warning" variant="outlined" />
          )}
          <NotClearedChip preview={preview} />
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
              Owed {formatMoney(preview.owedCents)}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Paid this year {formatMoney(preview.paidThisYearCents)}
            </Typography>
          </Box>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        <PendingStatements preview={preview} onMarkPaid={onMarkPaid} statementHref={statementHref} />

        {hasUnclaimed ? (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'center' }, mb: 0.5 }}
            >
              <Typography variant="subtitle2" component="h4" sx={{ flex: 1 }}>
                Taught and not on a statement yet
              </Typography>
              <Button variant="contained" onClick={generate} disabled={Boolean(reason) || generating}>
                {generating
                  ? 'Generating…'
                  : `Generate statement (${formatMoney(preview.totalOwedCents)})`}
              </Button>
            </Stack>
            {reason && (
              <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                {reason}
              </Typography>
            )}
            <StatementLinesTable
              classes={preview.classes}
              adjustments={preview.adjustments}
              payRate={preview.payRate}
              grossCents={preview.grossCents}
              totalOwedCents={preview.totalOwedCents}
              totalLabel="Not yet on a statement"
            />
          </>
        ) : (
          <Typography variant="body2" color="textSecondary">
            {preview.pendingStatements.length > 0
              ? 'Every finished class is on a statement.'
              : 'Nothing owed. Every finished class has been paid.'}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Where each instructor stands: what they are owed and not yet paid, the
 * statements waiting to be marked paid, and the finished sessions that are
 * not on a statement yet, with a Generate button per instructor.
 */
export function ClassInstructorPayoutPreview({
  previewState,
  onGenerate,
  onMarkPaid,
  statementHref,
}: ClassInstructorPayoutPreviewProps) {
  if (previewState.status === 'idle' || previewState.status === 'loading') {
    return <LoadingSkeleton />;
  }
  if (previewState.status === 'error') {
    return <Alert severity="error">Failed to load class payouts: {previewState.error}</Alert>;
  }

  const { previews, throughDate } = previewState.data;
  if (previews.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography variant="body1">No class sessions to pay yet.</Typography>
        <Typography variant="body2">
          Instructors are paid for sessions that have ended, in classes with an instructor set.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {throughDate && (
        <Alert severity="info">
          Showing classes held through {formatDay(throughDate)}. Later classes are left for another
          statement.
        </Alert>
      )}
      {previews.map((preview) => (
        <PreviewCard
          key={preview.instructorId}
          preview={preview}
          onGenerate={onGenerate}
          onMarkPaid={onMarkPaid}
          statementHref={statementHref}
        />
      ))}
    </Stack>
  );
}
