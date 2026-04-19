import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { InvoiceList } from './InvoiceList';
import {
  mockInvoices,
  mockInvoiceDraft,
  mockInvoiceSent,
  mockInvoicePaid,
  mockInvoicePaidManually,
  mockInvoiceVoid,
  mockInvoiceMultiLine,
  mockInvoiceSyncError,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';
import type { Invoice, RequestState } from '@maple/ts/domain';

const meta = {
  component: InvoiceList,
  title: 'Invoices/InvoiceList',
  parameters: { layout: 'padded' },
  args: {
    onEdit: fn(),
    onSend: fn(),
    onMarkPaid: fn(),
    onVoid: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof InvoiceList>;

export default meta;
type Story = StoryObj<typeof InvoiceList>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Loading: Story = {
  args: {
    invoicesState: { status: 'loading' } as RequestState<Invoice[]>,
  },
};

export const ErrorState: Story = {
  args: {
    invoicesState: {
      status: 'error',
      error: 'Failed to fetch invoices.',
    } as RequestState<Invoice[]>,
  },
};

export const Empty: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [],
    } as RequestState<Invoice[]>,
  },
};

export const Mixed: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: mockInvoices,
    } as RequestState<Invoice[]>,
  },
};

export const DraftOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceDraft],
    } as RequestState<Invoice[]>,
  },
};

export const SentOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceSent],
    } as RequestState<Invoice[]>,
  },
};

export const PaidOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoicePaid],
    } as RequestState<Invoice[]>,
  },
};

export const VoidOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceVoid],
    } as RequestState<Invoice[]>,
  },
};

// ============================================================
// INTERACTION TESTS — action visibility by status
// ============================================================

export const DraftExposesSendEditVoidDelete: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceDraft],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /send invoice/i })
      ).toBeInTheDocument();
    });
    expect(
      canvas.getByRole('button', { name: /edit invoice/i })
    ).toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: /void invoice/i })
    ).toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: /delete invoice/i })
    ).toBeInTheDocument();
    // Mark paid not available on a draft
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
  },
};

export const SentExposesMarkPaidEditVoidButNotDelete: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceSent],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /mark invoice paid/i })
      ).toBeInTheDocument();
    });
    expect(
      canvas.getByRole('button', { name: /edit invoice/i })
    ).toBeInTheDocument();
    expect(
      canvas.getByRole('button', { name: /void invoice/i })
    ).toBeInTheDocument();
    // No delete / send on sent
    expect(
      canvas.queryByRole('button', { name: /send invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

export const PaidExposesVoidOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoicePaid],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /void invoice/i })
      ).toBeInTheDocument();
    });
    expect(
      canvas.queryByRole('button', { name: /edit invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /send invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

export const VoidIsReadOnly: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceVoid],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // No actions on voided invoices
    expect(
      canvas.queryByRole('button', { name: /send invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /edit invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /void invoice/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

// ============================================================
// INTERACTION TESTS — action wiring
// ============================================================

export const SendButtonCallsOnSend: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceDraft],
    } as RequestState<Invoice[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /send invoice/i })
    );
    await waitFor(() => {
      expect(args.onSend).toHaveBeenCalledTimes(1);
      expect(args.onSend).toHaveBeenCalledWith(mockInvoiceDraft);
    });
  },
};

export const MarkPaidCallsOnMarkPaid: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceSent],
    } as RequestState<Invoice[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /mark invoice paid/i })
    );
    await waitFor(() => {
      expect(args.onMarkPaid).toHaveBeenCalledTimes(1);
      expect(args.onMarkPaid).toHaveBeenCalledWith(mockInvoiceSent);
    });
  },
};

export const TotalFormattedAsDollars: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceMultiLine],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      // $18750 cents → $187.50
      expect(canvas.getByText('$187.50')).toBeInTheDocument();
    });
  },
};

// ============================================================
// INTERACTION TESTS — payment attribution + sync error (added in #281)
// ============================================================

export const PaidViaSquareBadge: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoicePaid],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/paid via square/i)).toBeInTheDocument();
    });
    // Manual badge should NOT appear for a Square-paid invoice
    expect(canvas.queryByText(/marked paid manually/i)).toBeNull();
  },
};

export const PaidManuallyBadge: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoicePaidManually],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/marked paid manually/i)).toBeInTheDocument();
    });
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
  },
};

export const SquareSyncErrorBadge: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceSyncError],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/square sync failed/i)).toBeInTheDocument();
    });
  },
};

export const PaymentBadgeAbsentOnDraftAndSent: Story = {
  args: {
    invoicesState: {
      status: 'success',
      data: [mockInvoiceDraft, mockInvoiceSent],
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
    expect(canvas.queryByText(/marked paid manually/i)).toBeNull();
  },
};
