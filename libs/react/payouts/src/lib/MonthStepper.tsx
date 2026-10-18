'use client';

import { IconButton, Stack, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatMonth, shiftMonth } from './payout-format';

export interface MonthStepperProps {
  /** `YYYY-MM` */
  month: string;
  onChange: (month: string) => void;
}

/** Step backwards and forwards one month at a time. Statements are monthly. */
export function MonthStepper({ month, onChange }: MonthStepperProps) {
  return (
    <Stack direction="row" spacing={1} sx={{
      alignItems: 'center'
    }}>
      <IconButton aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="h6" component="p" sx={{ minWidth: 180, textAlign: 'center' }}>
        {formatMonth(month)}
      </Typography>
      <IconButton aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRightIcon />
      </IconButton>
    </Stack>
  );
}
