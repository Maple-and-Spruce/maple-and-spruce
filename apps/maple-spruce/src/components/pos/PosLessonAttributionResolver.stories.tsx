import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, waitFor, within } from 'storybook/test';
import type { PosLessonAttribution, Student } from '@maple/ts/domain';
import { PosLessonAttributionResolver } from './PosLessonAttributionResolver';

const students: Student[] = [
  {
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
  },
  {
    id: 's2',
    name: 'Dana Lopez',
    instrument: 'piano',
    isAdultStudent: true,
    primaryTeacherId: 'i1',
    isHopeScholarship: false,
    primaryContactName: 'Dana Lopez',
    primaryContactEmail: 'dana@example.com',
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  },
];

const attribution: PosLessonAttribution = {
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
  customerEmail: 'casey@example.com',
  status: 'pending',
  createdAt: new Date('2026-07-03'),
  updatedAt: new Date('2026-07-03'),
};

const meta = {
  component: PosLessonAttributionResolver,
  title: 'POS/PosLessonAttributionResolver',
  parameters: { layout: 'centered' },
  args: {
    attribution,
    students,
    open: true,
    onClose: fn(),
    onResolve: fn().mockResolvedValue(undefined),
    isResolving: false,
  },
} satisfies Meta<typeof PosLessonAttributionResolver>;

export default meta;
type Story = StoryObj<typeof PosLessonAttributionResolver>;

export const Default: Story = {};

export const AttributeRequiresAStudent: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body);
    await userEvent.click(
      await dialog.findByRole('button', { name: /^attribute$/i })
    );
    // No student selected → the resolver blocks and shows a validation hint.
    await waitFor(() => {
      expect(
        dialog.getByText(/pick a student to attribute/i)
      ).toBeInTheDocument();
    });
    expect(args.onResolve).not.toHaveBeenCalled();
  },
};

export const AttributeToSelectedStudent: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body);
    const input = await dialog.findByLabelText(/student/i);
    await userEvent.click(input);
    // MUI Autocomplete options portal to the body.
    const option = await screen.findByRole('option', { name: /Juniper Nguyen/i });
    await userEvent.click(option);

    await userEvent.click(
      dialog.getByRole('button', { name: /^attribute$/i })
    );
    await waitFor(() => {
      expect(args.onResolve).toHaveBeenCalledWith('attribute', {
        studentId: 's1',
      });
    });
  },
};

export const DismissCallsResolve: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body);
    await userEvent.click(
      await dialog.findByRole('button', { name: /^dismiss$/i })
    );
    await waitFor(() => {
      expect(args.onResolve).toHaveBeenCalledWith(
        'dismiss',
        expect.objectContaining({})
      );
    });
  },
};
