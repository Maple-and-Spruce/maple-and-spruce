import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, waitFor, within } from 'storybook/test';
import { BillingTable } from './BillingTable';
import {
  mockInvoiceDraft,
  mockInvoiceSent,
  mockInvoicePaid,
  mockInvoicePaidManually,
  mockInvoicePaidViaVenmo,
  mockInvoiceVoid,
  mockInvoiceMultiLine,
  mockInvoiceSyncError,
  mockLessons,
  mockLessonUpcomingSingle,
  mockLessonUpcomingSeries,
  mockLessonUpcomingSubstitute,
  mockLessonPastRendered,
} from '@maple/react/storybook-fixtures';
import type {
  Invoice,
  LessonScheduledCharge,
  RequestState,
} from '@maple/ts/domain';

const NOW = new Date('2026-05-01T10:00:00Z');
const DAY = 86_400_000;

let seq = 0;
function charge(
  over: Partial<LessonScheduledCharge> = {}
): LessonScheduledCharge {
  seq++;
  return {
    id: `chg-story-${seq}`,
    studentId: 'student-001',
    ruleId: 'rule-standard',
    lessonIds: [
      mockLessonPastRendered.id,
      mockLessonUpcomingSingle.id,
      mockLessonUpcomingSeries.id,
      mockLessonUpcomingSubstitute.id,
    ],
    amountCents: 16500,
    dueAt: new Date(NOW.getTime() + 3 * DAY),
    status: 'scheduled',
    idempotencyKey: `lesson-chg-story-${seq}`,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const upcomingBlock = charge({ id: 'chg-upcoming' });
/** Taken on the spot (legacy #864) — carries the manual rule id sentinel. */
const manualPrepay = charge({
  id: 'chg-manual',
  ruleId: 'manual',
  status: 'paid',
  amountCents: 8250,
  lessonIds: [mockLessonUpcomingSingle.id, mockLessonUpcomingSeries.id],
  dueAt: new Date(NOW.getTime() - 2 * DAY),
  squarePaymentId: 'SQ-PAYMENT-manual',
});
const failedBlock = charge({
  id: 'chg-failed',
  status: 'failed',
  lastError: 'Card declined',
  dueAt: new Date(NOW.getTime() - 5 * DAY),
});

const invoices = (data: Invoice[]) =>
  ({ status: 'success', data }) as RequestState<Invoice[]>;
const charges = (data: LessonScheduledCharge[]) =>
  ({ status: 'success', data }) as RequestState<LessonScheduledCharge[]>;

const meta = {
  component: BillingTable,
  title: 'Invoices/BillingTable',
  parameters: { layout: 'padded' },
  args: {
    invoicesState: invoices([]),
    chargesState: charges([]),
    lessons: mockLessons,
    onEditInvoice: fn(),
    onSendInvoice: fn(),
    onRecordPayment: fn(),
    onVoidInvoice: fn(),
    onDeleteInvoice: fn(),
    onCancelCharge: fn(),
    onWaiveCharge: fn(),
    onNewInvoice: fn(),
    // The invoice action stories below include paid and void rows, which are
    // settled. Show them so each keeps asserting what InvoiceList did; the
    // "SETTLED SWITCH" stories turn this back off to test the real default.
    defaultShowSettled: true,
  },
} satisfies Meta<typeof BillingTable>;

export default meta;
type Story = StoryObj<typeof BillingTable>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Loading: Story = {
  args: {
    invoicesState: { status: 'loading' } as RequestState<Invoice[]>,
    chargesState: { status: 'loading' } as RequestState<
      LessonScheduledCharge[]
    >,
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

export const Empty: Story = {};

/** What Katie sees by default: only what still needs something. */
export const Mixed: Story = {
  args: {
    defaultShowSettled: false,
    invoicesState: invoices([
      mockInvoiceDraft,
      mockInvoiceSent,
      mockInvoicePaid,
      mockInvoiceVoid,
    ]),
    chargesState: charges([upcomingBlock, manualPrepay, failedBlock]),
  },
};

export const MixedWithHistory: Story = {
  args: {
    ...Mixed.args,
    defaultShowSettled: true,
  },
};

// ============================================================
// SETTLED SWITCH
// ============================================================

/**
 * Paid, void, cancelled and waived rows are history, hidden until asked for —
 * the same bargain as past lessons on the lessons table.
 */
export const SettledHiddenUntilSwitchedOn: Story = {
  args: {
    defaultShowSettled: false,
    invoicesState: invoices([mockInvoiceSent, mockInvoicePaid]),
    chargesState: charges([manualPrepay]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await canvas.findByRole('button', { name: /mark invoice paid/i });
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
    expect(canvas.queryByText('Manual charge')).toBeNull();

    // The switch says how much it is hiding.
    const toggle = canvas.getByLabelText(/show paid & closed \(2\)/i);
    await userEvent.click(toggle);

    expect(await canvas.findByText(/paid via square/i)).toBeInTheDocument();
    expect(canvas.getByText('Manual charge')).toBeInTheDocument();
  },
};

/**
 * A failed charge is money earned and not collected. It is never "settled",
 * so it never hides behind the switch, and it is called out above the table.
 */
export const FailedChargeNeverHides: Story = {
  args: {
    defaultShowSettled: false,
    chargesState: charges([failedBlock]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/card declined/i)).toBeInTheDocument();
    expect(
      canvas.getByText(/1 charge failed, totalling \$165\.00/i)
    ).toBeInTheDocument();
  },
};

// ============================================================
// RETRY (legacy #864)
// ============================================================

/**
 * A failed charge is retried from its own row. The retry reuses the original
 * charge, so it calls back with that charge's id rather than planning anew.
 */
export const RetryFailedChargeCallsOnRetry: Story = {
  args: {
    chargesState: charges([failedBlock]),
    onRetryCharge: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /retry charge/i })
    );
    await waitFor(() => {
      expect(args.onRetryCharge).toHaveBeenCalledWith('chg-failed');
    });
  },
};

/** A scheduled charge is stopped, not retried, and a paid one is done. */
export const RetryOnlyOnFailedCharges: Story = {
  args: {
    chargesState: charges([upcomingBlock, manualPrepay]),
    onRetryCharge: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Automatic charge');
    expect(canvas.queryByRole('button', { name: /retry charge/i })).toBeNull();
  },
};

/** The /lesson-billing overview may not wire retry; then there is no button. */
export const RetryHiddenWithoutHandler: Story = {
  args: { chargesState: charges([failedBlock]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/card declined/i);
    expect(canvas.queryByRole('button', { name: /retry charge/i })).toBeNull();
  },
};

/** A retry in flight cannot be pressed twice. */
export const PendingRetryIsDisabled: Story = {
  args: {
    chargesState: charges([failedBlock]),
    onRetryCharge: fn(),
    chargePendingId: 'chg-failed',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole('button', { name: /retry charge/i })
    ).toBeDisabled();
  },
};

