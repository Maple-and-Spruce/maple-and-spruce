'use client';

import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  type SelectChangeEvent,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import type { Artist, SaleSource } from '@maple/ts/domain';

export interface SalesFilters {
  /** Inclusive ISO date (yyyy-mm-dd) */
  from: string;
  /** Inclusive ISO date (yyyy-mm-dd) */
  to: string;
  artistId: string;
  source: SaleSource | '';
}

export const defaultSalesFilters: SalesFilters = {
  from: '',
  to: '',
  artistId: '',
  source: '',
};

interface SalesFilterToolbarProps {
  filters: SalesFilters;
  onFiltersChange: (filters: SalesFilters) => void;
  artists: Artist[];
  totalCount: number;
}

const sourceOptions: { value: SaleSource; label: string }[] = [
  { value: 'square', label: 'Square (in-store)' },
  { value: 'etsy', label: 'Etsy' },
  { value: 'manual', label: 'Manual' },
];

export function SalesFilterToolbar({
  filters,
  onFiltersChange,
  artists,
  totalCount,
}: SalesFilterToolbarProps) {
  const hasActiveFilters =
    !!filters.from || !!filters.to || !!filters.artistId || !!filters.source;

  const update = (patch: Partial<SalesFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        alignItems: 'center',
        mb: 2,
      }}
    >
      <TextField
        label="From"
        type="date"
        value={filters.from}
        onChange={(e) => update({ from: e.target.value })}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="To"
        type="date"
        value={filters.to}
        onChange={(e) => update({ to: e.target.value })}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="sales-artist-label">Artist</InputLabel>
        <Select
          labelId="sales-artist-label"
          label="Artist"
          value={filters.artistId}
          onChange={(e: SelectChangeEvent<string>) =>
            update({ artistId: e.target.value })
          }
        >
          <MenuItem value="">
            <em>All artists</em>
          </MenuItem>
          {artists.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="sales-source-label">Source</InputLabel>
        <Select
          labelId="sales-source-label"
          label="Source"
          value={filters.source}
          onChange={(e: SelectChangeEvent<string>) =>
            update({ source: e.target.value as SaleSource | '' })
          }
        >
          <MenuItem value="">
            <em>All sources</em>
          </MenuItem>
          {sourceOptions.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {hasActiveFilters && (
        <Button
          size="small"
          startIcon={<ClearIcon />}
          onClick={() => onFiltersChange(defaultSalesFilters)}
        >
          Clear
        </Button>
      )}
      <Box sx={{ flex: 1 }} />
      <Typography variant="caption" color="text.secondary">
        {totalCount} sale{totalCount === 1 ? '' : 's'}
      </Typography>
    </Box>
  );
}
