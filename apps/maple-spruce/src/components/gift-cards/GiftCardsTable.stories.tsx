import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  mockCustomerSearchResult,
  mockGiftCards,
  mockLabelledGiftCards,
  mockSoldCertificate,
} from '@maple/react/storybook-fixtures';
import type { GiftCardSummary } from '@maple/ts/domain';
import { GiftCardsTable } from './GiftCardsTable';

const meta = {
  component: GiftCardsTable,
  title: 'Gift Cards/GiftCardsTable',
  parameters: { layout: 'padded' },
  args: { onSelect: fn() },
} satisfies Meta<typeof GiftCardsTable>;

export default meta;
type Story = StoryObj<typeof GiftCardsTable>;

export const WithCards: Story = {
  args: { cardsState: { status: 'success', data: mockGiftCards } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // 7710 holds $0, so it waits behind the switch.
    await expect(canvas.getAllByRole('row')).toHaveLength(mockGiftCards.length);
    await expect(canvas.getByText('Blocked')).toBeVisible();

    await userEvent.click(canvas.getByRole('row', { name: 'Gift card ending 0937' }));
    await expect(args.onSelect).toHaveBeenCalledWith(mockGiftCards[1]);

    await userEvent.click(canvas.getByLabelText('Show used up and turned off (1)'));
    await expect(canvas.getByText('Plastic card')).toBeVisible();
  },
};

/**
 * Printed certificates, replacements and free cards say so (#314, #332). A
 * certificate the register has not loaded yet is "Not sold yet".
 */
export const PrintedAndFreeCards: Story = {
  args: { cardsState: { status: 'success', data: mockLabelledGiftCards } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const printed = canvas.getByRole('row', { name: 'Gift card ending 9482' });
    await expect(within(printed).getByText('Printed certificate (batch 5f6071)')).toBeVisible();
    await expect(within(printed).getByText('Not sold yet')).toBeVisible();
    await expect(within(printed).getByText('$0.00')).toBeVisible();
    const replacement = canvas.getByRole('row', { name: 'Gift card ending 3388' });
    await expect(within(replacement).getByText('Replacement for a lost card')).toBeVisible();
    const free = canvas.getByRole('row', { name: 'Gift card ending 6262' });
    await expect(within(free).getByText('Given free')).toBeVisible();
    const sold = canvas.getByRole('row', { name: 'Gift card ending 4821' });
    await expect(within(sold).queryByText(/Printed certificate|Given free/)).toBeNull();
  },
};

export const SearchByLastDigits: Story = {
  args: { cardsState: { status: 'success', data: mockGiftCards } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByLabelText('Last 4 digits');
    await expect(search).toHaveAttribute('maxlength', '4');

    await userEvent.type(search, '48');
    await expect(canvas.getByRole('row', { name: 'Gift card ending 4821' })).toBeVisible();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 0937' })).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, '9999');
    await expect(canvas.getByText('No gift card ends in 9999.')).toBeVisible();
  },
};

const usedUpCards: GiftCardSummary[] = [
  { ...mockGiftCards[0], id: 'gftc-off', last4: '5501', state: 'deactivated', balanceCents: 0 },
  { ...mockGiftCards[0], id: 'gftc-spent', last4: '5502', state: 'active', balanceCents: 0 },
];

/**
 * Turned-off and $0 cards are hidden until the switch shows them, so Katie
 * sees the cards that still matter. A search by last digits still finds them.
 */
export const HidesUsedUpCards: Story = {
  args: {
    cardsState: { status: 'success', data: [mockGiftCards[0], ...usedUpCards] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('row', { name: 'Gift card ending 4821' })).toBeVisible();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 5501' })).toBeNull();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 5502' })).toBeNull();

    await userEvent.type(canvas.getByLabelText('Last 4 digits'), '5501');
    await expect(canvas.getByRole('row', { name: 'Gift card ending 5501' })).toBeVisible();
    await userEvent.clear(canvas.getByLabelText('Last 4 digits'));

    await userEvent.click(canvas.getByLabelText('Show used up and turned off (2)'));
    await expect(canvas.getByRole('row', { name: 'Gift card ending 5501' })).toBeVisible();
    await expect(canvas.getByRole('row', { name: 'Gift card ending 5502' })).toBeVisible();
  },
};

/** Every card used up: say so, rather than "no gift cards yet". */
export const OnlyUsedUpCards: Story = {
  args: { cardsState: { status: 'success', data: usedUpCards } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No cards with money on them.')).toBeVisible();
    await expect(canvas.queryByText(/No gift cards yet/)).toBeNull();
  },
};

