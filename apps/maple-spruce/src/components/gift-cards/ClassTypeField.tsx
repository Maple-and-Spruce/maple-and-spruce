'use client';

import { Alert, MenuItem, Skeleton, TextField, Typography } from '@mui/material';
import type { ClassCategory, RequestState } from '@maple/ts/domain';

interface ClassTypeFieldProps {
  categoriesState: RequestState<ClassCategory[]>;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Pick a class type (class category). While the types load it is a skeleton,
 * never an empty list; a failed load says so.
 */
export function ClassTypeField({
  categoriesState,
  value,
  onChange,
  error,
  disabled,
}: ClassTypeFieldProps) {
  if (categoriesState.status === 'idle' || categoriesState.status === 'loading') {
    return (
      <Skeleton
        variant="rounded"
        height={56}
        aria-busy="true"
        aria-label="Loading class types"
      />
    );
  }
  if (categoriesState.status === 'error') {
    return (
      <Alert severity="error">
        Couldn&apos;t load the class types: {categoriesState.error}
      </Alert>
    );
  }
  if (categoriesState.data.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        There are no class types yet. Add one under Classes, then come back.
      </Typography>
    );
  }
  return (
    <TextField
      select
      label="Class type"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={Boolean(error)}
      helperText={error ?? 'Good for one class of this type.'}
      disabled={disabled}
      required
      fullWidth
    >
      {categoriesState.data.map((category) => (
        <MenuItem key={category.id} value={category.id}>
          {category.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
