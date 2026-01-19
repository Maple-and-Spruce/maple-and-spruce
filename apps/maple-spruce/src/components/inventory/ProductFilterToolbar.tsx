'use client';

import { useMemo } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  FormControlLabel,
  Switch,
  Button,
  Typography,
  SelectChangeEvent,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import type { Artist, Category, ProductStatus } from '@maple/ts/domain';

export interface ProductFilters {
  search: string;
  categoryIds: string[];
  artistIds: string[];
  statuses: ProductStatus[];
  inStockOnly: boolean;
}

export const defaultFilters: ProductFilters = {
  search: '',
  categoryIds: [],
  artistIds: [],
  statuses: [],
  inStockOnly: false,
};

interface ProductFilterToolbarProps {
  filters: ProductFilters;
  onFiltersChange: (filters: ProductFilters) => void;
  artists: Artist[];
  categories: Category[];
  totalCount: number;
  filteredCount: number;
}

const statusOptions: { value: ProductStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'discontinued', label: 'Discontinued' },
];

export function ProductFilterToolbar({
  filters,
  onFiltersChange,
  artists,
  categories,
  totalCount,
  filteredCount,
}: ProductFilterToolbarProps) {
  const activeArtists = useMemo(
    () => artists.filter((a) => a.status === 'active'),
    [artists]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      filters.search.trim() !== '' ||
      filters.categoryIds.length > 0 ||
      filters.artistIds.length > 0 ||
      filters.statuses.length > 0 ||
      filters.inStockOnly
    );
  }, [filters]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, search: e.target.value });
  };

  const handleCategoryChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      categoryIds: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleArtistChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      artistIds: typeof value === 'string' ? value.split(',') : value,
    });
  };

  const handleStatusChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    onFiltersChange({
      ...filters,
      statuses: (typeof value === 'string'
        ? value.split(',')
        : value) as ProductStatus[],
    });
  };

  const handleInStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ ...filters, inStockOnly: e.target.checked });
  };

  const handleClearFilters = () => {
    onFiltersChange(defaultFilters);
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'flex-start',
        }}
      >
        {/* Search */}
        <TextField
          label="Search"
          placeholder="Search name, SKU, description..."
          value={filters.search}
          onChange={handleSearchChange}
          size="small"
          sx={{ minWidth: 250 }}
        />

        {/* Category Filter */}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Category</InputLabel>
          <Select
            multiple
            value={filters.categoryIds}
            onChange={handleCategoryChange}
            input={<OutlinedInput label="Category" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((id) => {
                  const category = categories.find((c) => c.id === id);
                  return (
                    <Chip
                      key={id}
                      label={category?.name || 'Unknown'}
                      size="small"
                    />
                  );
                })}
              </Box>
            )}
          >
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
            <MenuItem value="">
              <em>Uncategorized</em>
            </MenuItem>
          </Select>
        </FormControl>

        {/* Artist Filter */}
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Artist</InputLabel>
          <Select
            multiple
            value={filters.artistIds}
            onChange={handleArtistChange}
            input={<OutlinedInput label="Artist" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((id) => {
                  const artist = artists.find((a) => a.id === id);
                  return (
                    <Chip
                      key={id}
                      label={artist?.name || 'Unknown'}
                      size="small"
                    />
                  );
                })}
              </Box>
            )}
          >
            {activeArtists.map((artist) => (
              <MenuItem key={artist.id} value={artist.id}>
                {artist.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Status Filter */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            multiple
            value={filters.statuses}
            onChange={handleStatusChange}
            input={<OutlinedInput label="Status" />}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selected.map((status) => (
                  <Chip key={status} label={status} size="small" />
                ))}
              </Box>
            )}
          >
            {statusOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* In Stock Toggle */}
        <FormControlLabel
          control={
            <Switch
              checked={filters.inStockOnly}
              onChange={handleInStockChange}
              size="small"
            />
          }
          label="In Stock Only"
          sx={{ ml: 1 }}
        />

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            onClick={handleClearFilters}
            startIcon={<ClearIcon />}
            size="small"
            color="inherit"
          >
            Clear
          </Button>
        )}
      </Box>

      {/* Results count */}
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {hasActiveFilters
            ? `Showing ${filteredCount} of ${totalCount} products`
            : `${totalCount} products`}
        </Typography>
      </Box>
    </Box>
  );
}
