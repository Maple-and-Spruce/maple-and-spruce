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
import { useBusinessPaymentConfig } from '@maple/react/data';

/**
 * Settings card to set the business Venmo handle (#631) — rendered as a
 * pay-by-Venmo QR on the teacher My Day page.
 */
export function BusinessVenmoConfigCard() {
  const { configState, saveVenmoHandle } = useBusinessPaymentConfig();
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configState.status === 'success') {
      setHandle(configState.data.venmoHandle ?? '');
      setDirty(false);
    }
  }, [configState]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveVenmoHandle(handle.trim().replace(/^@/, ''));
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
          Business Venmo
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Your studio Venmo username. Teachers can show a scannable QR to it on
          the My Day page so a student can pay by Venmo at their lesson.
        </Typography>

        {configState.status === 'loading' && (
          <Skeleton variant="rectangular" height={56} />
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
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              size="small"
              label="Venmo username"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setDirty(true);
              }}
              helperText="Without the @"
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              onClick={save}
              disabled={!dirty || saving}
              sx={{ mt: 0.5 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
