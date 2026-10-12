import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import type { Lesson } from '@maple/ts/domain';
import { UpcomingLessonsCard } from './UpcomingLessonsCard';

const lesson = (n: number): Lesson => ({
  id: `lesson-${n}`,
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date(Date.UTC(2026, 9, 6 + 7 * n, 20)),
  durationMinutes: 45,
  status: 'scheduled',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
});

const eight = Array.from({ length: 8 }, (_, n) => lesson(n));

const meta: Meta<typeof UpcomingLessonsCard> = {
  title: 'Lessons/UpcomingLessonsCard',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
  component: UpcomingLessonsCard,
  args: {
    lessonsState: { status: 'success', data: eight.slice(0, 3) },
    paidLessonIds: new Set(['lesson-0', 'lesson-1']),
    onMove: fn(),
    onCancel: fn(),
    onWeather: fn(),
    onInPerson: fn(),
    onDelete: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof UpcomingLessonsCard>;

export const PaidAndUnpaid: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getAllByText('Paid')).toHaveLength(2);
    // Nothing to mark: no taught or no-show buttons.
    await expect(
      canvas.queryByRole('button', { name: /taught|no-show/i })
    ).not.toBeInTheDocument();
  },
};

/** Never a long series: five at most. */
export const AtMostFive: Story = {
  args: { lessonsState: { status: 'success', data: eight } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(5);
  },
};

export const MoveAndDelete: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: /^Move/ })[0]);
    await expect(args.onMove).toHaveBeenCalledWith(eight[0]);
    await userEvent.click(canvas.getAllByRole('button', { name: /^Delete/ })[2]);
    await expect(args.onDelete).toHaveBeenCalledWith(eight[2]);
  },
};

/** Cancel opens the cancel dialog, where Katie can also reschedule with a credit. */
export const Cancel: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: /^Cancel/ })[1]);
    await expect(args.onCancel).toHaveBeenCalledWith(eight[1]);
  },
};

/** A lesson rescheduled with a credit says so (#209). */
export const CreditedLesson: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [{ ...eight[0], id: 'lesson-x-credit', creditForLessonId: 'lesson-x' }, eight[1]],
    },
    paidLessonIds: new Set(['lesson-x-credit']),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const items = canvas.getAllByRole('listitem');
    await expect(within(items[0]).getByText('Credit')).toBeInTheDocument();
    await expect(within(items[0]).getByText('Paid')).toBeInTheDocument();
    await expect(within(items[1]).queryByText('Credit')).not.toBeInTheDocument();
  },
};

/** Weather (#210) on an in-person lesson; In person on one held online. */
export const WeatherAndOnline: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [eight[0], { ...eight[1], virtual: true }],
    },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const items = canvas.getAllByRole('listitem');
    await expect(within(items[1]).getByText('Online')).toBeInTheDocument();
    await expect(within(items[0]).queryByText('Online')).not.toBeInTheDocument();
    await expect(
      within(items[1]).queryByRole('button', { name: /^Weather/ })
    ).not.toBeInTheDocument();

    await userEvent.click(within(items[0]).getByRole('button', { name: /^Weather/ }));
    await expect(args.onWeather).toHaveBeenCalledWith(eight[0]);
    await userEvent.click(within(items[1]).getByRole('button', { name: /^In person/ }));
    await expect(args.onInPerson).toHaveBeenCalledWith({ ...eight[1], virtual: true });
  },
};

export const Saving: Story = {
  args: { pendingLessonId: 'lesson-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const deletes = canvas.getAllByRole('button', { name: /^Delete/ });
    await expect(deletes[1]).toBeDisabled();
    await expect(deletes[0]).toBeEnabled();
  },
};

export const NothingBooked: Story = {
  args: { lessonsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No lessons are booked.')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { lessonsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvas.queryByText('No lessons are booked.')).not.toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  args: { lessonsState: { status: 'error', error: 'network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Could not load lessons: network down')
    ).toBeInTheDocument();
    await expect(canvas.queryByText('No lessons are booked.')).not.toBeInTheDocument();
  },
};