// ============================================================
// CHARGES
// ============================================================

/**
 * A block charge is ONE row with ONE amount. Repeating $165.00 on four lesson
 * rows would read as four charges (#84).
 */
export const BlockChargeIsOneRow: Story = {
  args: {
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('4 lessons')).toBeInTheDocument();
    expect(canvas.getAllByText('$165.00')).toHaveLength(1);
    expect(canvas.getByText('Automatic charge')).toBeInTheDocument();
  },
};

export const ManualAndAutomaticChargesAreLabelled: Story = {
  args: {
    chargesState: charges([upcomingBlock, manualPrepay]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Automatic charge')).toBeInTheDocument();
    expect(canvas.getByText('Manual charge')).toBeInTheDocument();
  },
};

export const CancelChargeCallsOnCancel: Story = {
  args: {
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /cancel charge/i })
    );
    await waitFor(() => {
      expect(args.onCancelCharge).toHaveBeenCalledWith('chg-upcoming');
    });
  },
};

/** A waiver takes a reason, so a comped block still makes sense later. */
export const WaiveChargeAsksWhy: Story = {
  args: {
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /waive charge/i })
    );

    const dialog = within(await screen.findByRole('dialog'));
    const confirm = dialog.getByRole('button', { name: /waive \$165\.00/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(dialog.getByLabelText(/reason/i), 'Makeup lesson');
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(args.onWaiveCharge).toHaveBeenCalledWith(
        'chg-upcoming',
        'Makeup lesson'
      );
    });
  },
};

