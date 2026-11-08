import type { Meta, StoryObj } from '@storybook/react';
import { Box, Typography } from '@mui/material';
import { fn } from 'storybook/test';
import {
  mockGiftCardActivities,
  mockGiftCardCode,
  mockGiftCardTotals,
  mockGiftCards,
} from '@maple/react/storybook-fixtures';
import { GiftCardsHowItWorks } from './GiftCardsHowItWorks';
import { GiftCardTotalsCards } from './GiftCardTotalsCards';
import { GiftCardsTable } from './GiftCardsTable';
import { GiftCardDetailDialog } from './GiftCardDetailDialog';

/** The whole Gift Cards page as Katie sees it, with invented cards. */
function GiftCardsPageLayout({ withCardOpen }: { withCardOpen: boolean }) {
  const card = mockGiftCards[1];
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1">
        Gift Cards
      </Typography>
      <Typography color="textSecondary" sx={{ mb: 3 }}>
        Every Maple &amp; Spruce gift card, read from Square.
      </Typography>
      <GiftCardsHowItWorks />
      <GiftCardTotalsCards
        totalsState={{ status: 'success', data: mockGiftCardTotals }}
      />
      <GiftCardsTable
        cardsState={{ status: 'success', data: mockGiftCards }}
        onSelect={fn()}
      />
      <GiftCardDetailDialog
        card={withCardOpen ? card : null}
        detailState={{
          status: 'success',
          data: { card, activities: mockGiftCardActivities },
        }}
        onClose={fn()}
        onRevealCode={async () => mockGiftCardCode}
        copyToClipboard={async () => undefined}
      />
    </Box>
  );
}

const meta = {
  component: GiftCardsPageLayout,
  title: 'Gift Cards/Page',
  parameters: { layout: 'fullscreen' },
  args: { withCardOpen: false },
} satisfies Meta<typeof GiftCardsPageLayout>;

export default meta;
type Story = StoryObj<typeof GiftCardsPageLayout>;

export const Page: Story = {};
export const CardOpen: Story = { args: { withCardOpen: true } };
