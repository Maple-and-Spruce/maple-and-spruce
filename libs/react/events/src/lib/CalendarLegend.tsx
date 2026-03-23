'use client';

import { Box, Typography } from '@mui/material';
import { getCalendarFeedSources } from './calendar-feed-config';

export function CalendarLegend() {
  const feeds = getCalendarFeedSources();

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: { xs: 1.5, sm: 2 },
        justifyContent: 'center',
      }}
    >
      {feeds
        .filter((f) => !f.background)
        .map((feed) => (
          <Box
            key={feed.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '2px',
                backgroundColor: feed.color,
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {feed.label}
            </Typography>
          </Box>
        ))}
      {feeds
        .filter((f) => f.background)
        .map((feed) => (
          <Box
            key={feed.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '2px',
                backgroundColor: feed.color,
                opacity: 0.3,
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {feed.label}
            </Typography>
          </Box>
        ))}
    </Box>
  );
}
