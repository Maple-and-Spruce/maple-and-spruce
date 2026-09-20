'use client';

/**
 * DayColumn — one teaching day, top to bottom, in time order (legacy #838).
 *
 * This replaces the spreadsheet Katie keeps by hand rather than working around
 * it, so it is laid out the way she laid that out: students in time order with
 * **open slots in the sequence between them**. The position of an opening is
 * the information — "4-5 is open, right after Delphine" is what she says to a
 * parent on the phone, and no per-student page can answer that.
 *
 * An opening carries a cadence. "Free every other week" is the alternate week
 * of a biweekly student's hour (legacy #837), and it is sellable to exactly one more
 * biweekly student. Saying only "open" there would sell it twice.
 *
 * Presentational: the page owns the data and `buildDayColumn` owns the layout.
 */
import {
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { DayColumnRow } from '@maple/ts/domain';
import { WEEKDAY_LONG, cadenceLabel } from '@maple/ts/domain';
import { formatMinutes } from './block-format';

export interface DayColumnProps {
  weekday: number;
  rows: DayColumnRow[];
  /** Student id -> display name. A missing name renders as the id, never blank. */
  studentNames: Record<string, string>;
  /** Teacher id -> display name. Shown only when the day spans more than one. */
  teacherNames?: Record<string, string>;
  isLoading?: boolean;
  /** Book a student into an opening. Omit to render read-only. */
  onScheduleInto?: (row: Extract<DayColumnRow, { kind: 'open' }>) => void;
  /** Open an existing standing slot. */
  onOpenSlot?: (scheduleId: string) => void;
}

/** "Every other week" for a cadence, or nothing at all when it is weekly. */
function cadenceChip(intervalWeeks: number): string | null {
  return intervalWeeks <= 1 ? null : cadenceLabel(intervalWeeks);
}

/**
 * How an opening reads. "Open every other week" is the alternate week of a
 * biweekly student's hour — sellable, but to exactly one more biweekly
 * student, which plain "Open" would not convey.
 */
function openingLabel(row: Extract<DayColumnRow, { kind: 'open' }>): string {
  if (row.irregular) return 'Open some weeks';
  if (row.everyWeeks === 1) return 'Open';
  return `Open ${cadenceLabel(row.everyWeeks).toLowerCase()}`;
}

export function DayColumn({
  weekday,
  rows,
  studentNames,
  teacherNames,
  isLoading = false,
  onScheduleInto,
  onOpenSlot,
}: DayColumnProps) {
  if (isLoading) {
    return (
      <Stack spacing={1}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} />
        ))}
      </Stack>
    );
  }

  if (rows.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">
          No teaching blocks on {WEEKDAY_LONG[weekday]}s yet. Schedule a lesson
          and a block will be made for it.
        </Typography>
      </Paper>
    );
  }

  // Only name teachers when the day actually holds more than one; on Katie's
  // Tuesday every row is hers and repeating it is noise.
  const teacherIds = new Set(
    rows.flatMap((r) => (r.kind === 'lesson' ? [r.teacherId] : []))
  );
  const showTeacher = teacherIds.size > 1;

  return (
    <Stack spacing={1}>
      {rows.map((row, i) => {
        const time = `${formatMinutes(row.startMinutes)}–${formatMinutes(row.endMinutes)}`;

        if (row.kind === 'lesson') {
          const cadence = cadenceChip(row.intervalWeeks);
          return (
            <Paper
              key={`${row.scheduleId}-${i}`}
              variant="outlined"
              onClick={
                onOpenSlot ? () => onOpenSlot(row.scheduleId) : undefined
              }
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: onOpenSlot ? 'pointer' : 'default',
                '&:hover': onOpenSlot ? { borderColor: 'primary.main' } : {},
              }}
            >
              <Typography
                sx={{ minWidth: 150, fontVariantNumeric: 'tabular-nums' }}
                color="text.secondary"
              >
                {time}
              </Typography>
              <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>
                {studentNames[row.studentId] ?? row.studentId}
              </Typography>
              {showTeacher && (
                <Typography variant="body2" color="text.secondary">
                  {teacherNames?.[row.teacherId] ?? row.teacherId}
                </Typography>
              )}
              {cadence && <Chip size="small" label={cadence} />}
            </Paper>
          );
        }

        // An opening. Dashed rather than solid: it is space, not a commitment.
        return (
          <Box
            key={`open-${row.startMinutes}-${i}`}
            sx={{
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Typography
              sx={{ minWidth: 150, fontVariantNumeric: 'tabular-nums' }}
              color="text.secondary"
            >
              {time}
            </Typography>
            <Typography sx={{ flexGrow: 1 }} color="text.secondary">
              {openingLabel(row)}
              {row.fitsDurations.length > 0 && (
                <Typography
                  component="span"
                  variant="body2"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  fits {row.fitsDurations.join(', ')} min
                </Typography>
              )}
            </Typography>
            {onScheduleInto && (
              <Button size="small" onClick={() => onScheduleInto(row)}>
                Schedule
              </Button>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}
