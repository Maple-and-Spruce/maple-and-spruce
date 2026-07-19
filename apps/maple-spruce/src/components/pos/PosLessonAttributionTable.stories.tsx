import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import type {
  PosLessonAttribution,
  RequestState,
  Student,
} from '@maple/ts/domain';
import { PosLessonAttributionTable } from './PosLessonAttributionTable';

const pending: PosLessonAttribution = {
  id: 'PAY-1__VAR_LESSON',
  squarePaymentId: 'PAY-1',
  squareOrderId: 'ORDER-1',
  catalogObjectId: 'VAR_LESSON',
  itemName: 'Guitar Lesson',
  quantity: 1,
  subtotalCents: 4000,
  amountPaidCents: 4000,
  occurredAt: new Date('2026-07-03'),
  customerName: 'Casey Nguyen',
  status: 'pending',
  createdAt: new Date('2026-07-03'),
  updatedAt: new Date('2026-07-03'),
};

const attributed: PosLessonAttribution = {
  ...pending,
  id: 'PAY-2__VAR_LESSON',
  squarePaymentId: 'PAY-2',
  status: 'attributed',
  studentId: 's1',
  invoiceId: 'inv-1',
  attributedBy: 'auto',
  squareReceiptUrl: 'https://squareup.com/receipt/x',
};

const student: Student = {
  id: 's1',
  name: 'Juniper Nguyen',
  instrument: 'guitar',
  isAdultStudent: false,
  primaryTeacherId: 'i1',
  isHopeScholarship: false,
  primaryContactName: 'Casey Nguyen',
  primaryContactEmail: 'casey@example.com',
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const meta = {
  component: PosLessonAttributionTable,
  title: 'POS/PosLessonAttributionTable',
  parameters: { layout: 'padded' },
  args: {
    attributionsState: {
      status: 'success',
      data: [pending, attributed],
    } as RequestState<PosLessonAttribution[]>,
    studentsById: new Map([['s1', student]]),
    onReview: fn(),
  },
} satisfies Meta<typeof PosLessonAttributionTable>;

export default meta;
type Story = StoryObj<typeof PosLessonAttributionTable>;

export const Mixed: Story = {};

export const Empty: Story = {
  args: {
    attributionsState: {
      status: 'success',
      data: [],
    } as RequestState<PosLessonAttribution[]>,
  },
};

export const ReviewButtonCallsOnReview: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /review/i }));
    await waitFor(() => {
      expect(args.onReview).toHaveBeenCalledTimes(1);
      expect(args.onReview).toHaveBeenCalledWith(pending);
    });
  },
};

export const AttributedRowShowsAutoAndStudent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText('Juniper Nguyen')).toBeInTheDocument();
      expect(canvas.getByText(/auto/i)).toBeInTheDocument();
    });
    // Attributed rows expose a receipt link, not a Review button.
    expect(
      canvas.getAllByRole('button', { name: /review/i }).length
    ).toBe(1);
  },
};
