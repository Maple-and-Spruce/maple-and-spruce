'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { LESSON_LENGTHS } from '@maple/ts/domain';
import type { LessonRateByLength } from '@maple/ts/domain';
import { LESSON_LENGTH_LABELS } from '@maple/react/students';
import { useLessonRatesConfig } from '@maple/react/data';

/**
 * Settings card to manage the default private-pay lesson rates by length
 * (#629). Used to auto-invoice a rendered lesson; per-student overrides live
 * on the student record. A blank tier means that length is never
 * auto-invoiced by default.
 */
export function LessonRatesConfigCard() {
  const { configState, saveConfig } = useLessonRatesConfig();
  const [dollars, setDollars] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configState.status === 'success') {
      const next: Record<string, string> = {};
      for (const len of LESSON_LENGTHS) {
        const cents = configState.data.rateByLength[len];
        next[len] = cents != null ? (cents / 100).toString() : '';
      }
      setDollars(next);
      setDirty(false);
    }
  }, [configState]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const rateByLength: LessonRateByLength = {};
      for (const len of LESSON_LENGTHS) {
        const v = dollars[len]?.trim();
        if (v) {
          const cents = Math.round(parseFloat(v) * 100);
          if (cents > 0) rateByLength[len] = cents;
        }
      }
      await saveConfig(rateByLength);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Lesson Rates (private-pay)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Default per-lesson price by length. Used to auto-invoice a lesson when
          it’s marked rendered; a student’s own rate (on their record) overrides
          this. Leave a length blank to not auto-invoice it by default.
        </Typography>

        {configState.status === 'loading' && (
          <Skeleton variant="rectangular" height={160} />
        )}
        {configState.status === 'error' && (
          <Alert severity="error">Failed to load: {configState.error}</Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {configState.status === 'success' && (
          <Stack spacing={2}>
            {LESSON_LENGTHS.map((len) => (
              <TextField
                key={len}
                label={`${LESSON_LENGTH_LABELS[len]} ($)`}
                type="number"
                size="small"
                value={dollars[len] ?? ''}
                onChange={(e) => {
                  setDollars((prev) => ({ ...prev, [len]: e.target.value }));
                  setDirty(true);
                }}
              />
            ))}
            <Button
              variant="contained"
              onClick={save}
              disabled={!dirty || saving}
              sx={{ alignSelf: 'flex-start' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
