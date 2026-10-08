import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, screen, userEvent, within } from 'storybook/test';
import type { HopeProduct, HopeQueueEntry, Lesson } from '@maple/ts/domain';
import { HopeStudentBilling, type HopeOrderRow } from './HopeStudentBilling';

const NOW = new Date('2026-09-01T12:00:00Z');
const violin30: HopeProduct = {
  id: 'prod-violin-30',
  emaProductId: '103772',
  name: 'Suzuki Violin Lesson - 30 min',
  priceCents: 3250,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function lesson(id: string, iso: string): Lesson {
  return {
    id,
    studentId: 'stu-1',
    teacherId: 't-1',
    scheduledAt: new Date(iso),
    durationMinutes: 30,
    status: 'rendered',
    createdAt: NOW,
    updatedAt: NOW,
  } as Lesson;
}

function entry(id: string, iso: string, extra: Partial<HopeQueueEntry>): HopeQueueEntry {
  return {
    lesson: lesson(id, iso),
    studentId: 'stu-1',
    studentName: 'Test Student',
    rateCents: 3250,
    rateSource: 'product',
    ...extra,
  };
}

const order: HopeOrderRow = {
  id: 'order-1',
  studentId: 'stu-1',
  productId: 'prod-violin-30',
  priceCents: 3250,
  lessonCount: 4,
  emaOrderId: '55501',
  orderedOn: new Date('2026-08-01T16:00:00Z'),
  createdAt: NOW,
  updatedAt: NOW,
  remaining: 0,
};

const entries: HopeQueueEntry[] = [
  entry('l1', '2026-08-05T16:00:00Z', {
    state: { kind: 'invoiced', orderId: 'order-1' },
    submission: {
      id: 'l1',
      lessonId: 'l1',
      studentId: 'stu-1',
      teacherId: 't-1',
      lessonDate: new Date('2026-08-05T16:00:00Z'),
      status: 'submitted',
      rateCents: 3250,
      submittedAt: NOW,
      emaReference: 'INV-9',
      orderId: 'order-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  }),
  entry('l2', '2026-08-12T16:00:00Z', { state: { kind: 'ready-to-invoice', orderId: 'order-1' } }),
  entry('l3', '2026-08-19T16:00:00Z', { state: { kind: 'ready-to-invoice', orderId: 'order-1' } }),
  entry('l4', '2026-08-26T16:00:00Z', { state: { kind: 'ready-to-invoice', orderId: 'order-1' } }),
  entry('l5', '2026-09-02T16:00:00Z', { state: { kind: 'needs-order' } }),
];

const meta = {
  component: HopeStudentBilling,
  title: 'Lessons/HopeStudentBilling',
  parameters: { layout: 'padded' },
  args: {
    entries,
    orders: [order],
    products: [violin30],
    defaultProductId: 'prod-violin-30',
    onSaveOrder: fn(async () => undefined),
    onMarkInvoiced: fn(async () => undefined),
  },
} satisfies Meta<typeof HopeStudentBilling>;

export default meta;
type Story = StoryObj<typeof HopeStudentBilling>;

/** Where every taught lesson stands, and the order it draws on. */
export const WhereEachLessonStands: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('3 ready to invoice')).toBeInTheDocument();
    await expect(canvas.getByText('1 need an order')).toBeInTheDocument();
    await expect(canvas.getByText('1 invoiced')).toBeInTheDocument();
    await expect(canvas.getByText(/Order 55501 · 4 lessons/)).toBeInTheDocument();
    await expect(
      canvas.getByText(/1 taught lesson needs an EMA order before it can be invoiced/)
    ).toBeInTheDocument();
  },
};

/** Tick the ones invoiced in the portal, add the invoice number, done. */
export const MarkingLessonsInvoiced: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tick all 3' }));
    await userEvent.type(canvas.getByLabelText('EMA invoice # (optional)'), 'INV-10');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Mark 3 invoiced ($97.50)' })
    );
    await expect(args.onMarkInvoiced).toHaveBeenCalledWith(['l2', 'l3', 'l4'], 'INV-10');
  },
};

/** Nothing ticked, nothing to mark. */
export const MarkInvoicedNeedsATick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Mark invoiced' })).toBeDisabled();
  },
};

/** Recording an order defaults to the student's product and four lessons. */
export const RecordingAnOrder: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Record an order' })[0]);
    const dialog = within(await screen.findByRole('dialog'));
    await expect(dialog.getByLabelText('Number of lessons')).toHaveValue(4);
    const count = dialog.getByLabelText('Number of lessons');
    await userEvent.clear(count);
    await userEvent.type(count, '8');
    await userEvent.type(dialog.getByLabelText('EMA order ID (optional)'), '55502');
    await userEvent.click(dialog.getByRole('button', { name: 'Save order' }));
    await expect(args.onSaveOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'prod-violin-30',
        lessonCount: 8,
        emaOrderId: '55502',
      })
    );
  },
};

/** A refusal (e.g. no order has room any more) is said in place. */
export const InvoicingErrorShown: Story = {
  args: {
    onMarkInvoiced: fn(async () => {
      throw new Error('No EMA order has room for this lesson.');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Tick all 3' }));
    await userEvent.click(canvas.getByRole('button', { name: /Mark 3 invoiced/ }));
    await expect(
      await canvas.findByText('No EMA order has room for this lesson.')
    ).toBeInTheDocument();
  },
};

/** Invoiced lessons fold away, with their invoice number. */
export const InvoicedFoldAway: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Show 1 invoiced' }));
    await expect(await canvas.findByText(/invoice INV-9/)).toBeVisible();
  },
};

/** Nothing taught yet: orders can still be recorded ahead of the lessons. */
export const NothingTaughtYet: Story = {
  args: { entries: [], orders: [{ ...order, remaining: 4 }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No taught lessons yet/)).toBeInTheDocument();
    await expect(canvas.getByText(/4 left/)).toBeInTheDocument();
  },
};

/**
 * A student on no EMA product (#83): their taught lessons have no price, so
 * the card says so and shows no dollar figure for them.
 */
export const StudentOnNoProduct: Story = {
  args: {
    entries: [
      entry('u1', '2026-08-05T16:00:00Z', {
        rateCents: undefined,
        rateSource: 'unpriced',
        state: { kind: 'needs-order' },
      }),
      entry('u2', '2026-08-12T16:00:00Z', {
        rateCents: undefined,
        rateSource: 'unpriced',
        state: { kind: 'needs-order' },
      }),
    ],
    orders: [],
    defaultProductId: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/2 taught lessons have no price/)
    ).toBeInTheDocument();
    await expect(canvas.getByText('No EMA product set.')).toBeInTheDocument();
    await expect(canvas.queryByText(/\$\d/)).toBeNull();
  },
};

/** On a product, nothing is unpriced, so no such warning. */
export const OnAProductNoUnpricedWarning: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/have no price|has no price/)).toBeNull();
  },
};
