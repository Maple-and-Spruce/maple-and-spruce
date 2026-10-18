import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';
import { mockStatementPending } from '@maple/react/storybook-fixtures';
import { MarkStatementPaidDialog } from './MarkStatementPaidDialog';

const meta = {
  component: MarkStatementPaidDialog,
  title: 'Payouts/MarkStatementPaidDialog',
  args: {
    statement: mockStatementPending,
    onClose: fn(),
    onSubmit: fn(async () => undefined),
  },
} satisfies Meta<typeof MarkStatementPaidDialog>;

export default meta;
type Story = StoryObj<typeof MarkStatementPaidDialog>;

export const Open: Story = {
  play: async () => {
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Hazel Marsh, October 2026');
    expect(dialog).toHaveTextContent('$368.00');
  },
};

export const RequiresAMethod: Story = {
  play: async ({ args }) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByText('Choose how it was paid')).toBeInTheDocument();
    expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const RecordsThePayment: Story = {
  play: async ({ args }) => {
    const date = await screen.findByLabelText('Paid on');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-05');
    await userEvent.click(screen.getByLabelText('Paid with'));
    await userEvent.click(await screen.findByRole('option', { name: 'Square Bill Pay' }));
    await userEvent.type(screen.getByLabelText('Reference (optional)'), '  BP-1042 ');
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        id: 'stmt-hazel-oct',
        paidOn: '2026-11-05',
        paymentMethod: 'bill-pay',
        paymentReference: 'BP-1042',
      })
    );
    expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

export const ShowsASaveFailure: Story = {
  args: {
    onSubmit: fn(async () => {
      throw new Error('Only a pending statement can be marked paid; this one is paid');
    }),
  },
  play: async ({ args }) => {
    await userEvent.click(await screen.findByLabelText('Paid with'));
    await userEvent.click(await screen.findByRole('option', { name: 'Square Payroll' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }));
    expect(await screen.findByText(/this one is paid/)).toBeInTheDocument();
    expect(args.onClose).not.toHaveBeenCalled();
  },
};

export const Closed: Story = {
  args: { statement: null },
  play: async () => {
    expect(screen.queryByRole('dialog')).toBeNull();
  },
};
