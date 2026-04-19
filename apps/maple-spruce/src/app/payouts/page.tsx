'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  PeriodPicker,
  TeacherPayoutsList,
  monthRangeFor,
} from '@maple/react/payouts';
import { AppShell } from '../../components/layout';
import { useInstructors, useTeacherPayouts } from '../../hooks';

export default function PayoutsPage() {
  const [range, setRange] = useState(() => monthRangeFor(new Date()));
  const [teacherId, setTeacherId] = useState<string>('all');

  const { instructorsState } = useInstructors();
  const instructors =
    instructorsState.status === 'success' ? instructorsState.data : [];

  const effectiveTeacherId = teacherId === 'all' ? undefined : teacherId;

  const { payoutsState } = useTeacherPayouts({
    from: range.from,
    to: range.to,
    teacherId: effectiveTeacherId,
  });

  const periodLabel = useMemo(
    () =>
      `${range.from.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} – ${range.to.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`,
    [range]
  );

  return (
    <AppShell>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Teacher payouts
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Combines paid private-pay invoice lines and rendered Hope
          Scholarship lessons. Compensation uses each instructor&apos;s
          configured pay rate. Payments to teachers happen outside of this
          app — this view is the source of truth for what&apos;s owed.
        </Typography>
      </Box>

      <Stack spacing={3} sx={{ mb: 3 }}>
        <PeriodPicker
          from={range.from}
          to={range.to}
          onChange={setRange}
        />

        <FormControl size="small" sx={{ minWidth: 240 }}>
          <InputLabel id="teacher-filter-label">Teacher</InputLabel>
          <Select
            labelId="teacher-filter-label"
            label="Teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          >
            <MenuItem value="all">All teachers</MenuItem>
            {instructors.map((i) => (
              <MenuItem key={i.id} value={i.id}>
                {i.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        Period: {periodLabel}
      </Typography>

      <TeacherPayoutsList payoutsState={payoutsState} />
    </AppShell>
  );
}
