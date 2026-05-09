'use client';

import { Box, Paper, Typography } from '@mui/material';
import type { Sale } from '@maple/ts/domain';

interface SalesSummaryCardsProps {
  sales: Sale[];
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function SalesSummaryCards({ sales }: SalesSummaryCardsProps) {
  const totalRevenue = sales.reduce((sum, s) => sum + s.salePrice, 0);
  const totalCommission = sales.reduce((sum, s) => sum + s.commission, 0);
  const totalArtistEarnings = sales.reduce(
    (sum, s) => sum + s.artistEarnings,
    0
  );
  const cards: { label: string; value: string; sub?: string }[] = [
    {
      label: 'Total revenue',
      value: formatCurrency(totalRevenue),
      sub: `${sales.length} sale${sales.length === 1 ? '' : 's'}`,
    },
    { label: 'Store commission', value: formatCurrency(totalCommission) },
    { label: 'Owed to artists', value: formatCurrency(totalArtistEarnings) },
  ];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
        gap: 2,
        mb: 3,
      }}
    >
      {cards.map((c) => (
        <Paper key={c.label} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">
            {c.label}
          </Typography>
          <Typography variant="h4" component="div" sx={{ mt: 0.5 }}>
            {c.value}
          </Typography>
          {c.sub && (
            <Typography variant="caption" color="text.secondary">
              {c.sub}
            </Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}
