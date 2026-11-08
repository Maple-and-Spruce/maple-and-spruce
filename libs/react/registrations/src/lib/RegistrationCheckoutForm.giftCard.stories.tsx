import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
  PreviewGiftCardForClassResponse,
} from '@maple/ts/firebase/api-types';
import { RegistrationCheckoutForm } from './RegistrationCheckoutForm';

/**
 * Paying for a class with a gift card (#301).
 *
 * Square's Web Payments SDK is replaced by a small fake on `window.Square`
 * (installed in `beforeEach`), so the real `SquareCardForm` runs: the fake
 * card and gift card fields are plain inputs, and tokenizing returns fixed
 * tokens. `SquareCardForm` skips loading square.js when `window.Square` is
 * already there.
 */

const publicClass: PublicClass = {
  id: 'class-wheel-101',
  name: 'Wheel Throwing Basics',
  slug: 'wheel-throwing-basics',
  description: 'Center clay and throw your first cylinders.',
  shortDescription: 'Your first pots on the wheel.',
  instructorId: 'instructor-001',
  instructorName: 'Olive Thompson',
  sessions: [{ dateTime: '2030-04-14T14:00:00.000Z' }],
  durationMinutes: 120,
  capacity: 8,
  spotsRemaining: 5,
  priceCents: 5000,
  categoryId: 'cat-pottery',
  categoryName: 'Pottery',
  skillLevel: 'beginner',
  location: 'Maple & Spruce Studio',
};

const cost: CalculateRegistrationCostResponse = {
  quantity: 1,
  pricePerItemCents: 5000,
  originalCostCents: 5000,
  discountAmountCents: 0,
  finalCostCents: 5000,
  taxRatePercent: 6,
  taxAmountCents: 300,
  totalCents: 5300,
};

const partlyCovers: PreviewGiftCardForClassResponse = {
  last4: '4821',
  balanceCents: 2000,
  classCertificateCoverCents: 0,
  subtotalCents: 5000,
  taxAmountCents: 300,
  totalCents: 5300,
  giftCardAmountCents: 2000,
  leftToPayCents: 3300,
};

const coversAll: PreviewGiftCardForClassResponse = {
  ...partlyCovers,
  balanceCents: 7500,
  giftCardAmountCents: 5300,
  leftToPayCents: 0,
};

/** A $45 class certificate for pottery against this $50 class. */
const certificate: PreviewGiftCardForClassResponse = {
  last4: '1907',
  balanceCents: 4500,
  classCertificateCoverCents: 450,
  subtotalCents: 5000,
  taxAmountCents: 273,
  totalCents: 4823,
  giftCardAmountCents: 4500,
  leftToPayCents: 323,
};

const registered = {
  registration: { pricePaidCents: 5300 },
  confirmationNumber: 'MS-TEST01',
} as unknown as CreateRegistrationResponse;

/** Square refuses the card; the server's message is shown as is. */
function refuse(message: string) {
  return fn(async () => {
    throw Object.assign(new Error(message), {
      code: 'functions/failed-precondition',
    });
  });
}

type FakeField = {
  attach: (el: HTMLElement) => Promise<void>;
  tokenize: () => Promise<{ status: 'OK'; token: string }>;
  destroy: () => Promise<void>;
};

/** Each tokenize gives a new token, as Square's does (`<prefix>-1`, `-2`, …). */
function fakeField(label: string, tokenPrefix: string): FakeField {
  let tokens = 0;
  let input: HTMLInputElement | null = null;
  return {
    attach: async (el) => {
      input = document.createElement('input');
      input.setAttribute('aria-label', label);
      input.placeholder = label;
      input.style.cssText =
        'width:100%;box-sizing:border-box;height:48px;padding:0 12px;border:1px solid rgba(0,0,0,0.23);border-radius:6px;font-size:16px';
      el.replaceChildren(input);
    },
    tokenize: async () => {
      tokens += 1;
      return { status: 'OK', token: `${tokenPrefix}-${tokens}` };
    },
    destroy: async () => {
      input?.remove();
    },
  };
}

function installFakeSquare(): () => void {
  const w = window as unknown as { Square?: unknown };
  const previous = w.Square;
  // One gift card "number" per story, whichever field object reads it.
  const giftCardField = fakeField('Gift card number', 'gift-token');
  w.Square = {
    payments: async () => ({
      card: async () => fakeField('Card number', 'card-token'),
      giftCard: async () => giftCardField,
      paymentRequest: () => ({ update: () => undefined }),
      googlePay: async () => {
        throw new Error('Google Pay is not available here');
      },
      verifyBuyer: async () => ({ token: 'verify-token' }),
    }),
  };
  return () => {
    w.Square = previous;
  };
}

