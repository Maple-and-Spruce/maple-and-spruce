'use client';

import { useEffect, useMemo } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import type { Product, ProductVariant } from '@maple/ts/domain';
import { isMultiVariant } from '@maple/ts/domain';
import {
  batch,
  useComputed,
  useSignal,
  useSignals,
} from '@maple/react/signals';
import type { RecordProductSaleRequest } from '@maple/ts/firebase/api-types';

interface RecordSaleDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Submit handler — receives a fully populated request. Resolve to indicate
   * success; throw to bubble an error message back into the dialog.
   */
  onSubmit: (request: RecordProductSaleRequest) => Promise<void>;
  /** All active products available for selection. */
  products: Product[];
  isSubmitting?: boolean;
}

/**
 * Manual sale-recording dialog. Picks a product (autocomplete by name +
 * SKU), then a variant (only shown for multi-variant products), then qty,
 * optional price override, and date. Submission goes through `recordSale`
 * which handles commission split + inventory decrement server-side.
 */
export function RecordSaleDialog({
  open,
  onClose,
  onSubmit,
  products,
  isSubmitting = false,
}: RecordSaleDialogProps) {
  useSignals();

  const productId = useSignal<string>('');
  const variantId = useSignal<string>('');
  const quantitySold = useSignal<number>(1);
  /** Per-unit override, in dollars. Empty string = "use product price". */
  const overrideDollars = useSignal<number | ''>('');
  /** yyyy-mm-dd; empty = "now" on the server. */
  const soldAtDate = useSignal<string>('');
  const submitError = useSignal<string | null>(null);

  useEffect(() => {
    if (!open) return;
    batch(() => {
      productId.value = '';
      variantId.value = '';
      quantitySold.value = 1;
      overrideDollars.value = '';
      soldAtDate.value = '';
      submitError.value = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const productOptions = useMemo(
    () => products.filter((p) => p.status === 'active'),
    [products]
  );

  const selectedProduct = useComputed<Product | undefined>(() =>
    productOptions.find((p) => p.id === productId.value)
  );

  const variants = useComputed<ProductVariant[]>(() =>
    selectedProduct.value?.variants ?? []
  );

  const needsVariantPick = useComputed<boolean>(() =>
    selectedProduct.value ? isMultiVariant(selectedProduct.value) : false
  );

  const canSubmit = useComputed(
    () =>
      !!productId.value &&
      (!needsVariantPick.value || !!variantId.value) &&
      quantitySold.value > 0 &&
      !isSubmitting
  );

  const handleSubmit = async () => {
    if (!canSubmit.value) return;
    submitError.value = null;

    const request: RecordProductSaleRequest = {
      productId: productId.value,
      quantitySold: quantitySold.value,
    };

    if (needsVariantPick.value) {
      request.variantId = variantId.value;
    } else if (variants.value.length === 1) {
      request.variantId = variants.value[0].id;
    }

    if (
      overrideDollars.value !== '' &&
      !Number.isNaN(overrideDollars.value)
    ) {
      request.salePriceCents = Math.round(overrideDollars.value * 100);
    }

    if (soldAtDate.value) {
      // Treat the date as local end-of-day so it sorts as that day.
      request.soldAt = new Date(`${soldAtDate.value}T12:00:00`).toISOString();
    }

    try {
      await onSubmit(request);
      onClose();
    } catch (error: unknown) {
      submitError.value =
        error instanceof Error ? error.message : 'Failed to record sale';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Record a manual sale</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {submitError.value && (
            <Alert
              severity="error"
              onClose={() => (submitError.value = null)}
            >
              {submitError.value}
            </Alert>
          )}

          <Autocomplete
            options={productOptions}
            value={selectedProduct.value ?? null}
            onChange={(_, value) => {
              productId.value = value?.id ?? '';
              variantId.value = '';
            }}
            getOptionLabel={(p) => p.squareCache?.name ?? p.id}
            renderInput={(params) => (
              <TextField {...params} label="Product" required />
            )}
            isOptionEqualToValue={(option, value) => option.id === value.id}
          />

          {needsVariantPick.value && (
            <FormControl fullWidth required>
              <InputLabel id="record-sale-variant-label">Variant</InputLabel>
              <Select
                labelId="record-sale-variant-label"
                label="Variant"
                value={variantId.value}
                onChange={(e) => (variantId.value = e.target.value as string)}
              >
                {variants.value.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.label} — ${(v.priceCents / 100).toFixed(2)} (
                    {v.quantity} in stock)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            label="Quantity sold"
            type="number"
            value={quantitySold.value}
            onChange={(e) =>
              (quantitySold.value = parseInt(e.target.value, 10) || 0)
            }
            inputProps={{ min: 1 }}
            required
            fullWidth
          />

          <TextField
            label="Override price (per unit)"
            type="number"
            value={overrideDollars.value}
            onChange={(e) => {
              const v = e.target.value;
              overrideDollars.value = v === '' ? '' : parseFloat(v);
            }}
            helperText="Leave blank to use the product's current price."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">$</InputAdornment>
              ),
            }}
            inputProps={{ step: 0.01, min: 0 }}
            fullWidth
          />

          <TextField
            label="Sale date"
            type="date"
            value={soldAtDate.value}
            onChange={(e) => (soldAtDate.value = e.target.value)}
            helperText="Leave blank to use today."
            InputLabelProps={{ shrink: true }}
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
          disabled={!canSubmit.value}
        >
          {isSubmitting ? 'Recording…' : 'Record sale'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
