import { useMemo, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import {
  downloadIcs,
  googleCalendarUrl,
  isIosNonSafari,
  outlookCalendarUrl,
  type CalendarEvent,
} from './lib/add-to-calendar';

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

export function AddToCalendarOptions({
  open,
  event,
  userAgent,
  maxTouchPoints,
}: {
  open: boolean;
  event: CalendarEvent;
  /** Overridable for stories; defaults to the browser's. */
  userAgent?: string;
  maxTouchPoints?: number;
}): ReactElement {
  const icsWontOpen = useMemo(
    () =>
      isIosNonSafari(
        userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        maxTouchPoints ??
          (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0)
      ),
    [userAgent, maxTouchPoints]
  );

  return (
    <Collapse in={open} unmountOnExit>
      <Box id="add-to-calendar-options" sx={{ mb: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ justifyContent: 'center' }}
        >
          <Button
            variant="text"
            color="primary"
            onClick={() => downloadIcs(event)}
          >
            Apple Calendar
          </Button>
          <Button
            variant="text"
            color="primary"
            component="a"
            href={googleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Calendar
          </Button>
          <Button
            variant="text"
            color="primary"
            component="a"
            href={outlookCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Outlook
          </Button>
        </Stack>
        {icsWontOpen && (
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ mt: 1, textAlign: 'center' }}
          >
            On iPhone, Apple Calendar only opens from Safari. In this browser,
            choose Google Calendar or Outlook, or open this page in Safari.
          </Typography>
        )}
      </Box>
    </Collapse>
  );
}
