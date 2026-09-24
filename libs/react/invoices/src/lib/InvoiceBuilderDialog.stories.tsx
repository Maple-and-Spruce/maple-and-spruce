import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { InvoiceBuilderDialog } from './InvoiceBuilderDialog';
import type { Invoice, LessonScheduledCharge } from '@maple/ts/domain';
import {
  mockInvoiceDraft,
  mockInvoiceMultiLine,
  mockLessonPastRendered,
  mockLessonPastScheduled,
  mockLessonUpcomingSingle,
} from '@maple/react/storybook-fixtures';

const lessons = [
  mockLessonPastRendered,
  mockLessonPastScheduled,
  mockLessonUpcomingSingle,
];

const meta = {
  component: InvoiceBuilderDialog,
  title: 'Invoices/InvoiceBuilderDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    onClose: fn(),
    onCreate: fn().mockResolvedValue(undefined),
    onUpdate: fn().mockResolvedValue(undefined),
    studentId: 'student-001',
    lessons,
  },
} satisfies Meta<typeof InvoiceBuilderDialog>;

const waitForDialog = async () => {
  const canvas = within(document.body);
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
      // At least one description input rendered (edit mode may have many)
      expect(canvas.getAllByLabelText(/description/i).length).toBeGreaterThan(
        0
      );
    },
    { timeout: 3000 }
  );
  return canvas;
};

export default meta;
type Story = StoryObj<typeof InvoiceBuilderDialog>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Closed: Story = {
  args: { open: false },
};

export const CreateMode: Story = {
  args: { open: true },
};

export const EditMode: Story = {
  args: { open: true, invoice: mockInvoiceDraft },
};

export const EditMultiLine: Story = {
  args: { open: true, invoice: mockInvoiceMultiLine },
};

export const Submitting: Story = {
  args: { open: true, isSubmitting: true },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const CreateDraftWithTypedLine: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Type into the initial blank line
    const description = canvas.getByLabelText(/description/i);
    await userEvent.type(description, 'April tuition');

    // Qty input (number, default 1)
    const qty = canvas.getByLabelText(/^qty$/i);
    await userEvent.clear(qty);
    await userEvent.type(qty, '4');

    const rate = canvas.getByLabelText(/^rate$/i);
    await userEvent.type(rate, '32.50');

    await userEvent.click(
      canvas.getByRole('button', { name: /create draft/i })
    );

    await waitFor(() => {
      expect(args.onCreate).toHaveBeenCalledTimes(1);
      const arg = (args.onCreate as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.studentId).toBe('student-001');
      expect(arg.lineItems.length).toBe(1);
      expect(arg.lineItems[0].description).toBe('April tuition');
      expect(arg.lineItems[0].quantity).toBe(4);
      expect(arg.lineItems[0].unitAmountCents).toBe(3250);
    });
  },
};

export const ValidationBlocksEmptyDescription: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Submit without filling anything
    await userEvent.click(
      canvas.getByRole('button', { name: /create draft/i })
    );

    const dialog = within(canvas.getByRole('dialog'));
    await waitFor(() => {
      // Error alert surfaces
      expect(
        dialog.getByText(/description/i, { selector: 'div, p' })
      ).toBeInTheDocument();
    });

    await expect(args.onCreate).not.toHaveBeenCalled();
  },
};

export const AddBlankLineAppendsRow: Story = {
  args: { open: true },
  play: async () => {
    const canvas = await waitForDialog();

    // Starts with one description field
    expect(canvas.getAllByLabelText(/description/i).length).toBe(1);

    await userEvent.click(
      canvas.getByRole('button', { name: /^add line$/i })
    );

    await waitFor(() => {
      expect(canvas.getAllByLabelText(/description/i).length).toBe(2);
    });
  },
};

export const RemoveLineButton: Story = {
  args: { open: true, invoice: mockInvoiceMultiLine },
  play: async () => {
    const canvas = await waitForDialog();

    // Three lines expected
    await waitFor(() => {
      expect(canvas.getAllByLabelText(/description/i).length).toBe(3);
    });

    // Remove the first one
    const removeButtons = canvas.getAllByRole('button', {
      name: /remove line/i,
    });
    await userEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(canvas.getAllByLabelText(/description/i).length).toBe(2);
    });
  },
};

