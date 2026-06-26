'use client';

import { Box, Typography } from '@mui/material';
import { RoomScheduleAgenda } from '@maple/react/rooms';

export default function RoomSchedulePage() {
  return (
    <Box sx={{ maxWidth: 720 }}>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>
        Spruce Room Schedule
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Every upcoming use of the Spruce Room — lessons, classes, and ad hoc
        bookings — so you can see when it&apos;s free to plan your own. Pick a
        time range below.
      </Typography>

      <RoomScheduleAgenda room="spruce" bookHref="/book-room" />
    </Box>
  );
}
