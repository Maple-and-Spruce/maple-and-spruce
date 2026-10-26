'use client';

/**
 * HourWaitlistForm - join the waitlist for one booked private hour. Shown
 * under the time picker when a booked hour is picked. If the group holding
 * it cancels, everyone waiting on the hour is emailed and the first to book
 * gets it.
 */
import { Alert, Box, Button, TextField, Typography } from '@mui/material';

export type HourWaitlistStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'joined'; already: boolean }
  | { kind: 'error'; message: string };

interface HourWaitlistFormProps {
  dayLabel: string;
  hourLabel: string;
  email: string;
  onEmailChange: (email: string) => void;
  status: HourWaitlistStatus;
  onJoin: () => void;
}

export function HourWaitlistForm({
  dayLabel,
  hourLabel,
  email,
  onEmailChange,
  status,
  onJoin,
}: HourWaitlistFormProps) {
  const when = `${dayLabel}, ${hourLabel}`;

  if (status.kind === 'joined') {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        {status.already
          ? `You're already on the waitlist for ${when}.`
          : `You're on the waitlist for ${when}. We'll email you if it opens up.`}
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Typography variant="body2">
        {when} is booked. Leave your email and we&apos;ll let you know if it opens
        up. Nothing is charged.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          label="Email Address"
          type="email"
          size="small"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          sx={{ flex: '1 1 220px' }}
        />
        <Button
          variant="outlined"
          onClick={onJoin}
          disabled={status.kind === 'sending'}
        >
          {status.kind === 'sending' ? 'Joining…' : 'Join waitlist'}
        </Button>
      </Box>
      {status.kind === 'error' && (
        <Typography variant="caption" color="error">
          {status.message}
        </Typography>
      )}
    </Box>
  );
}
