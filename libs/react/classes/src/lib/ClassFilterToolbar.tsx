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
import type {
  ClassStatus,
  Instructor,
  ClassCategory,
} from '@maple/ts/domain';

export interface ClassFilters {
  status?: ClassStatus;
  categoryId?: string;
  instructorId?: string;
  upcoming?: boolean;
}

interface ClassFilterToolbarProps {
  filters: ClassFilters;
  onFiltersChange: (filters: ClassFilters) => void;
  instructors?: Instructor[];
  categories?: ClassCategory[];
}

export function ClassFilterToolbar({
  filters,
  onFiltersChange,
  instructors = [],
  categories = [],
}: ClassFilterToolbarProps) {
  const handleStatusChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      status: value === '' ? undefined : (value as ClassStatus),
    });
  };

  const handleCategoryChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      categoryId: value === '' ? undefined : value,
    });
  };

  const handleInstructorChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value;
    onFiltersChange({
      ...filters,
      instructorId: value === '' ? undefined : value,
    });
  };

  const handleUpcomingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      upcoming: event.target.checked ? true : undefined,
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
      {/* Status Filter */}
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel id="status-filter-label">Status</InputLabel>
        <Select
          labelId="status-filter-label"
          id="status-filter-select"
          value={filters.status ?? ''}
          label="Status"
          onChange={handleStatusChange}
        >
          <MenuItem value="">
            <em>All</em>
          </MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
          <MenuItem value="published">Published</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </Select>
      </FormControl>

      {/* Category Filter */}
      {categories.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel id="category-filter-label">Category</InputLabel>
          <Select
            labelId="category-filter-label"
            id="category-filter-select"
            value={filters.categoryId ?? ''}
            label="Category"
            onChange={handleCategoryChange}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Instructor Filter */}
      {instructors.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="instructor-filter-label">Instructor</InputLabel>
          <Select
            labelId="instructor-filter-label"
            id="instructor-filter-select"
            value={filters.instructorId ?? ''}
            label="Instructor"
            onChange={handleInstructorChange}
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {instructors.map((instructor) => (
              <MenuItem key={instructor.id} value={instructor.id}>
                {instructor.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {/* Upcoming Only Toggle */}
      <FormControlLabel
        control={
          <Switch
            checked={filters.upcoming ?? false}
            onChange={handleUpcomingChange}
          />
        }
        label="Upcoming only"
      />
    </Box>
  );
}
