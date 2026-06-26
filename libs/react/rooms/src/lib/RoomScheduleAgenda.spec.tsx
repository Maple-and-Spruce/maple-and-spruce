// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { RoomBusyWindow, RoomScheduleDay } from '@maple/ts/domain';
import { RoomScheduleAgendaList } from './RoomScheduleAgenda';

afterEach(cleanup);

function win(
  start: Date,
  end: Date,
  overrides: Partial<RoomBusyWindow> = {}
): RoomBusyWindow {
  return {
    eventId: `evt-${start.getTime()}`,
    title: 'Music Together',
    type: 'event',
    sourceRef: null,
    start,
    end,
    ...overrides,
  };
}

function day(date: Date, windows: RoomBusyWindow[] = []): RoomScheduleDay {
  return { date, windows };
}

const now = new Date(2026, 5, 26, 9, 0); // Fri Jun 26

describe('RoomScheduleAgendaList', () => {
  it('renders a booking row with time range, title, and type chip', () => {
    const days = [
      day(new Date(2026, 5, 26), [
        win(new Date(2026, 5, 26, 16, 30), new Date(2026, 5, 26, 18, 0), {
          title: 'Music Together',
          type: 'event',
        }),
      ]),
    ];
    render(<RoomScheduleAgendaList days={days} now={now} />);

    expect(screen.getByText('Music Together')).toBeTruthy();
    expect(screen.getByText('Booking')).toBeTruthy(); // event → "Booking"
    expect(screen.getByText(/4:30/)).toBeTruthy();
  });

  it('prefixes the current day with "Today"', () => {
    const days = [
      day(new Date(2026, 5, 26), [
        win(new Date(2026, 5, 26, 16, 0), new Date(2026, 5, 26, 17, 0)),
      ]),
    ];
    render(<RoomScheduleAgendaList days={days} now={now} />);
    expect(screen.getByText(/^Today ·/)).toBeTruthy();
  });

  it('collapses consecutive open days into one open range row', () => {
    const days = [
      day(new Date(2026, 5, 26), [
        win(new Date(2026, 5, 26, 16, 0), new Date(2026, 5, 26, 17, 0)),
      ]),
      day(new Date(2026, 5, 27)),
      day(new Date(2026, 5, 28)),
      day(new Date(2026, 5, 29)),
    ];
    render(<RoomScheduleAgendaList days={days} now={now} />);

    // The three open days collapse into a single "Open all day" row.
    const openRows = screen.getAllByText(/Open all day/);
    expect(openRows).toHaveLength(1);
    // Rendered as a range Jun 27 – Jun 29.
    expect(screen.getByText(/Jun 27 – Jun 29/)).toBeTruthy();
  });

  it('labels lesson and class windows distinctly', () => {
    const days = [
      day(new Date(2026, 5, 26), [
        win(new Date(2026, 5, 26, 10, 0), new Date(2026, 5, 26, 11, 0), {
          eventId: 'lesson-1',
          type: 'lesson',
          title: 'Music Lesson',
        }),
        win(new Date(2026, 5, 26, 14, 0), new Date(2026, 5, 26, 15, 0), {
          eventId: 'class-1',
          type: 'class',
          title: 'Watercolor 101',
        }),
      ]),
    ];
    render(<RoomScheduleAgendaList days={days} now={now} />);
    const region = screen.getByText('Music Lesson').closest('div');
    expect(within(region as HTMLElement).getByText('Lesson')).toBeTruthy();
    expect(screen.getByText('Class')).toBeTruthy();
  });
});
