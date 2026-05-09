'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Link as MuiLink,
  Stack,
  Typography,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import StoreIcon from '@mui/icons-material/Store';
import type { Product } from '@maple/ts/domain';
import { useEtsyPush } from '@maple/react/data';

interface ProductEtsySectionProps {
  product: Product;
  /**
   * Called after a successful push or update so the parent can refresh
   * its product cache. The updated product (with etsyListingId, etc.)
   * is passed through.
   */
  onPushed?: (updated: Product) => void;
}

function etsyListingUrl(etsyListingId: string): string {
  return `https://www.etsy.com/listing/${etsyListingId}`;
}

/**
 * Push-to-Etsy controls inside the product edit dialog. Shows current
 * sync state (listed / not listed) and exposes "Push" or "Update"
 * actions backed by the corresponding cloud function.
 */
export function ProductEtsySection({
  product,
  onPushed,
}: ProductEtsySectionProps) {
  const { pushState, updateState, pushToEtsy, updateEtsyListing } =
    useEtsyPush();
  const [success, setSuccess] = useState<string | null>(null);

  const isListed = !!product.etsyListingId;
  const inFlight =
    pushState.status === 'loading' || updateState.status === 'loading';
  const errorMessage =
    pushState.status === 'error'
      ? pushState.error
      : updateState.status === 'error'
        ? updateState.error
        : null;

  const handlePush = async () => {
    setSuccess(null);
    const result = await pushToEtsy(product.id);
    if (result.success && result.product) {
      setSuccess('Draft listing created on Etsy.');
      onPushed?.(result.product);
    } else if (!result.success && result.error) {
      // Error already surfaced via pushState; nothing to do here.
    }
  };

  const handleUpdate = async () => {
    setSuccess(null);
    const result = await updateEtsyListing(product.id);
    if (result.success && result.product) {
      setSuccess('Etsy listing updated.');
      onPushed?.(result.product);
    }
  };

  return (
    <>
      <Divider textAlign="left">
        <Typography variant="overline" color="text.secondary">
          Etsy
        </Typography>
      </Divider>

      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <StoreIcon fontSize="small" color={isListed ? 'success' : 'disabled'} />
          {isListed ? (
            <>
              <Chip label="Listed on Etsy" size="small" color="success" />
              {product.etsyListingId && (
                <MuiLink
                  href={etsyListingUrl(product.etsyListingId)}
                  target="_blank"
                  rel="noopener"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  View listing
                  <LaunchIcon fontSize="inherit" />
                </MuiLink>
              )}
            </>
          ) : (
            <Chip label="Not on Etsy" size="small" />
          )}
        </Stack>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {errorMessage}
          </Alert>
        )}
        {success && !errorMessage && (
          <Alert severity="success" sx={{ mb: 1 }}>
            {success}
          </Alert>
        )}

        <Stack direction="row" spacing={1}>
          {isListed ? (
            <Button
              variant="outlined"
              size="small"
              onClick={handleUpdate}
              disabled={inFlight}
            >
              {updateState.status === 'loading'
                ? 'Updating…'
                : 'Update Etsy listing'}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              onClick={handlePush}
              disabled={inFlight}
            >
              {pushState.status === 'loading' ? 'Pushing…' : 'Push to Etsy'}
            </Button>
          )}
        </Stack>

        {!isListed && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            Creates a draft listing on your Etsy shop. You can review and
            activate it from Etsy directly.
          </Typography>
        )}
      </Box>
    </>
  );
}
