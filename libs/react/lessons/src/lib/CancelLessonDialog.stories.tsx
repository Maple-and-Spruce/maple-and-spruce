import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, screen } from 'storybook/test';
import type { Lesson } from '@maple/ts/domain';
import { CancelLessonDialog } from './CancelLessonDialog';

const lesson: Lesson = {
  id: 'lesson-1',
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  // Thu Nov 5, 2026, 4:00 PM in the studio's timezone.
  scheduledAt: new Date('2026-11-05T21:00:00Z'),
  durationMinutes: 30,
  status: 'scheduled',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

const meta: Meta<typeof CancelLessonDialog> = {
  title: 'Lessons/CancelLessonDialog',
  component: CancelLessonDialog,
  args: {
    lesson,
    paidFor: true,
    planFor: () => ({}),
    busy: false,
    onClose: fn(),
    onCancel: fn(),
    onReschedule: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof CancelLessonDialog>;

/** Plain cancel: the lesson stays on the record and its payment stays put. */
export const JustCancel: Story = {
  play: async ({ args }) => {
    await expect(await screen.findByText(/Cancel Thu, Nov 5/)).toBeInTheDocument();
    await expect(
      screen.getByText(/The payment for it stays as it is/)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel lesson' }));
    await expect(args.onCancel).toHaveBeenCalledWith(lesson);
    await expect(args.onReschedule).not.toHaveBeenCalled();
  },
};

/** With a credit: a new time, defaulting to the same time next week. */
export const RescheduleWithCredit: Story = {
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole('radio', { name: 'Cancel and reschedule with a credit' })
    );
    await expect(
      screen.getByText('The payment for this lesson covers the new one.')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel and reschedule' }));
    await expect(args.onReschedule).toHaveBeenCalledWith(
      lesson,
      new Date('2026-11-12T21:00:00Z')
    );
    await expect(args.onCancel).not.toHaveBeenCalled();
  },
};

/** Nothing paid for it yet: the dialog says the new lesson is billed normally. */
export const NotPaidYet: Story = {
  args: { paidFor: false, initialChoice: 'reschedule' },
  play: async () => {
    await expect(
      await screen.findByText(/Nothing has paid for this lesson yet/)
    ).toBeInTheDocument();
  },
};

/** A time no block can cover cannot be booked. */
export const NoBlockForThatTime: Story = {
  args: {
    initialChoice: 'reschedule',
    planFor: () => ({ blocked: 'No teaching block can cover these times.' }),
  },
  play: async () => {
    await expect(
      await screen.findByText('No teaching block can cover these times.')
    ).toBeInTheDocument();
    await expect(
      screen.getByRole('button', { name: 'Cancel and reschedule' })
    ).toBeDisabled();
  },
};

/** A lesson cancelled earlier can only be rescheduled. */
export const AlreadyCancelled: Story = {
  args: { lesson: { ...lesson, status: 'cancelled' } },
  play: async ({ args }) => {
    await expect(await screen.findByText(/Reschedule Thu, Nov 5/)).toBeInTheDocument();
    await expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
    await expect(args.onReschedule).toHaveBeenCalled();
  },
};

export const Saving: Story = {
  args: { busy: true },
  play: async () => {
    await expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    await expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  },
};

export const Failed: Story = {
  args: { error: 'That room is booked then.' },
  play: async () => {
    await expect(await screen.findByText('That room is booked then.')).toBeInTheDocument();
  },
};
