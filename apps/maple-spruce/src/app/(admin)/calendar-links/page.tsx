'use client';

import Typography from '@mui/material/Typography';
import { CalendarFeedList } from './CalendarFeedList';
import { CALENDAR_FEEDS } from './calendar-feeds';

export default function CalendarLinksPage(): React.ReactNode {
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        Calendar Links
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Subscribe to or share the studio&apos;s public calendar feeds. Use the{' '}
        <strong>Subscribe</strong> link to add a feed to a calendar app
        (Apple&nbsp;Calendar, Google&nbsp;Calendar, Outlook), or the{' '}
        <strong>View</strong> link to open it in a browser. Copy buttons put the
        link on your clipboard.
      </Typography>

      <CalendarFeedList feeds={CALENDAR_FEEDS} />
    </>
  );
}
