// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { RoomBusyWindow } from '@maple/ts/domain';

afterEach(cleanup);

// Inject a controllable room-schedule state without touching Firebase.
const { hook } = vi.hoisted(() => ({
  hook: { state: { status: 'idle' } as Record<string, unknown> },
}));

vi.mock('./useRoomScheduleForDate', () => ({
  useRoomScheduleForDate: () => ({
    roomScheduleState: hook.state,
    refetch: () => undefined,
  }),
}));

import { RoomAvailability } from './RoomAvailability';

function win(
  startIso: string,
  endIso: string,
  overrides: Partial<RoomBusyWindow> = {}
): RoomBusyWindow {
  return {
    eventId: `evt-${startIso}`,
    title: 'Music Together',
    type: 'event',
    sourceRef: null,
    start: new Date(startIso),
    end: new Date(endIso),
    ...overrides,
  };
}

const start = new Date('2026-06-21T21:00:00Z');
const end = new Date('2026-06-21T21:30:00Z');

describe('RoomAvailability', () => {
  it('renders a skeleton while loading', () => {
    hook.state = { status: 'loading' };
    const { container } = render(
      <RoomAvailability room="spruce" start={start} end={end} />
    );
    expect(container.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('warns when the proposed slot overlaps a booking', () => {
    hook.state = {
      status: 'success',
      data: [win('2026-06-21T20:30:00Z', '2026-06-21T22:00:00Z')],
    };
    render(<RoomAvailability room="spruce" start={start} end={end} />);
    expect(screen.getByText(/already booked/i)).toBeTruthy();
  });

  it('shows the day strip and no warning when there is no overlap', () => {
    hook.state = {
      status: 'success',
      data: [win('2026-06-21T23:00:00Z', '2026-06-21T23:30:00Z')],
    };
    render(
      <RoomAvailability
        room="spruce"
        start={new Date('2026-06-21T20:00:00Z')}
        end={new Date('2026-06-21T20:30:00Z')}
      />
    );
    expect(screen.queryByText(/already booked/i)).toBeNull();
    expect(screen.getByText(/Spruce Room:/)).toBeTruthy();
  });

  it('says the room is open when nothing is booked', () => {
    hook.state = { status: 'success', data: [] };
    render(<RoomAvailability room="spruce" start={start} end={end} />);
    expect(screen.getByText(/No other Spruce Room bookings/i)).toBeTruthy();
  });

  it('honours ignoreSourceRef (a class does not flag its own sessions)', () => {
    hook.state = {
      status: 'success',
      data: [
        win('2026-06-21T20:30:00Z', '2026-06-21T22:00:00Z', {
          eventId: 'class-abc-0',
          sourceRef: 'classes/abc',
          title: 'Watercolor Basics',
        }),
      ],
    };
    render(
      <RoomAvailability
        room="spruce"
        start={start}
        end={end}
        ignoreSourceRef="classes/abc"
      />
    );
    expect(screen.queryByText(/already booked/i)).toBeNull();
  });

  it('shows a fallback message on error', () => {
    hook.state = { status: 'error', error: 'boom' };
    render(<RoomAvailability room="spruce" start={start} end={end} />);
    expect(
      screen.getByText(/Couldn.t check Spruce Room availability/i)
    ).toBeTruthy();
  });
});
