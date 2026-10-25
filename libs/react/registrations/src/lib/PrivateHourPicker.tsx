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
  /** Shown under the times, e.g. "Pick a time". */
  error?: string | null;
}

export function PrivateHourPicker({
  days,
  selectedDay,
  selectedStart,
  onSelectDay,
  onSelectStart,
  error,
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
              const selected = h.start === selectedStart;
              return (
                <Button
                  key={h.start}
                  variant={selected ? 'contained' : 'outlined'}
                  aria-pressed={selected}
                  disabled={h.booked}
                  onClick={() => onSelectStart(h.start)}
                  sx={{ flexDirection: 'column', py: 1, lineHeight: 1.3 }}
                >
                  <span>{h.label}</span>
                  {h.booked && (
                    <Typography component="span" variant="caption">
                      Booked
                    </Typography>
                  )}
                </Button>
              );
            })}
          </Box>
          {error && <FormHelperText error>{error}</FormHelperText>}
        </Box>
      )}
    </Box>
  );
}
