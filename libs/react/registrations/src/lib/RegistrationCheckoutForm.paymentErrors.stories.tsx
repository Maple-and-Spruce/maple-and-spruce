import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { PublicClass } from '@maple/ts/domain';
import type {
  CalculateRegistrationCostResponse,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';
import { RegistrationCheckoutForm } from './RegistrationCheckoutForm';
import { installFakeSquare } from './storybook-fake-square';

/**
 * What a family sees when paying fails.
 *
 * The message sits beside the pay button (it used to be at the top of the
 * form, off screen on a phone), and from the second failure the form says
 * something new instead of repeating itself.
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

const DECLINED = 'Your card was declined. Please try a different card.';

/** The server refuses the payment with a family-facing message. */
function refuse(message: string) {
  return fn(async (): Promise<CreateRegistrationResponse> => {
    throw Object.assign(new Error(message), {
      code: 'functions/invalid-argument',
    });
  });
}

const meta = {
  component: RegistrationCheckoutForm,
  title: 'Registrations/RegistrationCheckoutForm/Payment errors',
  parameters: { layout: 'padded', a11y: { disable: true } },
  beforeEach: () => installFakeSquare(),
  args: {
    publicClass,
    squareApplicationId: 'sandbox-sq0idb-placeholder',
    squareLocationId: 'L_PLACEHOLDER',
    onCalculateCost: fn(async () => cost),
    onSubmit: refuse(DECLINED),
    onSuccess: fn(),
  },
} satisfies Meta<typeof RegistrationCheckoutForm>;

export default meta;
type Story = StoryObj<typeof RegistrationCheckoutForm>;

async function fillAndPay(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const pay = await canvas.findByRole('button', { name: /Register & Pay \$53\.00/ });
  await userEvent.type(canvas.getByLabelText(/Full Name/), 'Robin Ashfield');
  await userEvent.type(
    canvas.getByLabelText(/Email Address/),
    'robin@example.com'
  );
  await userEvent.click(pay);
  return { canvas, pay };
}

/** One decline: the message is right above the pay button. */
export const Declined: Story = {
  play: async ({ canvasElement, args }) => {
    const { canvas, pay } = await fillAndPay(canvasElement);
    const alert = await canvas.findByRole('alert');
    await expect(alert).toHaveTextContent(DECLINED);
    // Beside the button, not at the top of the form.
    await expect(alert.nextElementSibling).toBe(pay);
    await expect(alert).not.toHaveTextContent('Still not going through?');
    await expect(args.onSuccess).not.toHaveBeenCalled();
  },
};

/** A second decline says what to do next. */
export const DeclinedTwice: Story = {
  play: async ({ canvasElement, args }) => {
    const { canvas, pay } = await fillAndPay(canvasElement);
    await canvas.findByRole('alert');
    await userEvent.click(pay);
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(canvas.getByRole('alert')).toHaveTextContent(
        'Still not going through?'
      )
    );
    // No hosted checkout was passed, so it is not offered.
    await expect(
      canvas.queryByRole('button', { name: /Square's checkout page/ })
    ).toBeNull();
  },
};

/** With the hosted checkout available, a second decline offers it. */
export const DeclinedTwiceOffersSquareCheckout: Story = {
  args: {
    // Never resolves with a URL the story would navigate to.
    onHostedCheckout: fn(() => new Promise<{ checkoutUrl: string }>(() => undefined)),
  },
  play: async ({ canvasElement, args }) => {
    const { canvas, pay } = await fillAndPay(canvasElement);
    await canvas.findByRole('alert');
    await userEvent.click(pay);
    const other = await canvas.findByRole('button', {
      name: /pay on Square's checkout page instead/,
    });
    await userEvent.click(other);
    await waitFor(() => expect(args.onHostedCheckout).toHaveBeenCalledTimes(1));
    await expect(args.onHostedCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-wheel-101',
        customerEmail: 'robin@example.com',
      })
    );
  },
};

/** Paying again clears the old message while the new attempt runs. */
export const RetrySucceeds: Story = {
  play: async ({ canvasElement, args }) => {
    const submit = args.onSubmit as ReturnType<typeof fn>;
    const { canvas, pay } = await fillAndPay(canvasElement);
    await canvas.findByRole('alert');
    submit.mockImplementationOnce(
      async () =>
        ({
          registration: { pricePaidCents: 5300 },
          confirmationNumber: 'MS-TEST01',
        }) as unknown as CreateRegistrationResponse
    );
    await userEvent.click(pay);
    await waitFor(() => expect(args.onSuccess).toHaveBeenCalledTimes(1));
    await expect(canvas.queryByRole('alert')).toBeNull();
  },
};
