'use client';

import { Box, Typography, Divider } from '@mui/material';

interface CostSummaryProps {
  originalCostCents: number;
  discountAmountCents: number;
  finalCostCents: number;
  discountDescription?: string;
  quantity: number;
  pricePerItemCents: number;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostSummary({
  originalCostCents,
  discountAmountCents,
  finalCostCents,
  discountDescription,
  quantity,
  pricePerItemCents,
}: CostSummaryProps) {
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
          {formatCents(finalCostCents)}
        </Typography>
      </Box>
    </Box>
  );
}
