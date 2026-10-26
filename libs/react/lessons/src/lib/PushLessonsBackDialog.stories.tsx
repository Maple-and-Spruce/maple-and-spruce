import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import { PushLessonsBackDialog } from './PushLessonsBackDialog';

/** Tuesdays at noon, across the end of daylight time on Nov 1. */
const twoMoves = [
  {
    id: 'lesson-oct27',
    from: new Date('2026-10-27T16:00:00Z'),
    to: new Date('2026-11-03T17:00:00Z'),
  },
  {
    id: 'lesson-nov3',
    from: new Date('2026-11-03T17:00:00Z'),
    to: new Date('2026-11-10T17:00:00Z'),
    paid: true,
  },
];

const meta: Meta<typeof PushLessonsBackDialog> = {
  title: 'Lessons/PushLessonsBackDialog',
  component: PushLessonsBackDialog,
  args: {
    moves: twoMoves,
    busy: false,
    onConfirm: fn(),
    onClose: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof PushLessonsBackDialog>;

/** Every date that moves is listed before anything moves. */
export const TwoLessons: Story = {
  play: async ({ args }) => {
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText('Push 2 lessons back a week?')).toBeInTheDocument();
    await expect(dialog.getByText(/keep their times and their payments/)).toBeInTheDocument();
    const rows = within(dialog.getByRole('list', { name: 'Lessons that move' }));
    await expect(rows.getAllByRole('listitem')).toHaveLength(2);
    await expect(rows.getByText(/Oct 27.*12:00.*→ Tue, Nov 3/)).toBeInTheDocument();
    await expect(rows.getByText(/Nov 3.*12:00.*→ Tue, Nov 10/)).toBeInTheDocument();
    await expect(rows.getByText('Paid')).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Push 2 back' }));
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

export const OneLesson: Story = {
  args: { moves: [twoMoves[0]] },
  play: async ({ args }) => {
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByText('Push this lesson back a week?')).toBeInTheDocument();
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
};

/** While it saves, nothing can be pressed twice. */
export const Saving: Story = {
  args: { busy: true },
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByRole('button', { name: 'Push 2 back' })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Back' })).toBeDisabled();
  },
};

/** A refusal (someone else has the room) is shown, and nothing moved. */
export const Refused: Story = {
  args: {
    error: 'Tue, Nov 10: Spruce Room is already taken 12:00 PM–1:00 PM by Music Lesson',
  },
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByRole('alert')).toHaveTextContent(/Nov 10: Spruce Room is already taken/);
  },
};

export const Closed: Story = {
  args: { moves: [] },
  play: async () => {
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};
