import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, within } from 'storybook/test';
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

const actions = {
  onMove: fn(),
  onPushBack: fn(),
  onCancel: fn(),
  onWeather: fn(),
  onInPerson: fn(),
  onDelete: fn(),
};

/** Opens a row's ⋮ menu and returns the menu's item names. */
async function openMenu(row: HTMLElement): Promise<string[]> {
  await userEvent.click(within(row).getByRole('button', { name: /^More for/ }));
  const menu = await screen.findByRole('menu');
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');
}

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
    actions,
    // Before the first lesson, so every one is upcoming.
    now: new Date('2026-10-01T12:00:00Z'),
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
      canvas.queryByRole('button', { name: /taught|no-show/i }),
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

/** The same menu as every other tab, a paid lesson included. */
export const Menu: Story = {
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    await expect(await openMenu(items[0])).toEqual([
      'Move…',
      'Push back a week…',
      'Cancel…',
      'Weather…',
      'Delete',
    ]);
  },
};

export const MoveAPaidLesson: Story = {
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    await openMenu(items[0]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move…' }));
    await expect(actions.onMove).toHaveBeenCalledWith(eight[0]);
  },
};

export const PushBack: Story = {
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    await openMenu(items[1]);
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Push back a week…' }),
    );
    await expect(actions.onPushBack).toHaveBeenCalledWith(eight[1]);
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
  play: async ({ canvasElement }) => {
    const items = within(canvasElement).getAllByRole('listitem');
    await expect(within(items[1]).getByText('Online')).toBeInTheDocument();
    await expect(
      within(items[0]).queryByText('Online'),
    ).not.toBeInTheDocument();
    const online = await openMenu(items[1]);
    await expect(online).toContain('In person');
    await expect(online).not.toContain('Weather…');
    await userEvent.click(screen.getByRole('menuitem', { name: 'In person' }));
    await expect(actions.onInPerson).toHaveBeenCalledWith({
      ...eight[1],
      virtual: true,
    });
  },
};

export const Saving: Story = {
  args: { pendingLessonId: 'lesson-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await expect(menus[1]).toBeDisabled();
    await expect(menus[0]).toBeEnabled();
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
