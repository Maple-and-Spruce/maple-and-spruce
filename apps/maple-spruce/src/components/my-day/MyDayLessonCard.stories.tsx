import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import type { Lesson } from '@maple/ts/domain';
import type { MyDayLesson } from '@maple/ts/firebase/api-types';
import { MyDayLessonCard } from './MyDayLessonCard';

const baseLesson: Lesson = {
  id: 'les-1',
  studentId: 'stu-1',
  teacherId: 'instr-1',
  scheduledAt: new Date('2026-07-20T15:00:00'),
  durationMinutes: 30,
  status: 'scheduled',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
};

const scheduledNoInvoice: MyDayLesson = {
  lesson: baseLesson,
  studentId: 'stu-1',
  studentName: 'Juniper Nguyen',
};

const renderedUnpaid: MyDayLesson = {
  lesson: { ...baseLesson, status: 'rendered' },
  studentId: 'stu-1',
  studentName: 'Juniper Nguyen',
  invoice: { id: 'inv-1', status: 'sent', totalCents: 4000 },
};

const renderedPaid: MyDayLesson = {
  lesson: { ...baseLesson, status: 'rendered' },
  studentId: 'stu-1',
  studentName: 'Juniper Nguyen',
  invoice: {
    id: 'inv-1',
    status: 'paid',
    totalCents: 4000,
    source: 'venmo-manual',
  },
};

const meta = {
  component: MyDayLessonCard,
  title: 'MyDay/MyDayLessonCard',
  parameters: { layout: 'padded' },
  args: {
    onMarkRendered: fn(),
    onRecordPayment: fn(),
    busy: false,
  },
} satisfies Meta<typeof MyDayLessonCard>;

export default meta;
type Story = StoryObj<typeof MyDayLessonCard>;

export const ScheduledMarkRendered: Story = {
  args: { item: scheduledNoInvoice },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /mark rendered/i }));
    await waitFor(() => {
      expect(args.onMarkRendered).toHaveBeenCalledWith('les-1');
    });
  },
};

export const UnpaidRecordVenmo: Story = {
  args: { item: renderedUnpaid },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    // No mark-rendered button once rendered.
    expect(
      canvas.queryByRole('button', { name: /mark rendered/i })
    ).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: /record venmo/i }));
    await waitFor(() => {
      expect(args.onRecordPayment).toHaveBeenCalledWith('inv-1', 'venmo-manual');
    });
  },
};

export const UnpaidRecordCash: Story = {
  args: { item: renderedUnpaid },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /cash \/ check/i }));
    await waitFor(() => {
      expect(args.onRecordPayment).toHaveBeenCalledWith('inv-1', 'admin-manual');
    });
  },
};

export const PaidShowsChipNoActions: Story = {
  args: { item: renderedPaid },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/paid/i)).toBeInTheDocument();
    });
    expect(canvas.queryByRole('button', { name: /record venmo/i })).toBeNull();
  },
};
