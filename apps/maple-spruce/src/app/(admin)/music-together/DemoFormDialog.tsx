'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Stack,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  MT_CLASS_DURATION_MINUTES,
  type MusicTogetherDemo,
  type CreateMusicTogetherDemoInput,
} from '@maple/ts/domain';

const DEFAULT_CAPACITY_FAMILIES = 8;

/** Date <-> <input type="datetime-local"> string (local time). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function fromLocalInput(value: string): Date {
  return new Date(value);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateMusicTogetherDemoInput) => Promise<void>;
  demo?: MusicTogetherDemo;
  isSubmitting: boolean;
}

export function DemoFormDialog({
  open,
  onClose,
  onSubmit,
  demo,
  isSubmitting,
}: Props) {
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(String(DEFAULT_CAPACITY_FAMILIES));
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever it opens (edit) or resets (create).
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (demo) {
      setDateTime(toLocalInput(new Date(demo.dateTime)));
      setLocation(demo.location);
      setCapacity(String(demo.capacityFamilies));
      setDuration(demo.durationMinutes ? String(demo.durationMinutes) : '');
      setNotes(demo.notes ?? '');
      setVisible(demo.visible);
    } else {
      setDateTime('');
      setLocation('');
      setCapacity(String(DEFAULT_CAPACITY_FAMILIES));
      setDuration('');
      setNotes('');
      setVisible(false);
    }
  }, [open, demo]);

  const handleSubmit = async () => {
    setError(null);
    try {
      const input: CreateMusicTogetherDemoInput = {
        dateTime: fromLocalInput(dateTime),
        location: location.trim(),
        capacityFamilies: parseInt(capacity, 10),
        durationMinutes: duration ? parseInt(duration, 10) : undefined,
        notes: notes.trim() || undefined,
        visible,
      };
      await onSubmit(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save demo');
    }
  };

  const canSave = !!dateTime && !!location.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{demo ? 'Edit Demo Class' : 'New Demo Class'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Date & time"
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            inputProps={{ 'aria-label': 'Demo date and time' }}
          />
          <TextField
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
            fullWidth
            helperText="Often offsite — e.g. a public library. Shown to families and on the calendar."
            inputProps={{ 'aria-label': 'Location' }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Capacity (families)"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              sx={{ flex: 1 }}
              inputProps={{ 'aria-label': 'Capacity families', min: 1 }}
            />
            <TextField
              label="Duration (minutes)"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              sx={{ flex: 1 }}
              placeholder={String(MT_CLASS_DURATION_MINUTES)}
              helperText={`Defaults to ${MT_CLASS_DURATION_MINUTES}`}
              inputProps={{ 'aria-label': 'Duration minutes', min: 1 }}
            />
          </Box>
          <TextField
            label="Notes (internal)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
          />
          <FormControlLabel
            control={
              <Switch
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                slotProps={{ input: { 'aria-label': 'Visible to families' } }}
              />
            }
            label="Show on the demo RSVP widget &amp; public calendar"
          />
          {error && <Typography color="error">{error}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSave}
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
