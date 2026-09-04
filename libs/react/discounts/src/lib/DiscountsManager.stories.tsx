import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, waitFor, within } from 'storybook/test';
import type { Discount } from '@maple/ts/domain';
import { mockDiscounts } from '@maple/react/storybook-fixtures';
import { DiscountsManager } from './DiscountsManager';

/**
 * The single management experience behind BOTH discount pages (#791):
 * `/discounts` for Maple & Spruce classes and `/music-together/discounts` for
 * Music Together. They pass different `program` + copy and nothing else, which
 * is what stops the two drifting apart.
 *
 * The stories below are paired on purpose — the same interaction run against
 * each program — so a change that helps one page and breaks the other fails
 * here.
 */

const mtDiscounts: Discount[] = [
  {
    id: 'mt-1',
    code: 'PILOTCLASS',
    description: 'Pilot semester — half off',
    type: 'percent',
    percent: 50,
    status: 'active',
    program: 'music-together',
    appliesTo: 'order',
    nthSlot: 1,
    usageLimit: 6,
    usageCount: 2,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-01T00:00:00Z'),
  },
];

const meta = {
  component: DiscountsManager,
  title: 'Discounts/DiscountsManager',
  parameters: { layout: 'padded', a11y: { disable: true } },
  args: {
    onCreate: fn(async () => undefined),
    onUpdate: fn(async () => undefined),
    onDelete: fn(async () => undefined),
  },
} satisfies Meta<typeof DiscountsManager>;

export default meta;
type Story = StoryObj<typeof DiscountsManager>;

const CLASSES_ARGS = {
  program: 'classes' as const,
  title: 'Class Discount Codes',
  description: 'Redeemable at Maple & Spruce class checkout.',
  discountsState: { status: 'success' as const, data: mockDiscounts },
};

const MT_ARGS = {
  program: 'music-together' as const,
  title: 'Music Together Discount Codes',
  description: 'Redeemable at Music Together registration checkout.',
  discountsState: { status: 'success' as const, data: mtDiscounts },
};

export const Classes: Story = { args: CLASSES_ARGS };

export const MusicTogether: Story = { args: MT_ARGS };

export const Loading: Story = {
  args: { ...CLASSES_ARGS, discountsState: { status: 'loading' } },
};

/**
 * Creating a code on the classes page stamps `program: 'classes'` — the user
 * is never asked, because the page they are standing on already says which
 * program they mean and `program` is immutable afterwards.
 */
export const ClassesCreateStampsProgram: Story = {
  args: CLASSES_ARGS,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /Add Discount/i })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText(/Discount Code/i), 'SPRING25');
    await userEvent.type(
      dialog.getByLabelText(/Description/i),
      'Spring sale'
    );
    await userEvent.type(dialog.getByLabelText(/Percent Off/i), '25');

    // Per-slot pricing is a classes concept, so the control is offered here.
    await expect(
      dialog.getByText(/Discount applies once to the order subtotal/i)
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /^Create$/i })
    );

    await waitFor(() =>
      expect(args.onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SPRING25', program: 'classes' })
      )
    );
  },
};

/**
 * The same flow on the Music Together page stamps `music-together` — and the
 * per-slot control is gone, because MT prices a family (siblings already get
 * 50% off the 2nd and 3rd) and `mtApplyDiscount` rejects slot-scoped codes at
 * checkout. Offering it would let someone author an unredeemable code.
 */
export const MusicTogetherCreateStampsProgram: Story = {
  args: MT_ARGS,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: /Add Discount/i })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText(/Discount Code/i), 'PILOT2');
    await userEvent.type(
      dialog.getByLabelText(/Description/i),
      'Second pilot cohort'
    );
    await userEvent.type(dialog.getByLabelText(/Percent Off/i), '50');

    await expect(
      dialog.queryByText(/Discount applies once to the order subtotal/i)
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /^Create$/i })
    );

    await waitFor(() =>
      expect(args.onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'PILOT2',
          program: 'music-together',
          // No slot pricing to choose, so it always lands on the order.
          appliesTo: 'order',
        })
      )
    );
  },
};

/**
 * A failed delete (e.g. an mt-teacher hitting a class code the server
 * refuses) surfaces on the page instead of closing as though it worked.
 */
export const SurfacesADeleteFailure: Story = {
  args: {
    ...MT_ARGS,
    onDelete: fn(async () => {
      throw new Error('You can only manage Music Together discount codes.');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', {
        name: /Delete discount PILOTCLASS/i,
      })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/only manage Music Together discount codes/i)
      ).toBeInTheDocument()
    );
  },
};