/** Once the money has moved there is nothing left to stop. */
export const PaidChargeHasNoActions: Story = {
  args: {
    chargesState: charges([manualPrepay]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Manual charge');
    expect(canvas.queryByRole('button', { name: /waive charge/i })).toBeNull();
    expect(canvas.queryByRole('button', { name: /cancel charge/i })).toBeNull();
  },
};

// ============================================================
// TABLE BEHAVIOUR: default sort and pinning (#88)
// ============================================================

/** Opens in date order, oldest first, invoices and charges interleaved. */
export const OpensSortedByDate: Story = {
  args: {
    invoicesState: invoices([mockInvoiceDraft, mockInvoicePaid]),
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Automatic charge');

    const types = canvas
      .getAllByRole('row')
      .slice(1)
      .map((row) => {
        const text = row.textContent ?? '';
        if (text.includes('Automatic charge')) return 'charge';
        if (text.includes('paid')) return 'paid-invoice';
        return 'draft-invoice';
      });

    // Paid in March, drafted May 1, charge due May 4.
    expect(types).toEqual(['paid-invoice', 'draft-invoice', 'charge']);
  },
};

/**
 * The date pins left and the actions pin right, with the same two fixes as
 * /students: pinned cells fully opaque, and painted the same white as the
 * scrolling ones. Carried here from StudentList's story because the options
 * now come from the shared wrapper, and a regression there breaks every table.
 */
export const PinsDateLeftAndActionsRight: Story = {
  args: {
    invoicesState: invoices([mockInvoiceSent]),
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const position = async (name: RegExp) =>
      getComputedStyle(await canvas.findByRole('columnheader', { name }))
        .position;

    expect(await position(/^Date/)).toBe('sticky');
    expect(await position(/^Actions/)).toBe('sticky');
    expect(await position(/^Covers/)).not.toBe('sticky');

    const doc = canvasElement.ownerDocument;
    const pinnedCell = doc.querySelector(
      '.MuiTableContainer-root tbody td[data-pinned="true"]'
    );
    const scrollingCell = doc.querySelector(
      '.MuiTableContainer-root tbody td:not([data-pinned="true"])'
    );
    expect(pinnedCell).toBeTruthy();
    expect(getComputedStyle(pinnedCell as Element).opacity).toBe('1');

    const channels = (c: string) =>
      (c.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const pinnedRgb = channels(
      getComputedStyle(pinnedCell as Element, '::before').backgroundColor
    );
    const scrollingRgb = channels(
      getComputedStyle(scrollingCell as Element).backgroundColor
    );
    expect(pinnedRgb).toHaveLength(3);
    pinnedRgb.forEach((value, i) => {
      expect(Math.abs(value - scrollingRgb[i])).toBeLessThanOrEqual(8);
    });
  },
};

// ============================================================
// INVOICES — action visibility by status (carried from InvoiceList)
// ============================================================

export const DraftExposesSendEditVoidDelete: Story = {
  args: { invoicesState: invoices([mockInvoiceDraft]) },
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
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
  },
};

export const SentExposesMarkPaidEditVoidButNotDelete: Story = {
  args: { invoicesState: invoices([mockInvoiceSent]) },
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
    expect(canvas.queryByRole('button', { name: /send invoice/i })).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

export const PaidExposesVoidOnly: Story = {
  args: { invoicesState: invoices([mockInvoicePaid]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /void invoice/i })
      ).toBeInTheDocument();
    });
    expect(canvas.queryByRole('button', { name: /edit invoice/i })).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
    expect(canvas.queryByRole('button', { name: /send invoice/i })).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

export const VoidIsReadOnly: Story = {
  args: { invoicesState: invoices([mockInvoiceVoid]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Invoice');
    expect(canvas.queryByRole('button', { name: /send invoice/i })).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /mark invoice paid/i })
    ).toBeNull();
    expect(canvas.queryByRole('button', { name: /edit invoice/i })).toBeNull();
    expect(canvas.queryByRole('button', { name: /void invoice/i })).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /delete invoice/i })
    ).toBeNull();
  },
};

