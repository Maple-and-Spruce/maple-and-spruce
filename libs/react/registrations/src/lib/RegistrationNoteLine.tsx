'use client';

import { Box, Typography } from '@mui/material';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';

/** A customer's note, trimmed, or undefined when there is none worth showing. */
export function registrationNoteText(notes: string | undefined | null): string | undefined {
  const text = notes?.trim();
  return text ? text : undefined;
}

export interface RegistrationNoteLineProps {
  notes: string | undefined | null;
}

/**
 * The customer's note under their name on a roster row, so it is read
 * without opening the registration. Clipped to two lines; the detail dialog
 * has the full text.
 */
export function RegistrationNoteLine({ notes }: RegistrationNoteLineProps) {
  const text = registrationNoteText(notes);
  if (!text) return null;
  return (
    <Box
      role="note"
      aria-label={`Customer note: ${text}`}
      title={text}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mt: 0.5, maxWidth: 360 }}
    >
      <StickyNote2OutlinedIcon
        aria-hidden
        sx={{ fontSize: 16, mt: '2px', color: 'warning.main', flexShrink: 0 }}
      />
      <Typography
        variant="caption"
        sx={{
          color: 'text.primary',
          fontStyle: 'italic',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