export const AddFromLessonPicker: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Open the lesson picker popover
    await userEvent.click(
      canvas.getByRole('button', { name: /add from lesson/i })
    );

    const popover = within(document.body);
    // Pick the first lesson checkbox inside the popover (2 past lessons shown)
    const lessonCheckboxes = await waitFor(() => {
      const boxes = popover.getAllByRole('checkbox');
      expect(boxes.length).toBeGreaterThan(0);
      return boxes;
    });
    await userEvent.click(lessonCheckboxes[0]);

    await userEvent.click(
      popover.getByRole('button', { name: /add selected/i })
    );

    // A new line was inserted from the lesson — expect 2 descriptions now
    await waitFor(() => {
      expect(canvas.getAllByLabelText(/description/i).length).toBe(2);
    });

    // Fill the typed line so submission works
    const descs = canvas.getAllByLabelText(/description/i);
    await userEvent.type(descs[0], 'Monthly tuition');
    const rate = canvas.getAllByLabelText(/^rate$/i)[0];
    await userEvent.type(rate, '130');

    // Fill the lesson-inserted line's rate
    const rates = canvas.getAllByLabelText(/^rate$/i);
    await userEvent.type(rates[1], '32.50');

    await userEvent.click(
      canvas.getByRole('button', { name: /create draft/i })
    );

    await waitFor(() => {
      expect(args.onCreate).toHaveBeenCalledTimes(1);
      const arg = (args.onCreate as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.lineItems.length).toBe(2);
      // The second line was created from a lesson, so it carries the lessonId
      expect(arg.lineItems[1].lessonId).toBeDefined();
    });
  },
};

export const RunningTotalUpdatesLive: Story = {
  args: { open: true },
  play: async () => {
    const canvas = await waitForDialog();

    const description = canvas.getByLabelText(/description/i);
    await userEvent.type(description, 'April tuition');
    const qty = canvas.getByLabelText(/^qty$/i);
    await userEvent.clear(qty);
    await userEvent.type(qty, '4');
    const rate = canvas.getByLabelText(/^rate$/i);
    await userEvent.type(rate, '32.50');

    const dialog = within(canvas.getByRole('dialog'));
    await waitFor(() => {
      // Subtotal for the single line: $130.00
      expect(dialog.getByDisplayValue('$130.00')).toBeInTheDocument();
      // Running total heading in the footer area
      expect(dialog.getByText('$130.00')).toBeInTheDocument();
    });
  },
};

