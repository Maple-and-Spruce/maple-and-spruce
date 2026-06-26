// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { CreateCalendarEventInput } from '@maple/ts/domain';
import { BookSpruceRoomForm } from './BookSpruceRoomForm';

afterEach(cleanup);

function setup(isSubmitting = false) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<BookSpruceRoomForm onSubmit={onSubmit} isSubmitting={isSubmitting} />);
  return { onSubmit };
}

const bookButton = () => screen.getByRole('button', { name: /book the room/i });

describe('BookSpruceRoomForm', () => {
  it('submits a private, one-time Spruce booking with the defaults', async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText(/what's the booking/i), {
      target: { value: 'Private rental' },
    });
    fireEvent.click(bookButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
    expect(input.title).toBe('Private rental');
    expect(input.room).toBe('spruce');
    expect(input.public).toBe(false);
    expect(input.type).toBe('event');
    expect(input.recurrenceRule).toBeNull();
    expect(input.location).toBe('Spruce Room');
  });

  it('submits with valid defaults late at night (block must not cross midnight)', async () => {
    // Regression: before the 22:00 cap, the default 1-hour block starting at
    // 23:00 wrapped the end time to 00:00, which combineDateTime folded back to
    // the *same* day → end before start → "end after start" validation blocked
    // submit. Fake only Date so waitFor's real timers still fire.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 22, 30, 0));
    try {
      const { onSubmit } = setup();
      fireEvent.change(screen.getByLabelText(/what's the booking/i), {
        target: { value: 'Late rental' },
      });
      fireEvent.click(bookButton());

      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
      expect(input.endDateTime.getTime()).toBeGreaterThan(
        input.startDateTime.getTime()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not submit when the title is blank', async () => {
    const { onSubmit } = setup();
    fireEvent.click(bookButton());
    // Validation blocks submit; give any async a tick to settle.
    await Promise.resolve();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sets a weekly recurrence rule when "Repeat weekly" is checked', async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText(/what's the booking/i), {
      target: { value: 'Music Together' },
    });
    fireEvent.click(screen.getByLabelText(/repeat weekly/i));
    fireEvent.click(bookButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
    expect(input.recurrenceRule).toBe('FREQ=WEEKLY');
  });

  it('marks the booking public when the toggle is on', async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText(/what's the booking/i), {
      target: { value: 'Open house' },
    });
    fireEvent.click(screen.getByLabelText(/show on the public calendar/i));
    fireEvent.click(bookButton());

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const input = onSubmit.mock.calls[0][0] as CreateCalendarEventInput;
    expect(input.public).toBe(true);
  });

  it('disables the button while submitting', () => {
    setup(true);
    const button = screen.getByRole('button', {
      name: /booking/i,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
