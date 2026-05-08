'use client';

import { Paper, Stack, Typography } from '@mui/material';
import { formatCurrency, formatHours } from './format';

export interface UnpaidTotalCardProps {
  unpaidHours: number;
  /** Pass undefined to hide the dollar figure (employee view, no rate visible). */
  unpaidAmountDollars?: number;
  label?: string;
}

export function UnpaidTotalCard({
  unpaidHours,
  unpaidAmountDollars,
  label = 'Unpaid total',
}: UnpaidTotalCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        mb: 3,
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={0.5}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4" component="div" color="primary.main">
          {formatHours(unpaidHours)}
        </Typography>
        {unpaidAmountDollars !== undefined && (
          <Typography variant="body1" color="text.secondary">
            {formatCurrency(unpaidAmountDollars)} owed at current rate
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}
