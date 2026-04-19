import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
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
