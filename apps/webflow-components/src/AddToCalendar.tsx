import { useMemo, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import {
  googleCalendarUrl,
  microsoft365CalendarUrl,
  outlookCalendarUrl,
  type ClassCalendarEntry,
} from '@maple/ts/domain';
import { downloadIcs, isIosNonSafari } from './lib/add-to-calendar';

/**
 * Toggle for the calendar choices. The choices render inline rather than in a
 * Menu: the widgets live in Webflow's shadow DOM, and a portalled popover
 * would land outside it, unstyled.
 */
export function AddToCalendarButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <Button
      variant="outlined"
      color="primary"
      startIcon={<CalendarTodayIcon />}
      aria-expanded={open}
      aria-controls="add-to-calendar-options"
      onClick={onToggle}
    >
      Add to Calendar
    </Button>
  );
}

function formatSessionStart(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

/** Google, Outlook.com and Microsoft 365 links for one session. */
function WebCalendarLinks({
  entry,
  label,
}: {
  entry: ClassCalendarEntry;
  /** Distinguishes the links when there is one row per session. */
  label?: string;
}): ReactElement {
  const links = [
    ['Google Calendar', googleCalendarUrl(entry)],
    ['Outlook', outlookCalendarUrl(entry)],
    ['Microsoft 365', microsoft365CalendarUrl(entry)],
  ] as const;
  return (
    <>
      {links.map(([name, href]) => (
        <Button
          key={name}
          variant="text"
          color="primary"
          size="small"
          component="a"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label ? `${name}, ${label}` : undefined}
        >
          {name}
        </Button>
      ))}
    </>
  );
}

export function AddToCalendarOptions({
  open,
  entries,
  userAgent,
  maxTouchPoints,
}: {
  open: boolean;
  /** One per session the buyer attends. */
  entries: ReadonlyArray<ClassCalendarEntry>;
  /** Overridable for stories; defaults to the browser's. */
  userAgent?: string;
  maxTouchPoints?: number;
}): ReactElement | null {
  const icsWontOpen = useMemo(
    () =>
      isIosNonSafari(
        userAgent ??
          (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        maxTouchPoints ??
          (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0)
      ),
    [userAgent, maxTouchPoints]
  );

  if (entries.length === 0) return null;
  const multiple = entries.length > 1;

  return (
    <Collapse in={open} unmountOnExit>
      <Box id="add-to-calendar-options" sx={{ mb: 3, textAlign: 'center' }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <Button
            variant="text"
            color="primary"
            size="small"
            onClick={() => downloadIcs(entries)}
          >
            {multiple
              ? `Apple Calendar (all ${entries.length} sessions)`
              : 'Apple Calendar'}
          </Button>
          {!multiple && <WebCalendarLinks entry={entries[0]} />}
        </Stack>

        {multiple && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Google and Outlook add one session at a time:
            </Typography>
            {entries.map((entry) => {
              const when = formatSessionStart(entry.start);
              return (
                <Box key={entry.uid} sx={{ mt: 1 }}>
                  <Typography variant="body2">{when}</Typography>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
                  >
                    <WebCalendarLinks entry={entry} label={when} />
                  </Stack>
                </Box>
              );
            })}
          </Box>
        )}

        {icsWontOpen && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            On iPhone, Apple Calendar only opens from Safari. In this browser,
            choose Google Calendar or Outlook, or use the calendar file in your
            confirmation email.
          </Typography>
        )}
      </Box>
    </Collapse>
  );
}
