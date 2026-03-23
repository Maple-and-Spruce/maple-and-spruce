'use client';

import { Box, Container, Typography } from '@mui/material';
import {
  PublicCalendar,
  CalendarLegend,
  CalendarSubscribe,
} from '@maple/react/events';

export default function CalendarPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Calendar
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            Maple & Spruce Folk Arts Collective
          </Typography>
          <CalendarLegend />
        </Box>

        {/* Calendar */}
        <Box sx={{ mb: 4 }}>
          <PublicCalendar />
        </Box>

        {/* Subscribe Section */}
        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
          <CalendarSubscribe />
        </Box>
      </Container>
    </Box>
  );
}
