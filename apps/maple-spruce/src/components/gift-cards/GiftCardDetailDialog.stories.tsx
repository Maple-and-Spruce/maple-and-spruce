import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  mockGiftCardActivities,
  mockGiftCardBuyer,
  mockGiftCardCode,
  mockGiftCards,
  mockLabelledGiftCards,
  mockReplacementCard,
  mockSoldCertificate,
  mockSoldCertificateActivities,
} from '@maple/react/storybook-fixtures';
import { GiftCardDetailDialog } from './GiftCardDetailDialog';

const card = mockGiftCards[1];
const body = () => within(document.body);

/** The dialog fades in; wait until it is fully shown before acting on it. */
async function openDialog() {
  const canvas = body();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeVisible());
  await waitFor(() =>
    expect(getComputedStyle(canvas.getByRole('dialog').parentElement!).opacity).toBe('1')
  );
  return canvas;
}

const meta = {
  component: GiftCardDetailDialog,
  title: 'Gift Cards/GiftCardDetailDialog',
  parameters: { layout: 'centered' },
  args: {
    card,
    detailState: {
      status: 'success',
      data: { card, activities: mockGiftCardActivities },
    },
    onClose: fn(),
    onRevealCode: fn(async () => mockGiftCardCode),
    copyToClipboard: fn(async () => undefined),
  },
} satisfies Meta<typeof GiftCardDetailDialog>;

export default meta;
type Story = StoryObj<typeof GiftCardDetailDialog>;

/** Balance and history in plain words; the code is hidden until asked for. */
export const History: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Gift card ending 0937')).toBeVisible();
    await expect(canvas.getByText('$12.50')).toBeVisible();
    const history = canvas.getByRole('list', { name: 'Card history' });
    await expect(within(history).getByText('Sold')).toBeVisible();
    await expect(within(history).getByText('Money added')).toBeVisible();
    await expect(within(history).getByText('Spent')).toBeVisible();
    await expect(within(history).getByText('−$37.50')).toBeVisible();
    await expect(canvas.queryByTestId('gift-card-code')).toBeNull();
    await expect(args.onRevealCode).not.toHaveBeenCalled();
  },
};

/** One click fetches the code, shows it in groups of four and copies it. */
export const ShowAndCopyCode: Story = {
  play: async ({ args }) => {
    const canvas = await openDialog();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await expect(await canvas.findByTestId('gift-card-code')).toHaveTextContent('7783 3200 0000 4821');
    await expect(args.onRevealCode).toHaveBeenCalledWith(card.id);
    await expect(args.copyToClipboard).toHaveBeenCalledWith(mockGiftCardCode);
    await expect(canvas.getByRole('status')).toHaveTextContent('Copied');
  },
};

/** If the browser blocks the clipboard, the code is still there to copy by hand. */
export const CopyBlocked: Story = {
  args: {
    copyToClipboard: fn(async () => {
      throw new Error('denied');
    }),
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await waitFor(() => expect(canvas.getByTestId('gift-card-code')).toBeVisible());
    await expect(canvas.getByRole('status')).toHaveTextContent('copy it by hand');
  },
};

export const RevealFails: Story = {
  args: {
    onRevealCode: fn(async () => {
      throw new Error('Square is unavailable');
    }),
  },
  play: async () => {
    const canvas = await openDialog();
    await userEvent.click(await canvas.findByRole('button', { name: 'Show and copy code' }));
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable')
    );
    await expect(canvas.queryByTestId('gift-card-code')).toBeNull();
  },
};

/** While the history loads, it is never shown as "nothing has happened". */
export const LoadingHistory: Story = {
  args: { detailState: { status: 'loading' } },
  play: async () => {
    const canvas = await openDialog();
    await expect(await canvas.findByLabelText('Loading history')).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText(/Nothing has happened/)).toBeNull();
    // The balance from the table row shows straight away.
    await waitFor(() => expect(canvas.getByText('$12.50')).toBeVisible());
  },
};

export const HistoryFails: Story = {
  args: { detailState: { status: 'error', error: 'Square is unavailable' } },
  play: async () => {
    const canvas = await openDialog();
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Square is unavailable');
  },
};

