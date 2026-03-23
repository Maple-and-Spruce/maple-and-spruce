'use client';

import { useState, useCallback } from 'react';
import {
  Typography,
  IconButton,
  Tooltip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { getCalendarFeedSources } from './calendar-feed-config';

export function CalendarSubscribe() {
  const feeds = getCalendarFeedSources();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback((id: string, url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Subscribe to Our Calendar
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Copy a feed URL below and add it to Google Calendar, Apple Calendar, or
        Outlook via &quot;Subscribe by URL&quot;.
      </Typography>
      <List dense disablePadding>
        {feeds.map((feed) => (
          <ListItem key={feed.id} disableGutters sx={{ pr: 5 }}>
            <ListItemText
              primary={feed.label}
              secondary={feed.url}
              secondaryTypographyProps={{
                sx: {
                  fontSize: '0.75rem',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                },
              }}
            />
            <ListItemSecondaryAction>
              <Tooltip title={copiedId === feed.id ? 'Copied!' : 'Copy URL'}>
                <IconButton
                  size="small"
                  onClick={() => handleCopy(feed.id, feed.url)}
                  color={copiedId === feed.id ? 'success' : 'default'}
                >
                  {copiedId === feed.id ? (
                    <CheckIcon fontSize="small" />
                  ) : (
                    <ContentCopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
      </List>
    </Paper>
  );
}