// ============================================================
// INVOICES — action wiring
// ============================================================

export const SendButtonCallsOnSend: Story = {
  args: { invoicesState: invoices([mockInvoiceDraft]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /send invoice/i })
    );
    await waitFor(() => {
      expect(args.onSendInvoice).toHaveBeenCalledTimes(1);
      expect(args.onSendInvoice).toHaveBeenCalledWith(mockInvoiceDraft);
    });
  },
};

export const MarkPaidMenuRecordsVenmo: Story = {
  args: { invoicesState: invoices([mockInvoiceSent]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /mark invoice paid/i })
    );
    // MUI Menu portals to document.body — query via screen, not the canvas.
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /paid via venmo/i })
    );
    await waitFor(() => {
      expect(args.onRecordPayment).toHaveBeenCalledWith(
        mockInvoiceSent,
        'venmo-manual'
      );
    });
  },
};

export const MarkPaidMenuRecordsCashOrCheck: Story = {
  args: { invoicesState: invoices([mockInvoiceSent]) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /mark invoice paid/i })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /cash, check, or other/i })
    );
    await waitFor(() => {
      expect(args.onRecordPayment).toHaveBeenCalledWith(
        mockInvoiceSent,
        'admin-manual'
      );
    });
  },
};

export const NewInvoiceButtonCallsOnNewInvoice: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /new invoice/i })
    );
    await waitFor(() => {
      expect(args.onNewInvoice).toHaveBeenCalledTimes(1);
    });
  },
};

export const TotalFormattedAsDollars: Story = {
  args: { invoicesState: invoices([mockInvoiceMultiLine]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('$187.50')).toBeInTheDocument();
  },
};

// ============================================================
// INVOICES — payment attribution + sync error (legacy #281)
// ============================================================

export const PaidViaSquareBadge: Story = {
  args: { invoicesState: invoices([mockInvoicePaid]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/paid via square/i)).toBeInTheDocument();
    expect(canvas.queryByText(/marked paid manually/i)).toBeNull();
  },
};

export const PaidManuallyBadge: Story = {
  args: { invoicesState: invoices([mockInvoicePaidManually]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/marked paid manually/i)
    ).toBeInTheDocument();
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
  },
};

export const PaidViaVenmoBadge: Story = {
  args: { invoicesState: invoices([mockInvoicePaidViaVenmo]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/paid via venmo/i)).toBeInTheDocument();
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
    expect(canvas.queryByText(/marked paid manually/i)).toBeNull();
  },
};

export const SquareSyncErrorBadge: Story = {
  args: { invoicesState: invoices([mockInvoiceSyncError]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/square sync failed/i)).toBeInTheDocument();
  },
};

// ============================================================
// STATES: loading, errors, in-flight
// ============================================================

export const LoadingShowsSkeletons: Story = {
  args: {
    invoicesState: { status: 'loading' } as RequestState<Invoice[]>,
    chargesState: charges([]),
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector('.MuiSkeleton-root')).toBeTruthy();
    });
  },
};

/** Invoices can load while charges fail; the failure must still be said. */
export const ChargesLoadErrorIsShown: Story = {
  args: {
    invoicesState: invoices([mockInvoiceSent]),
    chargesState: {
      status: 'error',
      error: 'Permission denied',
    } as RequestState<LessonScheduledCharge[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/failed to load charges: permission denied/i)
    ).toBeInTheDocument();
    // The invoices that did load are still usable.
    expect(
      canvas.getByRole('button', { name: /mark invoice paid/i })
    ).toBeInTheDocument();
  },
};

export const InvoicesLoadErrorIsShown: Story = {
  args: {
    invoicesState: {
      status: 'error',
      error: 'Failed to fetch invoices.',
    } as RequestState<Invoice[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/failed to load invoices/i)
    ).toBeInTheDocument();
  },
};

/** A stop that failed at the server is shown, not swallowed. */
export const ActionErrorIsShown: Story = {
  args: {
    chargesState: charges([upcomingBlock]),
    error: 'Could not stop that charge',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText('Could not stop that charge')
    ).toBeInTheDocument();
  },
};

