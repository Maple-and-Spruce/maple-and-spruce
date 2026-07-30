// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RoomBusyWindow, RoomScheduleDay } from '@maple/ts/domain';

// Stub the data hook so the full RoomScheduleAgenda renders without Firebase.
vi.mock('./useRoomScheduleRange', () => ({
  useRoomScheduleRange: vi.fn(() => ({
    roomScheduleState: { status: 'success', data: [] },
    refetch: vi.fn(),
  })),
}));

import {
  RoomScheduleAgenda,
  RoomScheduleAgendaList,
  formatWindowRange,
} from './RoomScheduleAgenda';
import { useRoomScheduleRange } from './useRoomScheduleRange';

const mockedHook = vi.mocked(useRoomScheduleRange);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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

describe('formatWindowRange', () => {
  it('renders a same-year span with a single year suffix', () => {
    expect(
      formatWindowRange(new Date(2026, 6, 30), new Date(2026, 7, 27))
    ).toBe('Jul 30 – Aug 27, 2026');
  });

  it('shows the year on both ends when the span crosses a year boundary', () => {
    expect(
      formatWindowRange(new Date(2026, 11, 20), new Date(2027, 0, 17))
    ).toBe('Dec 20, 2026 – Jan 17, 2027');
  });
});

describe('RoomScheduleAgenda paging', () => {
  it('offers a 12-week horizon option', () => {
    render(<RoomScheduleAgenda room="spruce" />);
    expect(screen.getByRole('button', { name: /12 weeks/i })).toBeTruthy();
  });

  it('shifts the queried range forward by one horizon when Next is clicked', async () => {
    mockedHook.mockClear();
    render(<RoomScheduleAgenda room="spruce" />);

    const firstStart = (mockedHook.mock.calls[0][1] as Date).getTime();
    const labelBefore = screen.getByTestId('room-schedule-range').textContent;

    await userEvent.click(screen.getByRole('button', { name: /next weeks/i }));

    const calls = mockedHook.mock.calls;
    const nextStart = (calls[calls.length - 1][1] as Date).getTime();
    // Default horizon is 4 weeks, so Next advances the window by exactly that.
    expect(nextStart - firstStart).toBe(4 * MS_PER_WEEK);
    expect(screen.getByTestId('room-schedule-range').textContent).not.toBe(
      labelBefore
    );
  });

  it('returns to the now-anchored window when Today is clicked', async () => {
    mockedHook.mockClear();
    render(<RoomScheduleAgenda room="spruce" />);

    const labelBefore = screen.getByTestId('room-schedule-range').textContent;
    // Today is disabled at the now-anchored window.
    expect(
      screen.getByRole('button', { name: /jump back to today/i })
    ).toHaveProperty('disabled', true);

    await userEvent.click(screen.getByRole('button', { name: /next weeks/i }));
    expect(screen.getByTestId('room-schedule-range').textContent).not.toBe(
      labelBefore
    );

    await userEvent.click(
      screen.getByRole('button', { name: /jump back to today/i })
    );
    expect(screen.getByTestId('room-schedule-range').textContent).toBe(
      labelBefore
    );
  });
});
