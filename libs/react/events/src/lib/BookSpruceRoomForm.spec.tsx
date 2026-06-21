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