/** A card bought on the website: who bought it, for whom, and the message. */
export const BoughtOnlineAmount: Story = {
  args: {
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'amount',
          valueCents: 5000,
          buyerName: 'Robin Ashfield',
          buyerEmail: 'robin@example.com',
          recipientName: 'Olive Thompson',
          recipientEmail: 'olive@example.com',
          message: 'Happy birthday!',
          deliverTo: 'recipient',
          squareOrderId: 'order-1',
          squarePaymentId: 'pay-1',
          createdAt: '2026-11-02T15:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Bought online' }));
    await expect(section.getByText(/Bought by Robin Ashfield \(robin@example\.com\)/)).toBeVisible();
    await expect(section.getByText(/For Olive Thompson \(olive@example\.com\)/)).toBeVisible();
    await expect(section.getByText('Emailed to them')).toBeVisible();
    await expect(section.getByText(/Happy birthday!/)).toBeVisible();
    await expect(section.queryByText(/Class certificate/)).toBeNull();
  },
};

/** A class certificate names the class and its type. */
export const BoughtOnlineClassCertificate: Story = {
  args: {
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'class',
          valueCents: 6500,
          classId: 'class-1',
          classCategoryId: 'cat-1',
          className: 'Beginner Wheel',
          classCategoryName: 'Pottery',
          buyerName: 'Robin Ashfield',
          buyerEmail: 'robin@example.com',
          recipientName: 'Olive Thompson',
          deliverTo: 'buyer',
          squareOrderId: 'order-1',
          squarePaymentId: 'pay-1',
          createdAt: '2026-11-02T15:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Bought online' }));
    await expect(section.getByText('Class certificate: Beginner Wheel (Pottery)')).toBeVisible();
    await expect(section.getByText('For Olive Thompson')).toBeVisible();
    await expect(section.getByText('Emailed to the buyer to print')).toBeVisible();
  },
};

/** A card sold at the register has no purchase record and no section. */
export const NotBoughtOnline: Story = {
  play: async () => {
    const canvas = await openDialog();
    await expect(canvas.queryByRole('region', { name: 'Bought online' })).toBeNull();
  },
};

/** An active register card with no record offers "Make it a class certificate". */
export const OffersClassCertificate: Story = {
  args: { onMakeClassCertificate: fn() },
  play: async ({ args }) => {
    const canvas = await openDialog();
    const button = await canvas.findByRole('button', { name: 'Make it a class certificate' });
    await expect(canvas.getByText(/Nothing changes in Square/)).toBeVisible();
    await userEvent.click(button);
    await expect(args.onMakeClassCertificate).toHaveBeenCalledWith(card);
  },
};

/** Not offered while the card's record is still loading: it may already have one. */
export const NoCertificateButtonWhileLoading: Story = {
  args: { onMakeClassCertificate: fn(), detailState: { status: 'loading' } },
  play: async () => {
    const canvas = await openDialog();
    await expect(await canvas.findByLabelText('Loading history')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Make it a class certificate' })).toBeNull();
  },
};

/** Not offered for a card that already has a record. */
export const NoCertificateButtonWhenRecorded: Story = {
  args: {
    onMakeClassCertificate: fn(),
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'amount',
          valueCents: 5000,
          buyerName: 'Robin Ashfield',
          buyerEmail: 'robin@example.com',
          deliverTo: 'buyer',
          squareOrderId: 'order-1',
          squarePaymentId: 'pay-1',
          createdAt: '2026-11-02T15:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    await expect(canvas.getByRole('region', { name: 'Bought online' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Make it a class certificate' })).toBeNull();
  },
};

