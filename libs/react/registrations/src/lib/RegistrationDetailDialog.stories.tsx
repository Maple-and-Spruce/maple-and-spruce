import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Registration } from '@maple/ts/domain';
import { mockRegistrationConfirmed } from '@maple/react/storybook-fixtures';
import { RegistrationDetailDialog } from './RegistrationDetailDialog';

/**
 * Cancelling a registration, and what happens to the money (#144). All
 * people are invented.
 */

/** A POS registration whose sale Square refunded in part, flagged to check. */
const flaggedPosRegistration: Registration = {
  ...mockRegistrationConfirmed,
  id: 'reg-pos-1',
  source: 'pos',
  pricePaidCents: 6360,
  refundReviewAt: new Date('2026-10-15T15:00:00Z'),
  refundReviewAmountCents: 2000,
  refundReviewId: 'rf-1',
};

const meta = {
  component: RegistrationDetailDialog,
  title: 'Registrations/RegistrationDetailDialog',
  args: {
    open: true,
    onClose: fn(),
    registration: mockRegistrationConfirmed,
    className: 'Wheel Pottery',
    onCancel: fn(async (id: string) => ({
      registration: { ...mockRegistrationConfirmed, id, status: 'refunded' as const },
    })),
    onUpdateNotes: fn(async () => undefined),
  },
} satisfies Meta<typeof RegistrationDetailDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The dialog renders in a portal, so query the whole document. */
const screen = () => within(document.body);

async function openCancel(): Promise<void> {
  await userEvent.click(
    await screen().findByRole('button', { name: 'Cancel Registration' })
  );
}

/** A paid registration defaults to refunding through Square. */
export const RefundByDefault: Story = {
  play: async ({ args }) => {
    await openCancel();
    await expect(
      screen().getByRole('radio', { name: 'Issue refund of $79.50' })
    ).toBeChecked();
    await userEvent.click(screen().getByRole('button', { name: 'Confirm Cancel' }));
    await waitFor(() =>
      expect(args.onCancel).toHaveBeenCalledWith('reg-001', true, false)
    );
  },
};

/** Recording a refund made in the Square dashboard: no second refund. */
export const AlreadyRefundedInSquare: Story = {
  play: async ({ args }) => {
    await openCancel();
    await userEvent.click(
      screen().getByRole('radio', { name: /Already refunded in Square/ })
    );
    await userEvent.click(screen().getByRole('button', { name: 'Confirm Cancel' }));
    await waitFor(() =>
      expect(args.onCancel).toHaveBeenCalledWith('reg-001', false, true)
    );
    await expect(
      await screen().findByText('Registration cancelled and recorded as refunded in Square')
    ).toBeInTheDocument();
  },
};

/** A flagged refund preselects "already refunded" and shows its amount. */
export const FlaggedRefund: Story = {
  args: { registration: flaggedPosRegistration },
  play: async ({ args }) => {
    await expect(
      await screen().findByText(/Square refunded \$20\.00 on a sale that included this class/)
    ).toBeInTheDocument();
    await openCancel();
    const already = screen().getByRole('radio', {
      name: "Already refunded in Square (don't refund again): record $20.00",
    });
    await expect(already).toBeChecked();
    await userEvent.click(screen().getByRole('button', { name: 'Confirm Cancel' }));
    await waitFor(() =>
      expect(args.onCancel).toHaveBeenCalledWith('reg-pos-1', false, true)
    );
  },
};

/** Cancelling with no refund at all. */
export const NoRefund: Story = {
  play: async ({ args }) => {
    await openCancel();
    await userEvent.click(screen().getByRole('radio', { name: 'Cancel without a refund' }));
    await userEvent.click(screen().getByRole('button', { name: 'Confirm Cancel' }));
    await waitFor(() =>
      expect(args.onCancel).toHaveBeenCalledWith('reg-001', false, false)
    );
  },
};

/** A private-hours booking shows its hour and the group's size, not "1 spot". */
export const PrivateHourBooking: Story = {
  args: {
    registration: {
      ...mockRegistrationConfirmed,
      slotStart: new Date('2030-12-07T18:00:00Z'),
      groupSize: 8,
    },
  },
  play: async () => {
    await waitFor(() => expect(screen().getByText('Hour')).toBeInTheDocument());
    expect(screen().getByText('Sat, Dec 7, 1:00 PM')).toBeInTheDocument();
    expect(screen().getByText('about 8 people')).toBeInTheDocument();
    expect(screen().queryByText(/1 spot/)).toBeNull();
  },
};
