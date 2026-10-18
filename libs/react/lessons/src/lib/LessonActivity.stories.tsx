import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import type { Instructor, Lesson } from '@maple/ts/domain';
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

const instructors = [
  { id: 'teacher-1', name: 'Test Teacher' },
] as unknown as Instructor[];

const bodyRows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('tbody tr'));

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
      <div style={{ maxWidth: 900 }}>
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
    instructors,
    busy: false,
    now: NOW,
    onCharge: fn(),
    onInvoice: fn(),
    onCancel: fn(),
    onRestore: fn(),
    onReschedule: fn(),
    onWeather: fn(),
    onInPerson: fn(),
    onDelete: fn(),
    onAdd: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof LessonActivity>;

/** A table, newest first; paid says Paid, and an unpaid past lesson says nothing. */
export const Record: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const header of ['Date', 'Time', 'Length', 'Teacher', 'Status']) {
      await expect(canvas.getByRole('columnheader', { name: new RegExp(header) })).toBeInTheDocument();
    }
    const rows = bodyRows(canvasElement);
    await expect(rows).toHaveLength(5);
    // How the E2E specs find lesson rows: rows in the region that have a menu.
    const region = canvas.getByRole('region', { name: 'Lesson activity' });
    const withMenu = within(region)
      .getAllByRole('row')
      .filter((r) => within(r).queryByRole('button', { name: /^More for/ }));
    await expect(withMenu).toHaveLength(5);
    await expect(rows[0]).toHaveTextContent('Oct 13');
    await expect(rows[0]).toHaveTextContent('45 min');
    await expect(rows[0]).toHaveTextContent('Test Teacher');
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

/** Every row has a menu: cancel and delete are always on offer. */
export const EveryRowCanBeCancelledOrDeleted: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await expect(menus).toHaveLength(5);

    // Upcoming lesson: no charging, but cancel and delete.
    await userEvent.click(menus[0]);
    await expect(screen.queryByRole('menuitem', { name: 'Charge the card' })).not.toBeInTheDocument();
    await expect(screen.queryByRole('menuitem', { name: 'Send an invoice' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cancel…' }));
    await expect(args.onCancel).toHaveBeenCalledWith(lessons[4]);

    // A paid past lesson can still be deleted.
    await userEvent.click(menus[3]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await expect(args.onDelete).toHaveBeenCalledWith(lessons[1]);
  },
};

/** A cancelled lesson offers to undo it, or to reschedule it with a credit. */
export const UndoACancel: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^More for Tue, Sep 15/ }));
    await expect(screen.queryByRole('menuitem', { name: 'Cancel…' })).not.toBeInTheDocument();
    await expect(
      await screen.findByRole('menuitem', { name: 'Reschedule with a credit…' })
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Undo cancel' }));
    await expect(args.onRestore).toHaveBeenCalledWith(lessons[3]);
  },
};

const replacement: Lesson = {
  ...lesson('called-off-credit', '2026-09-22T20:00:00Z'),
  creditForLessonId: 'called-off',
};
const withCredit = [...lessons, replacement];

/**
 * A credit links two rows (#209): the cancelled lesson says where it went, the
 * replacement says what it is a credit for, and the cancelled one can be
 * neither restored nor credited again.
 */
export const RescheduledWithCredit: Story = {
  args: {
    lessonsState: { status: 'success', data: withCredit },
    replacementOf: (l: Lesson) =>
      withCredit.find((x) => x.creditForLessonId === l.id),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Rescheduled to Sep 22')).toBeInTheDocument();
    await expect(canvas.getByText('Credit for Sep 15')).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /^More for Tue, Sep 15/ }));
    await expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    await expect(screen.queryByRole('menuitem', { name: 'Undo cancel' })).not.toBeInTheDocument();
    await expect(
      screen.queryByRole('menuitem', { name: 'Reschedule with a credit…' })
    ).not.toBeInTheDocument();
  },
};

/** Rescheduling a lesson cancelled earlier hands it to the page. */
export const RescheduleACancelledLesson: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^More for Tue, Sep 15/ }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Reschedule with a credit…' })
    );
    await expect(args.onReschedule).toHaveBeenCalledWith(lessons[3]);
  },
};

/** Only an unpaid past lesson can be charged for. */
export const ChargeAPastLesson: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await userEvent.click(menus[4]);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Charge the card' }));
    await expect(args.onCharge).toHaveBeenCalledWith(lessons[0]);
  },
};

export const InvoiceWithoutACard: Story = {
  args: { hasCard: false },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await userEvent.click(menus[4]);
    await expect(
      screen.queryByRole('menuitem', { name: 'Charge the card' })
    ).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Send an invoice' }));
    await expect(args.onInvoice).toHaveBeenCalledWith(lessons[0]);
  },
};

/** Hope lessons bill through EMA: nothing to charge, but cancel and delete stay. */
export const HopeCannotBeCharged: Story = {
  args: { isHope: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menus = canvas.getAllByRole('button', { name: /^More for/ });
    await userEvent.click(menus[4]);
    await expect(screen.queryByRole('menuitem', { name: 'Charge the card' })).not.toBeInTheDocument();
    await expect(screen.queryByRole('menuitem', { name: 'Send an invoice' })).not.toBeInTheDocument();
    await expect(await screen.findByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  },
};

/** A lesson can be added from the record. */
export const AddALesson: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add a lesson' }));
    await expect(args.onAdd).toHaveBeenCalled();
  },
};

export const ArrivingFromALink: Story = {
  args: { highlightLessonId: 'old-unpaid' },
};

export const NoLessons: Story = {
  args: { lessonsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No lessons yet.')).toBeInTheDocument();
    // The first lesson can still be added.
    await expect(canvas.getByRole('button', { name: 'Add a lesson' })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { lessonsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(within(canvasElement).queryByText('No lessons yet.')).not.toBeInTheDocument();
    // Nothing to add to until the existing lessons are known.
    await expect(within(canvasElement).queryByRole('button', { name: 'Add a lesson' })).not.toBeInTheDocument();
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

const weatherCancelled: Lesson = { ...lessons[3], cancelledFor: 'weather' };
const online: Lesson = { ...lessons[4], virtual: true };
const withWeather = [lessons[0], lessons[1], lessons[2], weatherCancelled, online, replacement];

/** A weather cancellation and a lesson held online say so (#210). */
export const WeatherAndOnline: Story = {
  args: {
    lessonsState: { status: 'success', data: withWeather },
    replacementOf: (l: Lesson) =>
      withWeather.find((x) => x.creditForLessonId === l.id),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Weather · Rescheduled to Sep 22')).toBeInTheDocument();
    await expect(canvas.getByText('Online')).toBeInTheDocument();

    // Held online: bring it back, not another weather call.
    await userEvent.click(canvas.getByRole('button', { name: /^More for Tue, Oct 13/ }));
    await expect(screen.queryByRole('menuitem', { name: 'Weather…' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'In person' }));
    await expect(args.onInPerson).toHaveBeenCalledWith(online);
  },
};

/** An in-person lesson offers Weather. */
export const Weather: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^More for Tue, Oct 13/ }));
    await expect(screen.queryByRole('menuitem', { name: 'In person' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Weather…' }));
    await expect(args.onWeather).toHaveBeenCalledWith(lessons[4]);
  },
};
