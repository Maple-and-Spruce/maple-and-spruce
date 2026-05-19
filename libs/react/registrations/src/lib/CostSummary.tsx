'use client';

import { Box, Typography, Divider } from '@mui/material';
import type { CalculateRegistrationCostResponse } from '@maple/ts/firebase/api-types';

interface CostSummaryProps {
  /**
   * The full response from `calculateRegistrationCost`. Every value
   * displayed — including the `N x $price` line — comes from this
   * object so the UI can't disagree with what the server actually
   * priced. Locally-derived totals were the source of an overcharge
   * bug (#423) where the line item read "2 x $100" while the totals
   * reflected a different quantity the server had been told to price.
   */
  cost: CalculateRegistrationCostResponse;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostSummary({ cost }: CostSummaryProps): React.ReactElement {
  const {
    quantity,
    pricePerItemCents,
    originalCostCents,
    discountAmountCents,
    finalCostCents,
    taxAmountCents,
    taxRatePercent,
    totalCents,
    discountDescription,
  } = cost;

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'grey.50',
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        Cost Summary
      </Typography>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {quantity} x {formatCents(pricePerItemCents)}
        </Typography>
        <Typography variant="body2">{formatCents(originalCostCents)}</Typography>
      </Box>

      {discountAmountCents > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 0.5,
          }}
        >
          <Typography variant="body2" color="success.main">
            {discountDescription || 'Discount'}
          </Typography>
          <Typography variant="body2" color="success.main">
            -{formatCents(discountAmountCents)}
          </Typography>
        </Box>
      )}

      {discountAmountCents > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 0.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Subtotal
          </Typography>
          <Typography variant="body2">
            {formatCents(finalCostCents)}
          </Typography>
        </Box>
      )}

      {taxAmountCents > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mb: 0.5,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            WV Sales Tax ({taxRatePercent}%)
          </Typography>
          <Typography variant="body2">
            {formatCents(taxAmountCents)}
          </Typography>
        </Box>
      )}

      <Divider sx={{ my: 1 }} />

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Total
        </Typography>
        <Typography variant="subtitle1" fontWeight={600}>
          {formatCents(totalCents)}
        </Typography>
      </Box>
    </Box>
  );
}
