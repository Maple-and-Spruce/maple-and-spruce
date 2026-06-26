import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@mui/material';
import type { CalendarEventType, RoomBusyWindow, RoomScheduleDay } from '@maple/ts/domain';
import { RoomScheduleAgendaList } from './RoomScheduleAgenda';

// Fixed reference day so the Today/Tomorrow prefixes and dates render
// deterministically: Thursday, June 26 2026.
const NOW = new Date(2026, 5, 26, 9, 0);

function win(
  d: Date,
  sh: number,
  sm: number,
  eh: number,
  em: number,
  title: string,
  type: CalendarEventType
): RoomBusyWindow {
  return {
    eventId: `${title}-${d.getDate()}-${sh}`,
    title,
    type,
    sourceRef: type === 'lesson' ? 'lessons/x' : null,
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em),
  };
}

function dayAt(offset: number): Date {
  return new Date(2026, 5, 26 + offset);
}

function day(offset: number, windows: RoomBusyWindow[] = []): RoomScheduleDay {
  return { date: dayAt(offset), windows };
}

// A realistic stretch: a busy today, a free Friday, a class+lesson Saturday,
// a run of open days that collapses, then a midweek booking.
const DAYS: RoomScheduleDay[] = [
  day(0, [
    win(dayAt(0), 16, 30, 18, 0, 'Music Together', 'event'),
    win(dayAt(0), 18, 30, 19, 15, 'Music Lesson', 'lesson'),
  ]),
  day(1),
  day(2, [
    win(dayAt(2), 10, 0, 11, 0, 'Watercolor 101', 'class'),
    win(dayAt(2), 14, 0, 14, 45, 'Music Lesson', 'lesson'),
  ]),
  day(3),
  day(4),
  day(5),
  day(6, [win(dayAt(6), 16, 30, 18, 0, 'Music Together', 'event')]),
];

const meta = {
  component: RoomScheduleAgendaList,
  title: 'Rooms/RoomScheduleAgenda',
  parameters: { layout: 'centered' },
} satisfies Meta<typeof RoomScheduleAgendaList>;

export default meta;
type Story = StoryObj<typeof RoomScheduleAgendaList>;

/** A populated week+ of Spruce Room usage, with a collapsed open-day range. */
export const Default: Story = {
  args: { days: DAYS, now: NOW },
  render: (args) => (
    <Box sx={{ width: 480, maxWidth: '100%' }}>
      <RoomScheduleAgendaList {...args} />
    </Box>
  ),
};

/** A single busy day. */
export const OneDay: Story = {
  args: {
    days: [
      day(0, [
        win(dayAt(0), 9, 0, 10, 0, 'Music Lesson', 'lesson'),
        win(dayAt(0), 16, 30, 18, 0, 'Music Together', 'event'),
      ]),
    ],
    now: NOW,
  },
  render: (args) => (
    <Box sx={{ width: 480, maxWidth: '100%' }}>
      <RoomScheduleAgendaList {...args} />
    </Box>
  ),
};
