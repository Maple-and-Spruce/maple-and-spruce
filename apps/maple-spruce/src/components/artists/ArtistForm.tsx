'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
} from '@mui/material';
import type { Artist, CreateArtistInput, ArtistStatus } from '@maple/ts/domain';

interface ArtistFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateArtistInput) => Promise<void>;
  artist?: Artist;
  isSubmitting?: boolean;
}

const defaultFormData: CreateArtistInput = {
  name: '',
  email: '',
  phone: '',
  defaultCommissionRate: 0.4, // 40% to store, 60% to artist
  status: 'active',
  notes: '',
};

/**
 * Basic client-side validation
 * Full validation happens on the server with vest
 */
function validateForm(data: CreateArtistInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!data.name?.trim()) {
    errors.name = 'Name is required';
  } else if (data.name.length < 2) {
    errors.name = 'Name must be at least 2 characters';
  }

  if (!data.email?.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Email must be valid';
  }

  if (data.phone && !/^[\d\s\-+()]+$/.test(data.phone)) {
    errors.phone = 'Phone must be valid';
  }

  if (
    data.defaultCommissionRate === undefined ||
    data.defaultCommissionRate === null
  ) {
    errors.defaultCommissionRate = 'Commission rate is required';
  } else if (data.defaultCommissionRate < 0 || data.defaultCommissionRate > 1) {
    errors.defaultCommissionRate = 'Commission rate must be between 0% and 100%';
  }

  if (!data.status) {
    errors.status = 'Status is required';
  }

  return errors;
}

export function ArtistForm({
  open,
  onClose,
  onSubmit,
  artist,
  isSubmitting = false,
}: ArtistFormProps) {
  const [formData, setFormData] = useState<CreateArtistInput>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEdit = !!artist;

  useEffect(() => {
    if (artist) {
      setFormData({
        name: artist.name,
        email: artist.email,
        phone: artist.phone ?? '',
        defaultCommissionRate: artist.defaultCommissionRate,
        status: artist.status,
        notes: artist.notes ?? '',
      });
    } else {
      setFormData(defaultFormData);
    }
    setErrors({});
    setSubmitError(null);
  }, [artist, open]);

  const handleChange = (
    field: keyof CreateArtistInput,
    value: string | number | ArtistStatus
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error when field changes
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitError(null);

    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to save artist'
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Artist' : 'Add Artist'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <TextField
            label="Name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={!!errors.name}
            helperText={errors.name}
            required
            fullWidth
          />

          <TextField
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            error={!!errors.email}
            helperText={errors.email}
            required
            fullWidth
          />

          <TextField
            label="Phone"
            value={formData.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            error={!!errors.phone}
            helperText={errors.phone || 'Optional'}
            fullWidth
          />

          <TextField
            label="Commission Rate (to store)"
            type="number"
            value={Math.round(formData.defaultCommissionRate * 100)}
            onChange={(e) =>
              handleChange(
                'defaultCommissionRate',
                (parseFloat(e.target.value) || 0) / 100
              )
            }
            error={!!errors.defaultCommissionRate}
            helperText={
              errors.defaultCommissionRate ||
              `Store keeps ${Math.round(formData.defaultCommissionRate * 100)}%, artist gets ${Math.round((1 - formData.defaultCommissionRate) * 100)}%`
            }
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
              inputProps: { min: 0, max: 100 },
            }}
            required
            fullWidth
          />

          <FormControl fullWidth error={!!errors.status}>
            <InputLabel>Status</InputLabel>
            <Select
              value={formData.status}
              label="Status"
              onChange={(e) =>
                handleChange('status', e.target.value as ArtistStatus)
              }
            >
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            multiline
            rows={3}
            helperText="Optional internal notes about this artist"
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