/** Not offered for a blocked or empty-and-pending card. */
export const NoCertificateButtonWhenNotActive: Story = {
  args: {
    onMakeClassCertificate: fn(),
    detailState: {
      status: 'success',
      data: { card: { ...card, state: 'blocked' }, activities: mockGiftCardActivities },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    await waitFor(() => expect(canvas.getByText('Gift card ending 0937')).toBeVisible());
    await expect(canvas.queryByRole('button', { name: 'Make it a class certificate' })).toBeNull();
  },
};

/** A register card Katie made a class certificate. */
export const RegisterClassCertificate: Story = {
  args: {
    onMakeClassCertificate: fn(),
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'class',
          valueCents: 6500,
          source: 'register',
          classCategoryId: 'cat-pottery',
          className: 'Pottery & Ceramics',
          classCategoryName: 'Pottery & Ceramics',
          recipientName: 'Olive Thompson',
          fromName: 'Robin Ashfield',
          createdAt: '2026-11-08T12:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Class certificate' }));
    await expect(
      section.getByText(
        'Class certificate for one Pottery & Ceramics class, worth $65.00 (sold at the register)'
      )
    ).toBeVisible();
    await expect(section.getByText('For Olive Thompson')).toBeVisible();
    await expect(section.getByText('From Robin Ashfield')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Make it a class certificate' })).toBeNull();
  },
};

/** A card the studio gave for free, with why. */
export const GivenFree: Story = {
  args: {
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'amount',
          valueCents: 2500,
          source: 'issued',
          reason: 'Raffle prize at the fall fair',
          recipientName: 'Olive Thompson',
          createdAt: '2026-11-08T12:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Given free by the studio' }));
    await expect(section.getByText(/Free \$25\.00 card\. Nobody paid for it/)).toBeVisible();
    await expect(section.getByText('Why: Raffle prize at the fall fair')).toBeVisible();
    await expect(section.queryByText(/Bought by/)).toBeNull();
  },
};

// ---------------------------------------------------------------------------
// #332: printed certificates sold at the register, the buyer, lost cards
// ---------------------------------------------------------------------------

const unsoldCertificate = mockLabelledGiftCards[0];
const stockRecord = (giftCardId: string, last4: string) => ({
  giftCardId,
  last4,
  kind: 'amount' as const,
  valueCents: 5000,
  source: 'stock' as const,
  batchId: 'cert-0a1b2c3d4e5f6071',
  batchIndex: 0,
  design: 'stained-glass',
  createdAt: '2026-11-03T15:00:00.000Z',
});

