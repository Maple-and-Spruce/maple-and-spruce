'use client';

import { Alert, Box, Paper, Skeleton, Typography } from '@mui/material';
import type { GiftCardTotals, RequestState } from '@maple/ts/domain';
import { formatGiftCardMoney } from './format';

interface Tile {
  label: string;
  value: string;
  explain: string;
}

function tiles(totals: GiftCardTotals): Tile[] {
  return [
    {
      label: 'Owed to customers',
      value: formatGiftCardMoney(totals.outstandingCents),
      explain: 'Paid for and not spent yet, on every active card.',
    },
    {
      label: 'Cards with money on them',
      value: String(totals.cardsWithBalance),
      explain: 'Active cards that still have a balance.',
    },
    {
      label: 'Sold this month',
      value: formatGiftCardMoney(totals.loadedThisMonthCents),
      explain: 'Put on cards since the 1st: new cards and top-ups.',
    },
    {
      label: 'Spent this month',
      value: formatGiftCardMoney(totals.spentThisMonthCents),
      explain: 'Paid with gift cards since the 1st, less refunds.',
    },
  ];
}

const GRID = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
  gap: 2,
  mb: 3,
} as const;

/** The four numbers at the top of the Gift Cards page, each explained. */
export function GiftCardTotalsCards({
  totalsState,
}: {
  totalsState: RequestState<GiftCardTotals>;
}) {
  if (totalsState.status === 'error') {
    return (
      <Alert severity="error" sx={{ mb: 3 }}>
        Couldn&apos;t load gift card totals from Square: {totalsState.error}
      </Alert>
    );
  }

  if (totalsState.status !== 'success') {
    return (
      <Box sx={GRID} aria-busy="true" aria-label="Loading gift card totals">
        {[0, 1, 2, 3].map((i) => (
          <Paper key={i} variant="outlined" sx={{ p: 2 }}>
            <Skeleton width="60%" />
            <Skeleton variant="text" sx={{ fontSize: '2rem' }} width="40%" />
            <Skeleton width="90%" />
          </Paper>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={GRID}>
      {tiles(totalsState.data).map((t) => (
        <Paper key={t.label} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="overline" color="textSecondary">
            {t.label}
          </Typography>
          <Typography variant="h4" component="div" sx={{ mt: 0.5 }}>
            {t.value}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {t.explain}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}