export const Empty: Story = {
  args: { cardsState: { status: 'success', data: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No gift cards yet/)).toBeVisible();
  },
};

/** Loading is never drawn as "no gift cards". */
export const Loading: Story = {
  args: { cardsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('table', { name: 'Gift cards' })).toHaveAttribute('aria-busy', 'true');
    await expect(canvas.queryByText(/No gift cards yet/)).toBeNull();
    await expect(canvas.getByLabelText('Last 4 digits')).toBeDisabled();
  },
};

export const Error: Story = {
  args: { cardsState: { status: 'error', error: 'Square is unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable');
    await expect(canvas.queryByText(/No gift cards yet/)).toBeNull();
  },
};

const SEARCH_LABEL = 'Last 4 digits, name, email or phone';

const customerArgs = {
  cardsState: { status: 'success' as const, data: mockLabelledGiftCards },
};

/** Last 4 digits still filter on the page when customer search is on (#332). */
export const LastDigitsWithCustomerSearch: Story = {
  args: { ...customerArgs, onSearchCustomers: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(SEARCH_LABEL), '33');
    await expect(canvas.getByRole('row', { name: 'Gift card ending 3388' })).toBeVisible();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 4821' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: 'Search customers' })).toBeNull();
    await expect(args.onSearchCustomers).not.toHaveBeenCalled();
  },
};

/** A name is searched in Square; the customer's cards replace the list (#332). */
export const SearchByCustomer: Story = {
  args: {
    ...customerArgs,
    onSearchCustomers: fn(async () => mockCustomerSearchResult),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByLabelText(SEARCH_LABEL);
    await userEvent.type(search, 'Robin Ash');
    await expect(canvas.getByText('Press Enter to search Square customers.')).toBeVisible();
    await userEvent.type(search, '{Enter}');

    await expect(args.onSearchCustomers).toHaveBeenCalledWith('Robin Ash');
    await expect(
      await canvas.findByText('Robin Ashfield · robin@example.com · (304) 555-0142: 1 card')
    ).toBeVisible();
    await expect(canvas.getByText(/Register sales searched since Nov 8, 2024/)).toBeVisible();
    await expect(
      canvas.getByRole('row', { name: `Gift card ending ${mockSoldCertificate.last4}` })
    ).toBeVisible();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 4821' })).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Show all cards' }));
    await expect(canvas.getByRole('row', { name: 'Gift card ending 4821' })).toBeVisible();
    await expect(search).toHaveValue('');
  },
};

/** While Square is searched, the rows are skeletons, never "no cards". */
export const SearchByCustomerLoading: Story = {
  args: {
    ...customerArgs,
    onSearchCustomers: fn(() => new Promise<never>(() => undefined)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText(SEARCH_LABEL),
      'robin@example.com'
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Search customers' }));
    await expect(canvas.getByRole('table', { name: 'Gift cards' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/No gift cards found/)).toBeNull();
    await expect(canvas.queryByRole('row', { name: 'Gift card ending 4821' })).toBeNull();
  },
};

export const SearchByCustomerError: Story = {
  args: {
    ...customerArgs,
    onSearchCustomers: fn(async () => {
      throw new globalThis.Error('Square is unavailable');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText(SEARCH_LABEL),
      '304 555 0142{Enter}'
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "Couldn't search Square customers: Square is unavailable"
    );
    await expect(canvas.queryByText(/No gift cards found/)).toBeNull();
  },
};

export const SearchByCustomerNoCards: Story = {
  args: {
    ...customerArgs,
    onSearchCustomers: fn(async () => ({
      ...mockCustomerSearchResult,
      matches: [{ ...mockCustomerSearchResult.matches[0], giftCardIds: [] }],
      cards: [],
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(SEARCH_LABEL), 'Robin{Enter}');
    await expect(await canvas.findByText('No gift cards found for that customer.')).toBeVisible();
    await expect(canvas.getByText(/Robin Ashfield .*: 0 cards/)).toBeVisible();
  },
};

export const SearchByCustomerNobody: Story = {
  args: {
    ...customerArgs,
    onSearchCustomers: fn(async () => ({ ...mockCustomerSearchResult, matches: [], cards: [] })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(SEARCH_LABEL), 'Nobody{Enter}');
    await expect(await canvas.findByText('No Square customer matches "Nobody".')).toBeVisible();
  },
};
