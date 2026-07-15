'use client';

import { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { fonts } from '@maple/react/theme';
import {
  type CalendarFeed,
  type CalendarFeedAudience,
  httpsUrl,
  webcalUrl,
} from './calendar-feeds';

export interface CalendarFeedListProps {
  /** Feeds to display, in order. Grouped internally by audience. */
  feeds: readonly CalendarFeed[];
}

const GROUPS: readonly {
  audience: CalendarFeedAudience;
  title: string;
  caption: string;
}[] = [
  {
    audience: 'public',
    title: 'Public & customer feeds',
    caption: 'Safe to share with customers on the website, in emails, or on socials.',
  },
  {
    audience: 'internal',
    title: 'Internal feeds',
    caption: 'Staff-only. Do not publish these links to customers.',
  },
];

async function copyText(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  // Fallback for environments without the async Clipboard API.
  const el = document.createElement('textarea');
  el.value = value;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function CopyButton({
  label,
  value,
  onCopied,
}: {
  label: string;
  value: string;
  onCopied: (message: string) => void;
}): React.ReactNode {
  const handleClick = useCallback(async () => {
    try {
      await copyText(value);
      onCopied(`Copied ${label}`);
    } catch {
      onCopied('Copy failed — select and copy the link manually');
    }
  }, [label, value, onCopied]);

  return (
    <Tooltip title={`Copy ${label}`}>
      <IconButton
        aria-label={`Copy ${label}`}
        size="small"
        color="primary"
        onClick={handleClick}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

function LinkValue({ url }: { url: string }): React.ReactNode {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: fonts.mono,
        fontSize: '0.8rem',
        color: 'text.secondary',
        wordBreak: 'break-all',
      }}
    >
      {url}
    </Typography>
  );
}

function CalendarFeedRow({
  feed,
  onCopied,
}: {
  feed: CalendarFeed;
  onCopied: (message: string) => void;
}): React.ReactNode {
  const https = httpsUrl(feed);
  const webcal = feed.kind === 'subscribe' ? webcalUrl(feed) : null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {feed.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {feed.description}
      </Typography>

      <Stack spacing={1}>
        {webcal && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Chip
              label="Subscribe"
              size="small"
              color="secondary"
              icon={<EventAvailableIcon />}
              component={Link}
              href={webcal}
              clickable
              aria-label={`Subscribe to ${feed.name}`}
            />
            <LinkValue url={webcal} />
            <CopyButton
              label={`subscribe link for ${feed.name}`}
              value={webcal}
              onCopied={onCopied}
            />
          </Stack>
        )}

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Chip
            label={feed.kind === 'view' ? 'View in browser' : 'View / download'}
            size="small"
            variant="outlined"
            icon={<OpenInNewIcon />}
            component={Link}
            href={https}
            target="_blank"
            rel="noopener noreferrer"
            clickable
            aria-label={`Open ${feed.name} in a new tab`}
          />
          <LinkValue url={https} />
          <CopyButton
            label={`https link for ${feed.name}`}
            value={https}
            onCopied={onCopied}
          />
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * Presentational list of public calendar feeds grouped by audience, each with a
 * `webcal://` subscribe link, an `https://` view link, and copy-to-clipboard
 * buttons.
 */
export function CalendarFeedList({ feeds }: CalendarFeedListProps): React.ReactNode {
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const handleCopied = useCallback((message: string) => setSnackbar(message), []);

  return (
    <>
      <Stack spacing={3}>
        {GROUPS.map((group) => {
          const groupFeeds = feeds.filter((f) => f.audience === group.audience);
          if (groupFeeds.length === 0) return null;

          return (
            <Card key={group.audience}>
              <CardContent>
                <Typography variant="h6" component="h2">
                  {group.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {group.caption}
                </Typography>
                <Stack
                  divider={<Divider flexItem />}
                  spacing={2}
                  data-testid={`feed-group-${group.audience}`}
                >
                  {groupFeeds.map((feed) => (
                    <CalendarFeedRow
                      key={feed.id}
                      feed={feed}
                      onCopied={handleCopied}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        message={snackbar ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
