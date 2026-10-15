'use client';

import NextLink from 'next/link';
import { Alert, Box, IconButton, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import {
  borders,
  colors,
  fonts,
  radii,
  surfaces,
  text,
} from '@maple/react/theme';
import type { InboxItem, RequestState } from '@maple/ts/domain';
import {
  DashboardCard,
  DashboardCardError,
  DashboardCardSkeleton,
  dashboardColors,
  ellipsis,
} from './DashboardCard';
import {
  inboxAgeText,
  inboxDoneLabel,
  inboxFooterText,
  inboxKindLabel,
  inboxTone,
  visibleInboxItems,
  type InboxTone,
} from './inbox-view';

export interface InboxCardProps {
  inboxState: RequestState<InboxItem[]>;
  now: Date;
  /** Mark an item done. The hook removes it at once and records it for everyone. */
  onDismiss: (key: string) => void;
  /** Set when a "Mark done" could not be recorded and the row came back. */
  dismissError?: string | null;
  onClearDismissError?: () => void;
}

const TONES: Record<InboxTone, { dot: string; ink: string }> = {
  inquiry: { dot: colors.sageGreen, ink: colors.sageGreenDark },
  failure: { dot: dashboardColors.clay, ink: dashboardColors.clayInk },
  deadline: { dot: dashboardColors.ochre, ink: dashboardColors.ochreInk },
  quiet: { dot: dashboardColors.quietDot, ink: text.primary },
};

function InboxRow({
  item,
  now,
  onDismiss,
}: {
  item: InboxItem;
  now: Date;
  onDismiss: (key: string) => void;
}) {
  const tone = TONES[inboxTone(item.kind)];
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        pl: 2.5,
        pr: 1.25,
        py: 1.25,
        borderTop: `1px solid ${borders.subtle}`,
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: tone.dot,
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* The age never truncates; a long kind label gives way instead. */}
        <Box
          sx={{
            display: 'flex',
            minWidth: 0,
            whiteSpace: 'nowrap',
            fontFamily: fonts.button,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: tone.ink,
          }}
        >
          <Box component="span" sx={{ ...ellipsis, flex: '0 1 auto' }}>
            {inboxKindLabel(item.kind)}
          </Box>
          <Box
            component="span"
            sx={{
              flexShrink: 0,
              color: item.urgent ? dashboardColors.clay : text.secondary,
            }}
          >
            <Box component="span" sx={{ color: tone.ink, px: 0.5 }}>
              ·
            </Box>
            {inboxAgeText(item, now)}
          </Box>
        </Box>
        <Typography
          sx={{ ...ellipsis, fontSize: 16, color: colors.brownDark, mt: 0.25 }}
        >
          {item.title}
        </Typography>
        {item.detail && (
          <Typography color="textSecondary" sx={{ ...ellipsis, fontSize: 13 }}>
            {item.detail}
          </Typography>
        )}
      </Box>
      <Box
        component={NextLink}
        href={item.href}
        sx={{
          flexShrink: 0,
          fontFamily: fonts.button,
          fontSize: 13,
          fontWeight: 600,
          color: colors.sageGreenDark,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          px: 1.25,
          py: 0.75,
          borderRadius: `${radii.sm + 2}px`,
          border: `1px solid ${colors.creamDark}`,
          '&:hover': { bgcolor: surfaces.paperMuted, color: colors.brownDark },
          '&:focus-visible': {
            outline: `2px solid ${borders.focus}`,
            outlineOffset: 2,
          },
        }}
      >
        {item.actionLabel}
      </Box>
      <IconButton
        aria-label={inboxDoneLabel(item)}
        title="Mark done"
        onClick={() => onDismiss(item.key)}
        sx={{ width: 32, height: 32, flexShrink: 0, color: text.secondary }}
      >
        <CheckIcon sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  );
}

function AllCaughtUp() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 2.5,
        borderTop: `1px solid ${borders.subtle}`,
      }}
    >
      <Typography sx={{ fontSize: 18, color: text.primary }}>
        All caught up
      </Typography>
      <Typography color="textSecondary" sx={{ fontSize: 14, mt: 0.5 }}>
        New inquiries, failed charges and unsigned agreements land here.
      </Typography>
    </Box>
  );
}

/**
 * The Home dashboard's Inbox (#235): the studio's to-dos, most urgent first,
 * four at a time. Each row links to where it is resolved, and the check marks
 * it done for everyone.
 */
export function InboxCard({
  inboxState,
  now,
  onDismiss,
  dismissError,
  onClearDismissError,
}: InboxCardProps) {
  let body;
  let aside: string | undefined;
  let footer: string | undefined;

  if (inboxState.status === 'error') {
    body = (
      <DashboardCardError message={`Couldn't load the inbox: ${inboxState.error}`} />
    );
  } else if (inboxState.status !== 'success') {
    body = <DashboardCardSkeleton rows={4} />;
  } else {
    const items = inboxState.data;
    const { rows, hidden } = visibleInboxItems(items);
    aside = `${items.length} to do`;
    footer = inboxFooterText(hidden) || undefined;
    body = (
      <>
        {dismissError && (
          <Box sx={{ px: 2.5, pb: 1 }}>
            <Alert severity="error" onClose={onClearDismissError}>
              {dismissError}
            </Alert>
          </Box>
        )}
        {items.length === 0 ? (
          <AllCaughtUp />
        ) : (
          <Box
            component="ul"
            aria-label="Inbox items"
            sx={{ listStyle: 'none', m: 0, p: 0 }}
          >
            {rows.map((item) => (
              <InboxRow
                key={item.key}
                item={item}
                now={now}
                onDismiss={onDismiss}
              />
            ))}
          </Box>
        )}
      </>
    );
  }

  return (
    <DashboardCard title="Inbox" aside={aside} footer={footer}>
      {body}
    </DashboardCard>
  );
}
