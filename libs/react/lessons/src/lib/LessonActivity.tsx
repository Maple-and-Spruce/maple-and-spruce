'use client';

/**
 * Every lesson the student has had or has booked, newest first (#158).
 *
 * An audit record Katie will rarely open. A paid lesson says **Paid**; a past
 * lesson nobody paid for in the portal carries **no label at all**. Past
 * payments were settled outside the portal, so an unpaid lesson here is not a
 * problem and must not read like a debt. If one genuinely is owed, its row
 * menu can charge the card or send an invoice — the only place a past lesson
 * can be charged for, and a quiet one.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  Skeleton,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { SCHEDULE_TIME_ZONE } from '@maple/ts/domain';
import type { Lesson, RequestState } from '@maple/ts/domain';

export type LessonActivityLabel = 'paid' | 'invoiced' | 'cancelled' | 'none';

export interface LessonActivityProps {
  lessonsState: RequestState<Lesson[]>;
  /** What each lesson's row says; anything not listed says nothing. */
  labelOf: (lesson: Lesson) => LessonActivityLabel;
  /** Hope lessons bill through EMA, so nothing here charges them. */
  isHope: boolean;
  /** Whether a card is linked, so "Charge the card" is offered. */
  hasCard: boolean;
  /** The lesson a link pointed at, shown highlighted. */
  highlightLessonId?: string | null;
  busy: boolean;
  error?: string | null;
  now?: Date;
  onCharge: (lesson: Lesson) => void;
  onInvoice: (lesson: Lesson) => void;
}

const LABELS: Record<
  Exclude<LessonActivityLabel, 'none'>,
  { text: string; color: 'success' | 'info' | 'default' }
> = {
  paid: { text: 'Paid', color: 'success' },
  invoiced: { text: 'Invoiced', color: 'info' },
  cancelled: { text: 'Cancelled', color: 'default' },
};

function formatWhen(at: Date): string {
  return at.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: SCHEDULE_TIME_ZONE,
  });
}

export function LessonActivity({
  lessonsState,
  labelOf,
  isHope,
  hasCard,
  highlightLessonId,
  busy,
  error,
  now = new Date(),
  onCharge,
  onInvoice,
}: LessonActivityProps) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; lesson: Lesson } | null>(
    null
  );

  if (lessonsState.status === 'idle' || lessonsState.status === 'loading') {
    return (
      <Box aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="text" height={36} />
        ))}
      </Box>
    );
  }
  if (lessonsState.status === 'error') {
    return (
      <Alert severity="error">Could not load lessons: {lessonsState.error}</Alert>
    );
  }

  const lessons = [...lessonsState.data].sort(
    (a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime()
  );
  if (lessons.length === 0) {
    return <Typography color="textSecondary">No lessons yet.</Typography>;
  }

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <List dense aria-label="Lesson activity">
        {lessons.map((lesson) => {
          const label = labelOf(lesson);
          const when = formatWhen(lesson.scheduledAt);
          const canSettle =
            !isHope &&
            label === 'none' &&
            lesson.scheduledAt.getTime() <= now.getTime();
          return (
            <ListItem
              key={lesson.id}
              disableGutters
              sx={
                lesson.id === highlightLessonId
                  ? { bgcolor: 'action.selected', borderRadius: 1, px: 1 }
                  : undefined
              }
              secondaryAction={
                canSettle ? (
                  <IconButton
                    edge="end"
                    disabled={busy}
                    aria-label={`More for ${when}`}
                    onClick={(e) => setMenu({ anchor: e.currentTarget, lesson })}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                ) : undefined
              }
            >
              <ListItemText
                primary={
                  <Box
                    component="span"
                    sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
                  >
                    {when}
                    {label !== 'none' && (
                      <Chip
                        label={LABELS[label].text}
                        size="small"
                        color={LABELS[label].color}
                        variant="outlined"
                      />
                    )}
                  </Box>
                }
              />
            </ListItem>
          );
        })}
      </List>
      <Menu
        anchorEl={menu?.anchor}
        open={menu !== null}
        onClose={() => setMenu(null)}
      >
        {hasCard && (
          <MenuItem
            onClick={() => {
              if (menu) onCharge(menu.lesson);
              setMenu(null);
            }}
          >
            Charge the card
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (menu) onInvoice(menu.lesson);
            setMenu(null);
          }}
        >
          Send an invoice
        </MenuItem>
      </Menu>
    </>
  );
}
