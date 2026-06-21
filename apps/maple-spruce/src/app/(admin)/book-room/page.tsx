'use client';

import { useState, useCallback } from 'react';
import { Alert, Box, Snackbar, Typography } from '@mui/material';
import type { CreateCalendarEventInput } from '@maple/ts/domain';
import { BookSpruceRoomForm } from '@maple/react/events';
import { useCalendarEvents } from '../../../hooks';

export default function BookRoomPage() {
  const { createCalendarEvent } = useCalendarEvents();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (data: CreateCalendarEventInput) => {
      setIsSubmitting(true);
      try {
        await createCalendarEvent(data);
        setSuccessMessage(`Booked the Spruce Room: ${data.title}`);
      } finally {
        setIsSubmitting(false);
      }
    },
    [createCalendarEvent]
  );

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        Book the Spruce Room
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Reserve the room for Music Together, a private rental, or any one-off
        use. Booked time blocks the Spruce Room across the portal.
      </Typography>

      <BookSpruceRoomForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />

      <Snackbar
        open={!!successMessage}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
