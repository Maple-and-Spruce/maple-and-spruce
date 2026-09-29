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
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { RequestState } from '@maple/ts/domain';
import type {
  ClassInstructorPayoutPreview as Preview,
  PreviewClassInstructorPayoutsResponse,
} from '@maple/ts/firebase/api-types';
import { StatementLinesTable } from './StatementLinesTable';
import { formatMoney } from './payout-format';

export interface ClassInstructorPayoutPreviewProps {
  previewState: RequestState<PreviewClassInstructorPayoutsResponse>;
  onGenerate: (instructorId: string) => Promise<void>;
  /** Link to an existing statement. */
  statementHref: (id: string) => string;
}

/** Why Generate is off for this instructor, if it is. */
function blockedReason(preview: Preview, monthIsOver: boolean): string | undefined {
  if (preview.existingStatement) return undefined;
  if (!monthIsOver) return 'The month isn\'t over yet.';
  if (preview.missingRateConfig) return 'Set a percentage pay rate on this instructor first.';
  if (preview.totalOwedCents <= 0) return 'Refunds cancel out this month; they carry to the next statement.';
  return undefined;
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

function PreviewCard({
  preview,
  monthIsOver,
  onGenerate,
  statementHref,
}: {
  preview: Preview;
  monthIsOver: boolean;
  onGenerate: (instructorId: string) => Promise<void>;
  statementHref: (id: string) => string;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reason = blockedReason(preview, monthIsOver);
  const hasUnclaimed = preview.classes.length > 0 || preview.adjustments.length > 0;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await onGenerate(preview.instructorId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate statement');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ sm: 'center' }}
          sx={{ mb: 1 }}
        >
          <Typography variant="h6" component="h3" sx={{ flex: 1 }}>
            {preview.instructorName}
          </Typography>
          {preview.missingRateConfig && (
            <Chip size="small" icon={<WarningAmberIcon />} label="Rate not set" color="warning" variant="outlined" />
          )}
          {preview.existingStatement ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                size="small"
                label={`Statement ${preview.existingStatement.status}`}
                color={preview.existingStatement.status === 'paid' ? 'success' : 'default'}
              />
              <Link href={statementHref(preview.existingStatement.id)}>
                {formatMoney(preview.existingStatement.totalOwedCents)} — view statement
              </Link>
            </Stack>
          ) : (
            <Button
              variant="contained"
              onClick={generate}
              disabled={Boolean(reason) || generating}
            >
              {generating ? 'Generating…' : `Generate statement (${formatMoney(preview.totalOwedCents)})`}
            </Button>
          )}
        </Stack>

        {reason && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {reason}
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {hasUnclaimed ? (
          <StatementLinesTable
            classes={preview.classes}
            adjustments={preview.adjustments}
            payRate={preview.payRate}
            grossCents={preview.grossCents}
            totalOwedCents={preview.totalOwedCents}
            totalLabel={preview.existingStatement ? 'Not yet on a statement' : 'Total owed'}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Everything this month is on the statement.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What each instructor is owed for the month and hasn't been put on a
 * statement yet, with a Generate button per instructor.
 */
export function ClassInstructorPayoutPreview({
  previewState,
  onGenerate,
  statementHref,
}: ClassInstructorPayoutPreviewProps) {
  if (previewState.status === 'idle' || previewState.status === 'loading') {
    return <LoadingSkeleton />;
  }
  if (previewState.status === 'error') {
    return <Alert severity="error">Failed to load class payouts: {previewState.error}</Alert>;
  }

  const { previews, monthIsOver } = previewState.data;
  if (previews.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        <Typography variant="body1">No class sessions to pay for this month.</Typography>
        <Typography variant="body2">
          Instructors are paid for sessions that have ended, in classes with an instructor set.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {!monthIsOver && (
        <Alert severity="info">
          This month isn&apos;t over yet. The figures so far are shown; statements can be generated
          once it ends.
        </Alert>
      )}
      {previews.map((preview) => (
        <PreviewCard
          key={preview.instructorId}
          preview={preview}
          monthIsOver={monthIsOver}
          onGenerate={onGenerate}
          statementHref={statementHref}
        />
      ))}
    </Stack>
  );
}
