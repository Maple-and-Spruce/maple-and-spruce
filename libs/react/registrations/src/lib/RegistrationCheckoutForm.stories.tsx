import type { Meta, StoryObj } from '@storybook/react';
import { fn, userEvent, within } from 'storybook/test';
import type { PublicClass } from '@maple/ts/domain';
import type { CalculateRegistrationCostResponse } from '@maple/ts/firebase/api-types';
import { RegistrationCheckoutForm } from './RegistrationCheckoutForm';

/**
 * Visual-only stories for RegistrationCheckoutForm.
 *
 * Interaction coverage (empty submit shows errors, invalid email shows error,
 * valid submit proceeds to tokenize) lives in RegistrationCheckoutForm.spec.tsx,
 * which is able to `vi.mock('./SquareCardForm')` — Square's Web Payments SDK
 * loads from a CDN at runtime and cannot be meaningfully exercised in
 * Storybook without adding new module-mock infrastructure to main.ts.
 *
 * These stories cover the visual states the spec doesn't: an open class,
 * a class with limited spots, and a fully-booked class.
 */

const mockPublicClass: PublicClass = {
  id: 'class-001',
  name: 'Introduction to Weaving',
  slug: 'introduction-to-weaving',
  description:
    'Learn the fundamentals of weaving in this beginner-friendly workshop.',
  shortDescription: 'Create your first woven wall hanging.',
  instructorId: 'instructor-001',
  instructorName: 'Sarah Weaver',
  sessions: [{ dateTime: '2030-04-14T10:00:00.000Z' }],
  durationMinutes: 180,
  capacity: 8,
  spotsRemaining: 5,
  priceCents: 7500,
  imageUrl: 'https://picsum.photos/seed/weaving/800/600',
  categoryId: 'cat-fiber',
  categoryName: 'Fiber Arts',
  skillLevel: 'beginner',
  location: 'Maple & Spruce Studio',
};

const mockCostResponse: CalculateRegistrationCostResponse = {
  quantity: 1,
  pricePerItemCents: 7500,
  originalCostCents: 7500,
  discountAmountCents: 0,
  finalCostCents: 7500,
  taxRatePercent: 6,
  taxAmountCents: 450,
  totalCents: 7950,
};

const meta = {
  component: RegistrationCheckoutForm,
  title: 'Registrations/RegistrationCheckoutForm',
  parameters: {
    layout: 'padded',
    // Square loads external scripts which can flake a11y audits; the real
    // risk here is covered by the in-app accessibility review, not Storybook.
    a11y: { disable: true },
  },
  args: {
    publicClass: mockPublicClass,
    squareApplicationId: 'sandbox-sq0idb-placeholder',
    squareLocationId: 'L_PLACEHOLDER',
    env: 'sandbox',
    onCalculateCost: fn(async () => mockCostResponse),
    onSubmit: fn(),
    onSuccess: fn(),
  },
} satisfies Meta<typeof RegistrationCheckoutForm>;

export default meta;
type Story = StoryObj<typeof RegistrationCheckoutForm>;

/**
 * Default checkout form for a class with plenty of spots.
 */
export const Default: Story = {};

/**
 * Class with only one spot remaining — quantity is capped at 1.
 */
export const OneSpotLeft: Story = {
  args: {
    publicClass: {
      ...mockPublicClass,
      spotsRemaining: 1,
    },
  },
};

/**
 * Class that is fully booked — registration blocked with a warning banner.
 */
export const FullyBooked: Story = {
  args: {
    publicClass: {
      ...mockPublicClass,
      spotsRemaining: 0,
    },
  },
};

/**
 * Cost calculation that includes a discount — exercises the discount-applied
 * Alert and the cost summary breakdown.
 */
export const WithDiscountApplied: Story = {
  args: {
    onCalculateCost: fn(async () => ({
      quantity: 1,
      pricePerItemCents: 7500,
      originalCostCents: 7500,
      discountAmountCents: 1500,
      finalCostCents: 6000,
      taxRatePercent: 6,
      taxAmountCents: 360,
      totalCents: 6360,
      discountDescription: 'SAVE20 — 20% off',
    })),
  },
};

/**
 * Multi-attendee preview: opens the form with two attendee rows already
 * added, one with a name + email (so the "Send them confirmation" path is
 * visible) and one left at the default "Additional Person #2" label (so
 * the "remind your friends" path is visible). Use this to eyeball the
 * row-based pattern without clicking through.
 */
export const WithAdditionalAttendees: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const addButton = canvas.getByRole('button', {
      name: /add another person/i,
    });

    // Two extras: one fully filled, one left as the default placeholder.
    await userEvent.click(addButton);
    await userEvent.click(addButton);

    // Reveal name and email on the first row.
    const updateNameLinks = canvas.getAllByRole('button', {
      name: /update name/i,
    });
    await userEvent.click(updateNameLinks[0]);

    const nameField = canvas.getByLabelText(/^name$/i);
    await userEvent.type(nameField, 'Alice Friend');

    const sendConfirmationCheckboxes = canvas.getAllByRole('checkbox', {
      name: /send them a confirmation email/i,
    });
    await userEvent.click(sendConfirmationCheckboxes[0]);

    const emailField = canvas.getByLabelText(/their email address/i);
    await userEvent.type(emailField, 'alice@example.com');
  },
};

/**
 * Email validation feedback after submit attempt — confirms the per-row
 * helper text + error styling on a malformed email.
 */
export const AttendeeEmailInvalid: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /add another person/i })
    );
    await userEvent.click(
      canvas.getByRole('checkbox', {
        name: /send them a confirmation email/i,
      })
    );
    await userEvent.type(
      canvas.getByLabelText(/their email address/i),
      'not-an-email'
    );

    // Trigger validation by attempting Register & Pay.
    const submitButton = canvas.getByRole('button', {
      name: /register & pay/i,
    });
    await userEvent.click(submitButton);
  },
};
