'use client';

import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  SelectChangeEvent,
} from '@mui/material';
import type { CalendarEventType } from '@maple/ts/domain';
import {
  CALENDAR_EVENT_TYPES,
  getCalendarEventTypeLabel,
} from '@maple/ts/domain';

export interface CalendarEventFilterValues {
  type?: CalendarEventType;
  publicOnly?: boolean;
}

interface CalendarEventFilterToolbarProps {
  filters: CalendarEventFilterValues;
  onFiltersChange: (filters: CalendarEventFilterValues) => void;
}

export function CalendarEventFilterToolbar({
  filters,
  onFiltersChange,
}: CalendarEventFilterToolbarProps) {
  const handleTypeChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      type: value === '' ? undefined : (value as CalendarEventType),
    });
  };

  const handlePublicOnlyChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    onFiltersChange({
      ...filters,
      publicOnly: event.target.checked ? true : undefined,
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        alignItems: 'center',
        mb: 3,
      }}
    >
      {/* Type Filter */}
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="event-type-filter-label">Event Type</InputLabel>
        <Select
          labelId="event-type-filter-label"
          id="event-type-filter-select"
          value={filters.type ?? ''}
          label="Event Type"
          onChange={handleTypeChange}
        >
          <MenuItem value="">
            <em>All</em>
          </MenuItem>
          {CALENDAR_EVENT_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {getCalendarEventTypeLabel(type)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Public Only Toggle */}
      <FormControlLabel
        control={
          <Switch
            checked={filters.publicOnly ?? false}
            onChange={handlePublicOnlyChange}
          />
        }
        label="Public only"
      />
    </Box>
  );
}
