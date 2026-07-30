import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor } from 'storybook/test';
import { Box } from '@mui/material';
import type { CalendarEventType, RoomBusyWindow, RoomScheduleDay } from '@maple/ts/domain';
import { RoomScheduleAgenda, RoomScheduleAgendaList } from './RoomScheduleAgenda';

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

/**
 * The full agenda with its windowed-paging controls. The range label is driven
 * purely by the offset state (independent of loaded data), so this play test
 * exercises Prev/Next/Today without a live backend: clicking Next advances the
 * visible window and Today snaps it back to the now-anchored span.
 */
export const Paging: Story = {
  render: () => (
    <Box sx={{ width: 480, maxWidth: '100%' }}>
      <RoomScheduleAgenda room="spruce" bookHref="/book-room" />
    </Box>
  ),
  play: async ({ canvas }) => {
    const rangeLabel = () => canvas.getByTestId('room-schedule-range');

    const initial = await waitFor(() => {
      const text = rangeLabel().textContent;
      expect(text).toBeTruthy();
      return text as string;
    });

    // Next advances the window — the label must change.
    await userEvent.click(canvas.getByRole('button', { name: /next weeks/i }));
    await waitFor(() =>
      expect(rangeLabel().textContent).not.toBe(initial)
    );

    // Today snaps back to the now-anchored window.
    await userEvent.click(
      canvas.getByRole('button', { name: /jump back to today/i })
    );
    await waitFor(() => expect(rangeLabel().textContent).toBe(initial));
  },
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
