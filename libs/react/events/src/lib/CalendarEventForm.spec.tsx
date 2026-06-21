// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { CalendarEvent, CreateCalendarEventInput } from '@maple/ts/domain';

// RoomAvailability fetches via Firebase; stub it so the form renders offline.
vi.mock('@maple/react/rooms', () => ({
  RoomAvailability: () => null,
}));

import { CalendarEventForm } from './CalendarEventForm';

afterEach(cleanup);

const spruceEvent: CalendarEvent = {
  id: 'evt1',
  title: 'Pottery Night',
  description: 'Fun',
  startDateTime: new Date('2026-06-21T22:00:00Z'),
  endDateTime: new Date('2026-06-22T00:00:00Z'),
  recurrenceRule: null,
  location: 'Spruce Room',
  type: 'event',
  public: false,
  room: 'spruce',
  sourceRef: null,
  createdBy: 'u1',
  createdAt: new Date('2026-06-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
};

describe('CalendarEventForm', () => {
  it('creates a one-time event with no room by default', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CalendarEventForm open onClose={() => undefined} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: 'New Event' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
    expect(input.title).toBe('New Event');
    expect(input.room).toBeNull();
    expect(input.type).toBe('event');
    expect(input.public).toBe(true);
  });

  it('prefills room and shows availability when editing a Spruce event', () => {
    render(
      <CalendarEventForm
        open
        onClose={() => undefined}
        onSubmit={vi.fn()}
        calendarEvent={spruceEvent}
      />
    );

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe(
      'Pottery Night'
    );
    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy();
  });

  it('preserves the room and privacy on edit submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarEventForm
        open
        onClose={() => undefined}
        onSubmit={onSubmit}
        calendarEvent={spruceEvent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /update/i }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
    expect(input.room).toBe('spruce');
    expect(input.public).toBe(false);
  });
});
