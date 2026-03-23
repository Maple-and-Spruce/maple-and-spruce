'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import iCalendarPlugin from '@fullcalendar/icalendar';
import type { EventClickArg, EventSourceInput } from '@fullcalendar/core';
import { getCalendarFeedSources } from './calendar-feed-config';

export function PublicCalendar() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const eventSources: EventSourceInput[] = useMemo(() => {
    const feeds = getCalendarFeedSources();
    return feeds.map((feed) => ({
      url: feed.url,
      format: 'ics' as const,
      color: feed.color,
      display: feed.background ? 'background' : 'auto',
      extraParams: {
        feedId: feed.id,
      },
    }));
  }, []);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      // Check for sourceRef in event extended props to link to registration
      const description = info.event.extendedProps?.['description'] ?? '';
      // ICS events from our feeds include X-MAPLE-SOURCE-REF as a custom property
      // FullCalendar's iCalendar plugin puts non-standard properties in extendedProps
      const sourceRef =
        info.event.extendedProps?.['X-MAPLE-SOURCE-REF'] ??
        info.event.extendedProps?.['x-maple-source-ref'] ??
        '';

      if (typeof sourceRef === 'string' && sourceRef.startsWith('classes/')) {
        const classId = sourceRef.replace('classes/', '');
        router.push(`/register/${classId}`);
        return;
      }

      // For non-class events, check if there's a URL in the description
      if (description && typeof description === 'string') {
        const urlMatch = description.match(/https?:\/\/\S+/);
        if (urlMatch) {
          window.open(urlMatch[0], '_blank', 'noopener');
        }
      }
    },
    [router]
  );

  return (
    <Box
      sx={{
        '& .fc': {
          fontFamily: theme.typography.fontFamily,
        },
        '& .fc-toolbar-title': {
          color: theme.palette.text.primary,
          fontSize: { xs: '1.1rem', sm: '1.5rem' },
        },
        '& .fc-button': {
          backgroundColor: theme.palette.secondary.main,
          borderColor: theme.palette.secondary.main,
          textTransform: 'none',
          '&:hover': {
            backgroundColor: theme.palette.secondary.dark,
            borderColor: theme.palette.secondary.dark,
          },
          '&.fc-button-active': {
            backgroundColor: theme.palette.secondary.dark,
            borderColor: theme.palette.secondary.dark,
          },
        },
        '& .fc-day-today': {
          backgroundColor: `${theme.palette.secondary.main}14 !important`,
        },
        '& .fc-event': {
          cursor: 'pointer',
          borderRadius: '4px',
          fontSize: '0.85rem',
        },
        '& .fc-list-event:hover td': {
          backgroundColor: theme.palette.action.hover,
        },
      }}
    >
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, iCalendarPlugin]}
        initialView={isMobile ? 'listMonth' : 'dayGridMonth'}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: isMobile
            ? 'listMonth,dayGridMonth'
            : 'dayGridMonth,timeGridWeek,listMonth',
        }}
        eventSources={eventSources}
        eventClick={handleEventClick}
        height="auto"
        nowIndicator
        dayMaxEvents={3}
        eventTimeFormat={{
          hour: 'numeric',
          minute: '2-digit',
          meridiem: 'short',
        }}
        timeZone="America/New_York"
      />
    </Box>
  );
}
