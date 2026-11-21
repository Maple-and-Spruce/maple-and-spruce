'use client';

import { Button, Stack, TextField } from '@mui/material';
import { todayKey } from './payout-format';

export interface ThroughDatePickerProps {
  /** `YYYY-MM-DD`, or empty for "everything that has finished". */
  value: string;
  onChange: (value: string) => void;
  /** Today as `YYYY-MM-DD`; injectable so stories do not depend on the clock. */
  today?: string;
}

/**
 * How far a statement reaches. It starts on today, which means every finished
 * class. Picking an earlier day leaves the later classes for another
 * statement, which is how a payment made a while ago gets its own record.
 */
export function ThroughDatePicker({ value, onChange, today = todayKey() }: ThroughDatePickerProps) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
      <TextField
        label="Classes held through"
        type="date"
        size="small"
        value={value || today}
        onChange={(e) => {
          const next = e.target.value;
          // Today, the future and a cleared field all mean "no cutoff".
          onChange(!next || next >= today ? '' : next);
        }}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
        helperText="Pick an earlier day to make a statement for only the classes up to then."
      />
      {value && <Button onClick={() => onChange('')}>Back to today</Button>}
    </Stack>
  );
}