const meta = {
  component: RegistrationCheckoutForm,
  title: 'Registrations/RegistrationCheckoutForm/Gift cards',
  parameters: { layout: 'padded', a11y: { disable: true } },
  beforeEach: () => installFakeSquare(),
  args: {
    publicClass,
    squareApplicationId: 'sandbox-sq0idb-placeholder',
    squareLocationId: 'L_PLACEHOLDER',
    onCalculateCost: fn(async () => cost),
    onSubmit: fn(async () => registered),
    onSuccess: fn(),
    onPreviewGiftCard: fn(async () => partlyCovers),
  },
} satisfies Meta<typeof RegistrationCheckoutForm>;

export default meta;
type Story = StoryObj<typeof RegistrationCheckoutForm>;

async function openAndApply(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Have a gift card?' })
  );
  await canvas.findByLabelText('Gift card number');
  await userEvent.click(canvas.getByRole('button', { name: 'Apply gift card' }));
  return canvas;
}

async function fillCustomer(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText(/Full Name/), 'Robin Ashfield');
  await userEvent.type(
    canvas.getByLabelText(/Email Address/),
    'robin@example.com'
  );
}

/** Off (the Webflow default): the form is exactly as before. */
export const NotOffered: Story = {
  args: { onPreviewGiftCard: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /Register & Pay \$53\.00/ });
    await expect(canvas.queryByText('Have a gift card?')).toBeNull();
  },
};

/** The link before anyone opens it. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Have a gift card?' })
    ).toBeInTheDocument();
  },
};

/** A dollar gift card that pays part; the card pays the rest. */
export const PartlyCovered: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(
      await canvas.findByText('Gift card ending 4821:')
    ).toBeInTheDocument();
    await expect(canvas.getByText('−$20.00')).toBeInTheDocument();
    await expect(canvas.getByText('$33.00')).toBeInTheDocument();
    await expect(args.onPreviewGiftCard).toHaveBeenCalledWith({
      giftCardNonce: 'gift-token-1',
      classId: 'class-wheel-101',
      quantity: 1,
      discountCode: undefined,
    });

    await fillCustomer(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Register & Pay $33.00' })
    );
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentNonce: 'card-token-1',
        // A fresh token for the charge, not the one the preview used.
        giftCardNonce: 'gift-token-2',
      })
    );
  },
};

/** The gift card pays everything: no card field, no card needed. */
export const FullyCovered: Story = {
  args: { onPreviewGiftCard: fn(async () => coversAll) },
  play: async ({ canvasElement, args }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(
      await canvas.findByText('Nothing left to pay')
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('$22.00 stays on your card for next time.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.queryByLabelText('Card number')).not.toBeVisible()
    );

    await fillCustomer(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Register with gift card' })
    );
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ paymentNonce: '', giftCardNonce: 'gift-token-2' })
    );
  },
};

/** A class certificate bought for pottery, used on a slightly dearer pottery class. */
export const ClassCertificate: Story = {
  args: { onPreviewGiftCard: fn(async () => certificate) },
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(
      await canvas.findByText('Gift card ending 1907:')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Class certificate covers:')).toBeInTheDocument();
    await expect(canvas.getByText('−$4.50')).toBeInTheDocument();
    await expect(canvas.getByText('$3.23')).toBeInTheDocument();
  },
};

/** Removing the card goes back to paying in full by card. */
export const Remove: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Remove gift card' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Have a gift card?' })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Register & Pay $53.00' })
    ).toBeInTheDocument();
  },
};

export const UnknownCard: Story = {
  args: {
    onPreviewGiftCard: refuse(
      "We couldn't find that gift card. Please check the number and try again."
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "We couldn't find that gift card."
    );
    await expect(
      canvas.getByRole('button', { name: 'Register & Pay $53.00' })
    ).toBeInTheDocument();
  },
};

export const NoBalance: Story = {
  args: { onPreviewGiftCard: refuse('This gift card has no money left on it.') },
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This gift card has no money left on it.'
    );
  },
};

export const NotActive: Story = {
  args: {
    onPreviewGiftCard: refuse(
      'This gift card has been turned off. Please contact us if you think that is a mistake.'
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This gift card has been turned off.'
    );
  },
};

/** While the card is being checked: a spinner, and paying waits. */
export const Applying: Story = {
  args: { onPreviewGiftCard: fn(() => new Promise<never>(() => undefined)) },
  play: async ({ canvasElement }) => {
    const canvas = await openAndApply(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Checking card/ })
    ).toBeDisabled();
    await expect(
      canvas.getByRole('region', { name: 'Gift card' })
    ).toHaveAttribute('aria-busy', 'true');
    await expect(
      canvas.getByRole('button', { name: /Register & Pay/ })
    ).toBeDisabled();
  },
};
