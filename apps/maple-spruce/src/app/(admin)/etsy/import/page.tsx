'use client';

/**
 * Etsy Import admin page
 *
 * Lists the connected Etsy shop's active listings, shows which are
 * already imported as Products, and provides a bulk-import flow for
 * unsynced simple listings. Pull-only — no writes back to Etsy.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { GridRowSelectionModel } from '@mui/x-data-grid';
import { useArtists, useCategories, useEtsyListings, useEtsyImport } from '@maple/react/data';
import {
  EtsyImportTable,
  EtsyImportDialog,
  type EtsyImportDialogSubmit,
} from '../../../../components/etsy-import';

export default function EtsyImportPage() {
  const { listingsState, total, fetchListings } = useEtsyListings();
  const { artistsState } = useArtists();
  const { categoriesState } = useCategories();
  const { importState, importListings, reset: resetImport } = useEtsyImport();

  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [hideImported, setHideImported] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const artists = useMemo(
    () => (artistsState.status === 'success' ? artistsState.data : []),
    [artistsState]
  );
  const categories = useMemo(
    () => (categoriesState.status === 'success' ? categoriesState.data : []),
    [categoriesState]
  );
  const listings = useMemo(
    () => (listingsState.status === 'success' ? listingsState.data : []),
    [listingsState]
  );

  const handleImport = useCallback(
    async (values: EtsyImportDialogSubmit): Promise<void> => {
      const selectedIds = (selection as (string | number)[]).map(String);
      await importListings({
        listings: selectedIds.map((id) => ({ listingId: id })),
        artistId: values.artistId,
        categoryId: values.categoryId,
        status: values.status,
        customCommissionRate: values.customCommissionRate,
      });
      setDialogOpen(false);
      setSelection([]);
      // Refresh the listings so newly-imported rows show as "Imported".
      await fetchListings();
    },
    [selection, importListings, fetchListings]
  );

  const selectionCount = (selection as (string | number)[]).length;
  const isImporting = importState.status === 'loading';
  const importError =
    importState.status === 'error' ? importState.error : undefined;
  const importSummary =
    importState.status === 'success' ? importState.data : undefined;

  return (
    <>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Etsy Import
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review your existing Etsy listings and pull selected ones into the
          product catalog. This is read-only on Etsy — no writes are sent.
        </Typography>
      </Box>

      {listingsState.status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to fetch Etsy listings: {listingsState.error}
        </Alert>
      )}

      {importError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={resetImport}>
          Import failed: {importError}
        </Alert>
      )}

      {importSummary && (
        <Alert
          severity={importSummary.failureCount === 0 ? 'success' : 'warning'}
          sx={{ mb: 2 }}
          onClose={resetImport}
        >
          Imported {importSummary.successCount} listing
          {importSummary.successCount === 1 ? '' : 's'}.{' '}
          {importSummary.failureCount > 0 &&
            `${importSummary.failureCount} failed — see the status column or browser console for per-row errors.`}
        </Alert>
      )}

      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ mb: 2 }}
      >
        <Button
          variant="contained"
          disabled={selectionCount === 0 || isImporting}
          onClick={() => setDialogOpen(true)}
        >
          Import {selectionCount > 0 ? `${selectionCount} ` : ''}selected
        </Button>
        <FormControlLabel
          control={
            <Switch
              checked={hideImported}
              onChange={(e) => setHideImported(e.target.checked)}
              slotProps={{ input: { 'aria-label': 'Hide already imported' } }}
            />
          }
          label="Hide already-imported"
        />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {total} listing{total === 1 ? '' : 's'} on Etsy
        </Typography>
      </Stack>

      <EtsyImportTable
        rows={listings}
        selection={selection}
        onSelectionChange={setSelection}
        loading={listingsState.status === 'loading'}
        hideImported={hideImported}
      />

      <EtsyImportDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleImport}
        artists={artists}
        categories={categories}
        selectionCount={selectionCount}
        isSubmitting={isImporting}
      />
    </>
  );
}
