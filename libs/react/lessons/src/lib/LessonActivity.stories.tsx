import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import type { Lesson } from '@maple/ts/domain';
import { LessonActivity, type LessonActivityLabel } from './LessonActivity';

const NOW = new Date('2026-10-05T12:00:00Z');

const lesson = (id: string, iso: string, status: Lesson['status'] = 'scheduled'): Lesson => ({
  id,
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date(iso),
  durationMinutes: 45,
  status,
  createdAt: NOW,
  updatedAt: NOW,
});

const lessons = [
  lesson('old-unpaid', '2026-08-11T20:00:00Z'),
  lesson('paid', '2026-09-01T20:00:00Z'),
  lesson('invoiced', '2026-09-08T20:00:00Z'),
  lesson('called-off', '2026-09-15T20:00:00Z', 'cancelled'),
  lesson('upcoming', '2026-10-13T20:00:00Z'),
];

const labels: Record<string, LessonActivityLabel> = {
  paid: 'paid',
  invoiced: 'invoiced',
  'called-off': 'cancelled',
};

const meta: Meta<typeof LessonActivity> = {
  title: 'Lessons/LessonActivity',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
  component: LessonActivity,
  args: {
    lessonsState: { status: 'success', data: lessons },
    labelOf: (l: Lesson) => labels[l.id] ?? 'none',
    isHope: false,
    hasCard: true,
    busy: false,
    now: NOW,
    onCharge: fn(),
    onInvoice: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof LessonActivity>;

/** Newest first; paid says Paid, and an unpaid past lesson says nothing. */
export const Record: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByRole('listitem');
    await expect(rows).toHaveLength(5);
    await expect(rows[0]).toHaveTextContent('Oct 13');
    await expect(rows[4]).toHaveTextContent('Aug 11');
    await expect(canvas.getByText('Paid')).toBeInTheDocument();
    await expect(canvas.getByText('Invoiced')).toBeInTheDocument();
    // Not called out as a problem: no "unpaid", "owed" or "overdue" anywhere.
    await expect(
      canvas.queryByText(/unpaid|owed|overdue|not paid/i)
    ).not.toBeInTheDocument();
    await expect(rows[4].textContent).not.toMatch(/Paid|Invoiced|Cancelled/);
  },
};

/** Only an unpaid past lesson has a menu, and it is quiet. */
export const ChargeAPastLesson: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await expect(menus).toHaveLength(1);
    await userEvent.click(menus[0]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Charge the card' }));
    await expect(args.onCharge).toHaveBeenCalledWith(lessons[0]);
  },
};

export const InvoiceWithoutACard: Story = {
  args: { hasCard: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^More for/ }));
    await expect(
      screen.queryByRole('menuitem', { name: 'Charge the card' })
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Send an invoice' }));
    await expect(args.onInvoice).toHaveBeenCalledWith(lessons[0]);
  },
};

/** Hope lessons bill through EMA: nothing to charge here. */
export const HopeHasNoMenu: Story = {
  args: { isHope: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('button', { name: /^More for/ })
    ).not.toBeInTheDocument();
  },
};

export const ArrivingFromALink: Story = {
  args: { highlightLessonId: 'old-unpaid' },
};

export const NoLessons: Story = {
  args: { lessonsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No lessons yet.')).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { lessonsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(within(canvasElement).queryByText('No lessons yet.')).not.toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  args: { lessonsState: { status: 'error', error: 'network down' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not load lessons: network down')).toBeInTheDocument();
    await expect(canvas.queryByText('No lessons yet.')).not.toBeInTheDocument();
  },
};