/** Printed, not sold: no money, no buyer, nothing to replace. */
export const UnsoldCertificate: Story = {
  args: {
    card: unsoldCertificate,
    onLoadBuyer: fn(async () => mockGiftCardBuyer),
    onReplace: fn(),
    detailState: {
      status: 'success',
      data: {
        card: unsoldCertificate,
        activities: [],
        purchase: stockRecord(unsoldCertificate.id, unsoldCertificate.last4),
      },
    },
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Not sold yet')).toBeVisible();
    const section = within(canvas.getByRole('region', { name: 'Printed certificate' }));
    await expect(
      section.getByText(/Printed certificate for \$50\.00\. It has no money on it until it is sold at the register\./)
    ).toBeVisible();
    await expect(section.getByRole('link', { name: 'Open this batch to print it again' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Replace lost card' })).toBeNull();
    await expect(canvas.queryByRole('region', { name: 'Buyer' })).toBeNull();
    await expect(args.onLoadBuyer).not.toHaveBeenCalled();
  },
};

const soldCertificateArgs = {
  card: mockSoldCertificate,
  onReplace: fn(),
  detailState: {
    status: 'success' as const,
    data: {
      card: mockSoldCertificate,
      activities: mockSoldCertificateActivities,
      purchase: stockRecord(mockSoldCertificate.id, mockSoldCertificate.last4),
    },
  },
};

/** Sold at the register: who bought it, read from Square, and Replace. */
export const SoldCertificateWithBuyer: Story = {
  args: { ...soldCertificateArgs, onLoadBuyer: fn(async () => mockGiftCardBuyer) },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.getByText('Active')).toBeVisible();
    await expect(
      canvas.getByText(/Printed certificate for \$50\.00, sold at the register\./)
    ).toBeVisible();
    const buyer = within(await canvas.findByRole('region', { name: 'Buyer' }));
    await expect(
      buyer.getByText(
        'Sold at the register on Nov 20, 2026 to Robin Ashfield · robin@example.com · (304) 555-0142'
      )
    ).toBeVisible();
    await expect(args.onLoadBuyer).toHaveBeenCalledWith(mockSoldCertificate.id);

    await userEvent.click(canvas.getByRole('button', { name: 'Replace lost card' }));
    await expect(args.onReplace).toHaveBeenCalledWith(mockSoldCertificate);
  },
};

/** Only the parts Square has, and customers linked to the card itself. */
export const BuyerWithEmailOnlyAndLinkedCustomer: Story = {
  args: {
    ...soldCertificateArgs,
    onLoadBuyer: fn(async () => ({
      sale: {
        soldAt: '2026-11-20T17:05:00Z',
        orderId: 'order-register-1',
        customer: { id: 'cust-olive', email: 'olive@example.com' },
      },
      linkedCustomers: [{ id: 'cust-robin', name: 'Robin Ashfield', phone: '(304) 555-0142' }],
    })),
  },
  play: async () => {
    const canvas = await openDialog();
    const buyer = within(await canvas.findByRole('region', { name: 'Buyer' }));
    await expect(
      buyer.getByText('Sold at the register on Nov 20, 2026 to olive@example.com')
    ).toBeVisible();
    await expect(
      buyer.getByText('Linked in Square: Robin Ashfield · (304) 555-0142')
    ).toBeVisible();
  },
};

export const BuyerNone: Story = {
  args: {
    ...soldCertificateArgs,
    onLoadBuyer: fn(async () => ({
      sale: { soldAt: '2026-11-20T17:05:00Z', orderId: 'order-register-1' },
      linkedCustomers: [],
    })),
  },
  play: async () => {
    const canvas = await openDialog();
    const buyer = within(await canvas.findByRole('region', { name: 'Buyer' }));
    await expect(buyer.getByText(/No customer was added at the register\./)).toBeVisible();
    await expect(buyer.queryByText(/ to /)).toBeNull();
  },
};

export const BuyerLoading: Story = {
  args: {
    ...soldCertificateArgs,
    onLoadBuyer: fn(() => new Promise<never>(() => undefined)),
  },
  play: async () => {
    const canvas = await openDialog();
    await expect(canvas.getByLabelText('Loading who bought this card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/No customer was added/)).toBeNull();
  },
};

export const BuyerError: Story = {
  args: {
    ...soldCertificateArgs,
    onLoadBuyer: fn(async () => {
      throw new globalThis.Error('Square is unavailable');
    }),
  },
  play: async () => {
    const canvas = await openDialog();
    await expect(
      await canvas.findByText(/Couldn't read who bought this card from Square: Square is unavailable/)
    ).toBeVisible();
    await expect(canvas.queryByText(/No customer was added/)).toBeNull();
    // The rest of the card still works.
    await expect(canvas.getByRole('button', { name: 'Replace lost card' })).toBeVisible();
  },
};

/** A card bought online already names its buyer; no register lookup. */
export const NoBuyerBoxWhenGivenFree: Story = {
  args: {
    onLoadBuyer: fn(async () => mockGiftCardBuyer),
    detailState: {
      status: 'success',
      data: {
        card,
        activities: mockGiftCardActivities,
        purchase: {
          giftCardId: card.id,
          last4: card.last4,
          kind: 'amount',
          valueCents: 2500,
          source: 'issued',
          reason: 'Raffle prize',
          createdAt: '2026-11-08T12:00:00.000Z',
        },
      },
    },
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    await expect(canvas.queryByRole('region', { name: 'Buyer' })).toBeNull();
    await expect(args.onLoadBuyer).not.toHaveBeenCalled();
  },
};

/** No Replace for a card with nothing on it, or while the card loads. */
export const NoReplaceWithoutBalance: Story = {
  args: {
    card: mockGiftCards[2],
    onReplace: fn(),
    detailState: {
      status: 'success',
      data: { card: mockGiftCards[2], activities: [] },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    await waitFor(() => expect(canvas.getByText('Gift card ending 7710')).toBeVisible());
    await expect(canvas.queryByRole('button', { name: 'Replace lost card' })).toBeNull();
  },
};

export const ReplacementCard: Story = {
  args: {
    card: mockReplacementCard,
    onLoadBuyer: fn(async () => mockGiftCardBuyer),
    detailState: {
      status: 'success',
      data: {
        card: mockReplacementCard,
        activities: [],
        purchase: {
          giftCardId: mockReplacementCard.id,
          last4: mockReplacementCard.last4,
          kind: 'amount',
          valueCents: 1250,
          source: 'replacement',
          replacesGiftCardId: 'gftc-holiday-1',
          createdAt: '2026-11-24T16:00:00.000Z',
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Replacement card' }));
    await expect(
      section.getByText('Holds $12.50 moved from a lost card, which was turned off.')
    ).toBeVisible();
    await expect(canvas.queryByRole('region', { name: 'Buyer' })).toBeNull();
  },
};

const onlinePurchase = {
  giftCardId: card.id,
  last4: card.last4,
  kind: 'amount' as const,
  valueCents: 5000,
  buyerName: 'Robin Ashfield',
  buyerEmail: 'robin@example.com',
  deliverTo: 'buyer' as const,
  squareOrderId: 'order-1',
  squarePaymentId: 'pay-1',
  createdAt: '2026-11-02T15:00:00.000Z',
};

/** A card bought online with money on it can be refunded and turned off. */
export const RefundOnlineCard: Story = {
  args: {
    onCloseCard: fn(),
    detailState: {
      status: 'success',
      data: { card, activities: mockGiftCardActivities, purchase: onlinePurchase },
    },
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Refund or turn off' }));
    await expect(section.getByText(/Refund what is left to the card that paid/)).toBeVisible();
    await userEvent.click(section.getByRole('button', { name: 'Refund and turn off' }));
    await expect(args.onCloseCard).toHaveBeenCalledWith(card, 'refund', undefined);
  },
};

/** A card sold any other way can only be turned off from here. */
export const TurnOffRegisterCard: Story = {
  args: { onCloseCard: fn() },
  play: async ({ args }) => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Refund or turn off' }));
    await expect(section.getByText(/No money is returned from here/)).toBeVisible();
    await expect(section.queryByRole('button', { name: 'Refund and turn off' })).toBeNull();
    await userEvent.click(section.getByRole('button', { name: 'Turn off card' }));
    await expect(args.onCloseCard).toHaveBeenCalledWith(card, 'deactivate', undefined);
  },
};

/** A refund stopped part way is offered to finish, with the amount it started with. */
export const FinishRefund: Story = {
  args: {
    onCloseCard: fn(),
    detailState: {
      status: 'success',
      data: {
        card: { ...card, balanceCents: 0 },
        activities: mockGiftCardActivities,
        purchase: {
          ...onlinePurchase,
          closure: { kind: 'refund', amountCents: 5000, startedAt: '2026-11-10T15:00:00.000Z' },
        },
      },
    },
  },
  play: async ({ args }) => {
    const canvas = await openDialog();
    const section = within(canvas.getByRole('region', { name: 'Refund or turn off' }));
    await expect(section.getByText(/was started but did not finish/)).toBeVisible();
    await userEvent.click(section.getByRole('button', { name: 'Finish refund' }));
    await expect(args.onCloseCard).toHaveBeenCalledWith(
      { ...card, balanceCents: 0 },
      'refund',
      5000
    );
  },
};

/** A refunded card says so, and offers nothing more. */
export const Refunded: Story = {
  args: {
    onCloseCard: fn(),
    detailState: {
      status: 'success',
      data: {
        card: { ...card, state: 'deactivated', balanceCents: 0 },
        activities: mockGiftCardActivities,
        purchase: {
          ...onlinePurchase,
          closure: {
            kind: 'refund',
            amountCents: 5000,
            startedAt: '2026-11-10T15:00:00.000Z',
            completedAt: '2026-11-10T15:00:05.000Z',
          },
        },
      },
    },
  },
  play: async () => {
    const canvas = await openDialog();
    await expect(
      canvas.getByText('Refunded $50.00 and turned off on Nov 10, 2026.')
    ).toBeVisible();
    await expect(canvas.queryByRole('region', { name: 'Refund or turn off' })).toBeNull();
  },
};
