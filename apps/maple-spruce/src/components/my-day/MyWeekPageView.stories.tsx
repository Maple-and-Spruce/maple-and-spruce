import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor } from 'storybook/test';
import type { Lesson } from '@maple/ts/domain';
import type { MyDayLesson } from '@maple/ts/firebase/api-types';
import {
  mockMyWeekResponse,
  mockMyWeekStart,
} from '@maple/react/storybook-fixtures';
import { MyWeekPageView } from './MyWeekPageView';

const lesson: Lesson = {
  id: 'les-1',
  studentId: 'stu-1',
  teacherId: 'instr-1',
  scheduledAt: new Date('2026-07-20T15:00:00'),
  durationMinutes: 30,
  status: 'scheduled',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
};

const todaysLesson: MyDayLesson = {
  lesson,
  studentId: 'stu-1',
  studentName: 'Test Student',
};

const meta = {
  component: MyWeekPageView,
  title: 'MyDay/MyWeekPageView',
  parameters: { layout: 'padded' },
  beforeEach: () => {
    localStorage.removeItem('myWeek.hiddenCategories');
    localStorage.removeItem('myWeek.mode');
  },
  args: {
    dayState: {
      status: 'success',
      data: { lessons: [todaysLesson], unlinked: false },
    },
    weekState: { status: 'success', data: mockMyWeekResponse },
    weekStart: mockMyWeekStart,
    onPrevWeek: fn(),
    onNextWeek: fn(),
    onThisWeek: fn(),
    onRecordPayment: fn(),
    pending: null,
  },
} satisfies Meta<typeof MyWeekPageView>;

export default meta;
type Story = StoryObj<typeof MyWeekPageView>;

/** The page opens on the week, not the day. */
export const OpensOnWeek: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'My Week' }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole('tab', { name: 'Week' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(canvas.getByRole('tab', { name: 'Today' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // The week grid, not the day's lesson cards.
    await expect(
      canvas.getByRole('button', { name: /next week/i }),
    ).toBeInTheDocument();
  },
};

/** Today stays one tap away; a student opens their Next lessons (#160). */
export const TodayTabReachable: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('tab', { name: 'Today' }));
    await waitFor(() =>
      expect(canvas.getByText(/Your lessons today/)).toBeInTheDocument(),
    );
    await expect(
      canvas.getByText(/Tap a student to book their next lessons/),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /mark taught|no-show/i }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: todaysLesson.studentName }),
    ).toHaveAttribute('href', `/students/${todaysLesson.lesson.studentId}?tab=next`);
  },
};

/** A lesson in the week reads by name and opens that student (#160). */
export const WeekLessonOpensTheStudent: Story = {
  play: async ({ canvas }) => {
    const lesson = await canvas.findByRole('link', { name: /Test Student A/ });
    await expect(lesson).toHaveAttribute('href', '/students/stu-a?tab=next');
  },
};

/** "Not known yet" is never drawn as "no lessons". */
export const TodayLoading: Story = {
  args: { dayState: { status: 'idle' }, initialTab: 'today' },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByText(/No lessons scheduled today/),
    ).not.toBeInTheDocument();
  },
};

export const TodayError: Story = {
  args: {
    dayState: { status: 'error', error: 'Network blip.' },
    initialTab: 'today',
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Couldn’t load your day: Network blip\./),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(/No lessons scheduled today/),
    ).not.toBeInTheDocument();
  },
};
