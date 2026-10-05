'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  PeriodPicker,
  TeacherPayoutsList,
  monthRangeFor,
} from '@maple/react/payouts';
import { useInstructors, useTeacherPayouts } from '../../../hooks';
import { ClassInstructorPayoutsPanel } from './class-instructors/ClassInstructorPayoutsPanel';

type PayoutsTab = 'lessons' | 'classes';

export default function PayoutsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab: PayoutsTab = searchParams.get('tab') === 'classes' ? 'classes' : 'lessons';

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Payouts
        </Typography>
        <Tabs
          value={tab}
          onChange={(_, next: PayoutsTab) =>
            router.replace(next === 'classes' ? '/payouts?tab=classes' : '/payouts')
          }
          aria-label="Payout type"
        >
          <Tab value="lessons" label="Lesson teachers" />
          <Tab value="classes" label="Class instructors" />
        </Tabs>
      </Box>
      {tab === 'classes' ? <ClassInstructorPayoutsPanel /> : <LessonTeacherPayouts />}
    </>
  );
}

function LessonTeacherPayouts() {
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
    <>
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" color="textSecondary">
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
        color="textSecondary"
        sx={{ display: 'block', mb: 1 }}
      >
        Period: {periodLabel}
      </Typography>

      <TeacherPayoutsList payoutsState={payoutsState} />
    </>
  );
}
