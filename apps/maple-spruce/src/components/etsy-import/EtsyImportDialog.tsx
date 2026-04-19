'use client';

/**
 * Dialog for bulk-applying shared Product attributes (artist, category,
 * status, optional commission override) to a set of selected Etsy
 * listings before kicking off the import.
 *
 * Uses Preact Signals (per ADR-015) — matches InstructorForm's shape.
 */
import { useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import type { Artist, Category, ProductStatus } from '@maple/ts/domain';
import {
  useSignal,
  useComputed,
  useSignals,
  batch,
} from '@maple/react/signals';

export interface EtsyImportDialogSubmit {
  artistId: string;
  categoryId?: string;
  status: ProductStatus;
  customCommissionRate?: number;
}

export interface EtsyImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EtsyImportDialogSubmit) => Promise<void>;
  artists: Artist[];
  categories: Category[];
  /** How many listings will be imported — shown in the dialog header. */
  selectionCount: number;
  /** Controlled from the parent so the parent can disable while in flight. */
  isSubmitting?: boolean;
}

const STATUSES: ProductStatus[] = ['active', 'draft', 'discontinued'];

export function EtsyImportDialog({
  open,
  onClose,
  onSubmit,
  artists,
  categories,
  selectionCount,
  isSubmitting = false,
}: EtsyImportDialogProps) {
  useSignals();

  const artistId = useSignal<string>('');
  const categoryId = useSignal<string>('');
  const status = useSignal<ProductStatus>('active');
  const commissionRateText = useSignal<string>('');

  // Reset the form every time the dialog opens so stale entries from a
  // previous batch don't carry over.
  useEffect(() => {
    if (open) {
      batch(() => {
        artistId.value = '';
        categoryId.value = '';
        status.value = 'active';
        commissionRateText.value = '';
      });
    }
  }, [open, artistId, categoryId, status, commissionRateText]);

  const commissionRateParsed = useComputed<number | undefined>(() => {
    const raw = commissionRateText.value.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return n;
  });

  const commissionError = useComputed<string | undefined>(() => {
    const raw = commissionRateText.value.trim();
    if (!raw) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 'Commission rate must be a number';
    if (n < 0 || n > 1) return 'Commission rate must be between 0 and 1';
    return undefined;
  });

  const canSubmit = useComputed(
    () =>
      !!artistId.value &&
      !!status.value &&
      !commissionError.value &&
      !isSubmitting &&
      selectionCount > 0
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit.value) return;
    await onSubmit({
      artistId: artistId.value,
      categoryId: categoryId.value || undefined,
      status: status.value,
      customCommissionRate: commissionRateParsed.value,
    });
  }, [
    canSubmit,
    onSubmit,
    artistId,
    categoryId,
    status,
    commissionRateParsed,
  ]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import {selectionCount} Etsy listing{selectionCount === 1 ? '' : 's'}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          These values will be applied to every selected listing. You can
          edit individual products after import.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <FormControl fullWidth required>
            <InputLabel id="etsy-import-artist-label">Artist</InputLabel>
            <Select
              labelId="etsy-import-artist-label"
              label="Artist"
              value={artistId.value}
              onChange={(e) => {
                artistId.value = e.target.value as string;
              }}
              inputProps={{ 'aria-label': 'Artist' }}
            >
              {artists.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="etsy-import-category-label">
              Category (optional)
            </InputLabel>
            <Select
              labelId="etsy-import-category-label"
              label="Category (optional)"
              value={categoryId.value}
              onChange={(e) => {
                categoryId.value = e.target.value as string;
              }}
              inputProps={{ 'aria-label': 'Category' }}
            >
              <MenuItem value="">
                <em>Uncategorized</em>
              </MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth required>
            <InputLabel id="etsy-import-status-label">Status</InputLabel>
            <Select
              labelId="etsy-import-status-label"
              label="Status"
              value={status.value}
              onChange={(e) => {
                status.value = e.target.value as ProductStatus;
              }}
              inputProps={{ 'aria-label': 'Status' }}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Commission override (optional, 0.0 – 1.0)"
            value={commissionRateText.value}
            onChange={(e) => {
              commissionRateText.value = e.target.value;
            }}
            error={!!commissionError.value}
            helperText={
              commissionError.value ??
              'Leave blank to use the artist default commission.'
            }
            inputProps={{ inputMode: 'decimal', 'aria-label': 'Commission override' }}
          />

          <Typography variant="caption" color="text.secondary">
            Listings with multiple variants are not supported in this import
            pass and will be skipped automatically.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit.value}
        >
          {isSubmitting ? 'Importing…' : `Import ${selectionCount}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