/**
 * While one charge is being stopped its buttons are disabled, so a second
 * click cannot race the first. Other charges stay live.
 */
export const PendingChargeDisablesOnlyItsOwnButtons: Story = {
  args: {
    chargesState: charges([
      upcomingBlock,
      charge({ id: 'chg-next', dueAt: new Date(NOW.getTime() + 10 * DAY) }),
    ]),
    chargePendingId: 'chg-upcoming',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/may 4, 2026/i);

    const rowFor = (date: RegExp) =>
      within(
        canvas.getAllByRole('row').find((r) => date.test(r.textContent ?? ''))!
      );

    const pending = rowFor(/may 4, 2026/i);
    expect(pending.getByRole('button', { name: /waive charge/i })).toBeDisabled();
    expect(
      pending.getByRole('button', { name: /cancel charge/i })
    ).toBeDisabled();

    const other = rowFor(/may 11, 2026/i);
    expect(other.getByRole('button', { name: /waive charge/i })).toBeEnabled();
    expect(other.getByRole('button', { name: /cancel charge/i })).toBeEnabled();
  },
};

/** Backing out of a waiver waives nothing. */
export const WaiveBackDoesNothing: Story = {
  args: {
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /waive charge/i })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText(/reason/i), 'Changed my mind');
    await userEvent.click(dialog.getByRole('button', { name: /^back$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(args.onWaiveCharge).not.toHaveBeenCalled();
    expect(args.onCancelCharge).not.toHaveBeenCalled();
  },
};

// ============================================================
// WHAT A ROW SAYS
// ============================================================

/**
 * The Covers column gives the span of lessons a charge pays for, and the date
 * says what kind of date it is.
 */
export const CoversAndDateCaptions: Story = {
  args: {
    invoicesState: invoices([mockInvoicePaid, mockInvoiceDraft]),
    chargesState: charges([upcomingBlock, manualPrepay]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // upcomingBlock covers Apr 26 through May 24.
    expect(await canvas.findAllByText('Apr 26 – May 24')).not.toHaveLength(0);
    // manualPrepay covers two lessons.
    expect(canvas.getByText('May 10 – May 17')).toBeInTheDocument();
    // An invoice without lesson lines counts its lines instead.
    expect(canvas.getAllByText('1 line').length).toBe(2);

    expect(canvas.getByText('Sent · paid Mar 25')).toBeInTheDocument();
    expect(canvas.getByText('Drafted')).toBeInTheDocument();
    expect(canvas.getByText('Due')).toBeInTheDocument();
    expect(canvas.getByText('Charged')).toBeInTheDocument();
  },
};

// ============================================================
// RE-SORTING
// ============================================================

/** Any sortable column re-sorts on click, and a second click reverses it. */
export const ClickingAmountResorts: Story = {
  args: {
    invoicesState: invoices([mockInvoiceSent, mockInvoiceMultiLine]),
    chargesState: charges([upcomingBlock]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Automatic charge');

    const amounts = () =>
      canvas
        .getAllByRole('row')
        .slice(1)
        .map((row) => Number((row.textContent ?? '').match(/\$([\d.]+)/)?.[1]));

    const header = canvas.getByRole('columnheader', { name: /amount/i });
    await userEvent.click(within(header).getByText('Amount'));

    let first: number[] = [];
    await waitFor(() => {
      first = amounts();
      const asc = [...first].sort((a, b) => a - b);
      const desc = [...asc].reverse();
      expect(
        JSON.stringify(first) === JSON.stringify(asc) ||
          JSON.stringify(first) === JSON.stringify(desc)
      ).toBe(true);
    });

    await userEvent.click(within(header).getByText('Amount'));
    await waitFor(() => {
      expect(amounts()).toEqual([...first].reverse());
    });
  },
};

export const PaymentBadgeAbsentOnDraftAndSent: Story = {
  args: { invoicesState: invoices([mockInvoiceDraft, mockInvoiceSent]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /send invoice/i });
    expect(canvas.queryByText(/paid via square/i)).toBeNull();
    expect(canvas.queryByText(/marked paid manually/i)).toBeNull();
  },
};
