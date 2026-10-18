import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { HopeProduct } from '@maple/ts/domain';
import { HopeScholarshipBanner } from './HopeScholarshipBanner';

const NOW = new Date('2026-09-01T12:00:00Z');
const guitar30: HopeProduct = {
  id: 'prod-guitar-30',
  emaProductId: '137571',
  name: 'Standard Child Guitar Lesson 30 minutes',
  priceCents: 3000,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const meta = {
  component: HopeScholarshipBanner,
  title: 'Lessons/HopeScholarshipBanner',
  parameters: { layout: 'padded' },
  args: { products: [guitar30], onChooseProduct: fn() },
} satisfies Meta<typeof HopeScholarshipBanner>;

export default meta;
type Story = StoryObj<typeof HopeScholarshipBanner>;

/**
 * On a product: the product's name, EMA id and price, which is what EMA pays.
 * Not the old length table's $41.25 for a 30-minute lesson.
 */
export const OnAnEmaProduct: Story = {
  args: { hopeProductId: 'prod-guitar-30' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Standard Child Guitar Lesson 30 minutes · $30.00 / lesson')
    ).toBeInTheDocument();
    await expect(canvas.getByText('EMA product 137571')).toBeInTheDocument();
    await expect(canvas.queryByText(/\$41\.25/)).toBeNull();
    await expect(canvas.queryByText(/No EMA product set/)).toBeNull();
  },
};

/**
 * No product: no price at all. No dollar figure is shown (not even an
 * estimate), just a warning and a way to fix it.
 */
export const NoProductHasNoPrice: Story = {
  args: {},
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveClass('MuiAlert-colorWarning');
    await expect(canvas.getByText('No EMA product set.')).toBeInTheDocument();
    await expect(canvas.getByText(/have no price until you choose/)).toBeInTheDocument();
    await expect(canvas.queryByText(/\$\d/)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Choose EMA product' }));
    await expect(args.onChooseProduct).toHaveBeenCalled();
  },
};

/** A product id that no longer exists is treated the same as no product. */
export const DeletedProductHasNoPrice: Story = {
  args: { hopeProductId: 'prod-deleted' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No EMA product set.')).toBeInTheDocument();
    await expect(canvas.queryByText(/\$\d/)).toBeNull();
  },
};

/** The fixed rules are there, but folded away until asked for. */
export const BillingRulesFoldAway: Story = {
  args: { hopeProductId: 'prod-guitar-30' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Billing rules' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await expect(
      await canvas.findByText(/credit back to the Hope account/i)
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Hide billing rules' })
    ).toHaveAttribute('aria-expanded', 'true');
  },
};