export const CancelButtonClosesDialog: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(canvas.getByRole('button', { name: /^cancel$/i }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const EditModeSubmitsViaOnUpdate: Story = {
  args: { open: true, invoice: mockInvoiceDraft },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(
      canvas.getByRole('button', { name: /save changes/i })
    );
    await waitFor(() => {
      expect(args.onUpdate).toHaveBeenCalledTimes(1);
      const arg = (args.onUpdate as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.id).toBe(mockInvoiceDraft.id);
    });
  },
};

// ============================================================
// THE LESSON PICKER KNOWS WHAT IS ALREADY BILLED (#110)
// ============================================================

const NOW = new Date('2026-05-01T12:00:00Z');

/** A charge covering one lesson, in whichever state the story needs. */
function chargeFor(
  lessonId: string,
  status: LessonScheduledCharge['status']
): LessonScheduledCharge {
  return {
    id: `chg-${lessonId}`,
    studentId: 'student-001',
    ruleId: 'manual',
    lessonIds: [lessonId],
    amountCents: 3000,
    dueAt: new Date('2026-04-25T12:00:00Z'),
    status,
    idempotencyKey: 'lc-0000000000000001',
    // Deliberately a different day from `dueAt`: the paid label must name the
    // day the money moved, not the day it was owed.
    resolvedAt: new Date('2026-04-27T12:00:00Z'),
    createdAt: NOW,
    updatedAt: NOW,
  } as LessonScheduledCharge;
}

function invoiceFor(lessonId: string, status: Invoice['status']): Invoice {
  return {
    id: `inv-${lessonId}`,
    studentId: 'student-001',
    status,
    lineItems: [
      {
        id: 'line-1',
        description: '30-min lesson',
        lessonId,
        quantity: 1,
        unitAmountCents: 3000,
        subtotalCents: 3000,
      },
    ],
    totalCents: 3000,
    createdAt: NOW,
    updatedAt: NOW,
  } as Invoice;
}

const openPicker = async () => {
  const canvas = await waitForDialog();
  await userEvent.click(
    canvas.getByRole('button', { name: /add from lesson/i })
  );
  return canvas;
};

/**
 * A lesson a card charge already paid for cannot be invoiced as well — that is
 * the same double-ask #101 closed on the charge side, in the other direction.
 * It stays visible and says why, because a date disappearing from the list is
 * its own kind of confusing.
 */
export const PickerBlocksAnAlreadyPaidLesson: Story = {
  args: {
    open: true,
    charges: [chargeFor(mockLessonPastRendered.id, 'paid')],
  },
  play: async () => {
    const canvas = await openPicker();

    await expect(await canvas.findByText('Paid Mon, Apr 27')).toBeInTheDocument();

    const boxes = canvas
      .getAllByRole('checkbox')
      .filter((b) => (b as HTMLInputElement).disabled);
    await expect(boxes.length).toBe(1);
  },
};

/** A charge still to be taken has already asked for the money. */
export const PickerBlocksALessonWithAChargeComing: Story = {
  args: {
    open: true,
    charges: [chargeFor(mockLessonPastScheduled.id, 'scheduled')],
  },
  play: async () => {
    const canvas = await openPicker();
    await expect(
      await canvas.findByText(/On a charge due Sat, Apr 25/)
    ).toBeInTheDocument();
  },
};

/**
 * A waived block says so and stays choosable, on purpose.
 *
 * Nothing is going to collect on a waived or cancelled charge, so a fresh
 * invoice is not a double-collect — and blocking it would be a dead end, since
 * waiving or cancelling is the documented way out of a **failed** charge (#102).
 * A declined card would otherwise mean the lesson could never be billed at all.
 * The label is what makes the second ask a decision rather than an accident.
 */
export const PickerLabelsAWaivedLessonButStillOffersIt: Story = {
  args: {
    open: true,
    charges: [chargeFor(mockLessonPastRendered.id, 'waived')],
  },
  play: async () => {
    const canvas = await openPicker();
    await expect(await canvas.findByText('Not charged for')).toBeInTheDocument();
    const disabled = canvas
      .getAllByRole('checkbox')
      .filter((b) => (b as HTMLInputElement).disabled);
    await expect(disabled.length).toBe(0);
  },
};

/**
 * The whole point of the previous story, end to end: a charge that failed and
 * was then cancelled leaves the lesson billable, so the money is still
 * collectable by invoice.
 */
export const PickerStillOffersALessonWhoseChargeWasCancelled: Story = {
  args: {
    open: true,
    charges: [chargeFor(mockLessonPastRendered.id, 'cancelled')],
  },
  play: async () => {
    const canvas = await openPicker();
    await expect(await canvas.findByText('Not charged for')).toBeInTheDocument();

    const boxes = canvas.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await expect(
      canvas.getByRole('button', { name: /add selected/i })
    ).toBeEnabled();
  },
};

/** A failed charge still holds the lesson: the way out is through that charge. */
export const PickerBlocksALessonWithAFailedCharge: Story = {
  args: {
    open: true,
    charges: [chargeFor(mockLessonPastRendered.id, 'failed')],
  },
  play: async () => {
    const canvas = await openPicker();
    // Not "Charge due" — it failed, and the label must not imply it is merely
    // pending.
    await expect(
      await canvas.findByText(/On a charge due Sat, Apr 25/)
    ).toBeInTheDocument();
    const disabled = canvas
      .getAllByRole('checkbox')
      .filter((b) => (b as HTMLInputElement).disabled);
    await expect(disabled.length).toBe(1);
  },
};

/** A lesson already on another invoice, named with that invoice's status. */
export const PickerBlocksALessonOnAnotherInvoice: Story = {
  args: {
    open: true,
    invoices: [invoiceFor(mockLessonPastRendered.id, 'sent')],
  },
  play: async () => {
    const canvas = await openPicker();
    await expect(
      await canvas.findByText('On an invoice (sent)')
    ).toBeInTheDocument();
  },
};

/** A voided invoice is a cancelled ask, so its lesson is offerable again. */
export const PickerOffersALessonWhoseInvoiceWasVoided: Story = {
  args: {
    open: true,
    invoices: [invoiceFor(mockLessonPastRendered.id, 'void')],
  },
  play: async () => {
    const canvas = await openPicker();
    const disabled = canvas
      .getAllByRole('checkbox')
      .filter((b) => (b as HTMLInputElement).disabled);
    await expect(disabled.length).toBe(0);
  },
};

/** With nothing billed, every lesson is choosable and nothing is labelled. */
export const PickerOffersEverythingWhenNothingIsBilled: Story = {
  args: { open: true },
  play: async () => {
    const canvas = await openPicker();
    const disabled = canvas
      .getAllByRole('checkbox')
      .filter((b) => (b as HTMLInputElement).disabled);
    await expect(disabled.length).toBe(0);
    await expect(canvas.queryByText(/^Paid /)).not.toBeInTheDocument();
  },
};

/**
 * A lesson already added as a line cannot be added twice, and the live draft is
 * what decides that — not the saved invoice. Removing the line must make the
 * lesson choosable again, which it cannot do if the check reads the stored copy.
 */
export const PickerBlocksALessonAlreadyAddedAsALine: Story = {
  args: { open: true },
  play: async () => {
    const canvas = await openPicker();

    const boxes = canvas.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(canvas.getByRole('button', { name: /add selected/i }));

    await userEvent.click(
      canvas.getByRole('button', { name: /add from lesson/i })
    );
    await expect(
      await canvas.findByText('Already a line below')
    ).toBeInTheDocument();
  },
};
