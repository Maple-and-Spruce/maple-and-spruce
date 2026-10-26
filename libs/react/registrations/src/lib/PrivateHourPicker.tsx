'use client';

/**
 * PrivateHourPicker - "Pick a day" and "Pick a time" for a private-hours
 * class. Each hour is booked by one group; hours another group holds are
 * shown but can't be picked.
 */
import { Box, Button, FormHelperText, Typography } from '@mui/material';
import type { PrivateHourDay } from '@maple/ts/domain';

interface PrivateHourPickerProps {
  days: PrivateHourDay[];
  selectedDay: string | null;
  selectedStart: string | null;
  onSelectDay: (dayKey: string) => void;
  onSelectStart: (start: string) => void;
  /**
   * Called when a booked hour is picked, to join its waitlist. When omitted,
   * booked hours can't be picked.
   */
  onSelectBooked?: (start: string) => void;
  /** The booked hour whose waitlist is open, shown as selected. */
  waitlistStart?: string | null;
  /** Shown under the times, e.g. "Pick a time". */
  error?: string | null;
  /** Rendered under the times, e.g. the waitlist form for a booked hour. */
  children?: React.ReactNode;
}

export function PrivateHourPicker({
  days,
  selectedDay,
  selectedStart,
  onSelectDay,
  onSelectStart,
  onSelectBooked,
  waitlistStart,
  error,
  children,
}: PrivateHourPickerProps) {
  const day = days.find((d) => d.key === selectedDay) ?? null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" gutterBottom id="private-hour-day-label">
          Pick a day
        </Typography>
        <Box
          role="group"
          aria-labelledby="private-hour-day-label"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 1,
          }}
        >
          {days.map((d) => {
            const selected = d.key === selectedDay;
            return (
              <Button
                key={d.key}
                variant={selected ? 'contained' : 'outlined'}
                aria-pressed={selected}
                onClick={() => onSelectDay(d.key)}
                sx={{ flexDirection: 'column', py: 1, lineHeight: 1.3 }}
              >
                <span>{d.label}</span>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ color: 'inherit' }}
                >
                  {d.openCount === 0 ? 'Fully booked' : `${d.openCount} open`}
                </Typography>
              </Button>
            );
          })}
        </Box>
      </Box>

      {day && (
        <Box>
          <Typography variant="h6" gutterBottom id="private-hour-time-label">
            Pick a time
          </Typography>
          <Box
            role="group"
            aria-labelledby="private-hour-time-label"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 1,
            }}
          >
            {day.hours.map((h) => {
              const selected = h.booked
                ? h.start === waitlistStart
                : h.start === selectedStart;
              const canWaitlist = h.booked && !!onSelectBooked;
              return (
                <Button
                  key={h.start}
                  variant={selected ? 'contained' : 'outlined'}
                  color={h.booked ? 'secondary' : 'primary'}
                  aria-pressed={selected}
                  disabled={h.booked && !canWaitlist}
                  onClick={() =>
                    h.booked ? onSelectBooked?.(h.start) : onSelectStart(h.start)
                  }
                  sx={{
                    flexDirection: 'column',
                    py: 1,
                    lineHeight: 1.3,
                    ...(h.booked && !selected ? { borderStyle: 'dashed' } : {}),
                  }}
                >
                  <span>{h.label}</span>
                  {h.booked && (
                    <Typography component="span" variant="caption">
                      {canWaitlist ? 'Booked · join waitlist' : 'Booked'}
                    </Typography>
                  )}
                </Button>
              );
            })}
          </Box>
          {error && <FormHelperText error>{error}</FormHelperText>}
          {children}
        </Box>
      )}
    </Box>
  );
}
