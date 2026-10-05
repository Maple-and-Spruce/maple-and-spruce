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
 * Settings card for the studio default private-pay lesson rates by length
 * (legacy #629). The fallback behind each teacher's per-instrument rates
 * (`Instructor.lessonRates`); per-student overrides live on the student record.
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
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          The studio default per-lesson price by length. Each teacher&apos;s
          own rates, set per instrument on the Instructors page, come first;
          this fills in any lesson a teacher has not priced. A student&apos;s
          own rate overrides both.
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
