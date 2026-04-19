'use client';

/**
 * PeriodPicker — month-level quick-picks (Previous month / This month) plus
 * free-form date range. Emits `{ from, to }` in the shape the teacher
 * payouts API expects. Uses Preact Signals.
 */
import { useEffect } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Stack,
  Typography,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3';
import { batch, useSignal, useSignals } from '@maple/react/signals';

export interface PeriodPickerProps {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
}

export function monthRangeFor(
  reference: Date,
  monthOffset = 0
): { from: Date; to: Date } {
  const y = reference.getFullYear();
  const m = reference.getMonth() + monthOffset;
  const from = new Date(y, m, 1, 0, 0, 0, 0);
  const to = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export function PeriodPicker({ from, to, onChange }: PeriodPickerProps) {
  useSignals();

  // Local "draft" signals so the date pickers don't fire onChange for
  // every keystroke. A user commits by clicking Apply (or the quick-pick
  // buttons commit immediately).
  const draftFrom = useSignal<Date>(from);
  const draftTo = useSignal<Date>(to);

  // Re-sync drafts when the prop range changes (e.g. quick-pick button).
  useEffect(() => {
    batch(() => {
      draftFrom.value = from;
      draftTo.value = to;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

  const applyRange = () => {
    onChange({ from: draftFrom.value, to: draftTo.value });
  };

  const selectThisMonth = () => {
    onChange(monthRangeFor(new Date()));
  };

  const selectPreviousMonth = () => {
    onChange(monthRangeFor(new Date(), -1));
  };

  const draftChanged =
    draftFrom.value.getTime() !== from.getTime() ||
    draftTo.value.getTime() !== to.getTime();

  return (
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        Period
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={selectPreviousMonth}
            aria-label="Previous month"
          >
            Previous month
          </Button>
          <Button onClick={selectThisMonth} aria-label="This month">
            This month
          </Button>
        </ButtonGroup>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <DatePicker
              label="From"
              value={draftFrom.value}
              onChange={(v) => {
                if (v) draftFrom.value = v;
              }}
              slotProps={{ textField: { size: 'small' } }}
            />
            <DatePicker
              label="To"
              value={draftTo.value}
              onChange={(v) => {
                if (v) draftTo.value = v;
              }}
              slotProps={{ textField: { size: 'small' } }}
            />
          </Stack>
        </LocalizationProvider>
        <Button
          variant="contained"
          size="small"
          onClick={applyRange}
          disabled={!draftChanged}
        >
          Apply
        </Button>
      </Stack>
    </Box>
  );
}
