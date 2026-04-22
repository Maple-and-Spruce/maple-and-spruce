'use client';

/**
 * Table of Etsy listings for review + bulk import selection.
 *
 * Shows each Etsy listing with its current sync status (imported or
 * available for import). All listings including multi-variant are
 * importable.
 */
import { useMemo } from 'react';
import {
  Box,
  Chip,
  Typography,
} from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  type GridRowSelectionModel,
  type GridRowParams,
} from '@mui/x-data-grid';
import type { EtsyListingWithSyncInfo } from '@maple/ts/firebase/api-types';

export interface EtsyImportTableProps {
  rows: EtsyListingWithSyncInfo[];
  selection: GridRowSelectionModel;
  onSelectionChange: (selection: GridRowSelectionModel) => void;
  loading?: boolean;
  /** Hide rows where imported===true. Default: true. */
  hideImported?: boolean;
}

function formatEtsyPrice(
  price: EtsyListingWithSyncInfo['listing']['price']
): string {
  if (!price || !price.divisor) return '—';
  const dollars = price.amount / price.divisor;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency_code ?? 'USD',
  }).format(dollars);
}

export function EtsyImportTable({
  rows,
  selection,
  onSelectionChange,
  loading = false,
  hideImported = true,
}: EtsyImportTableProps) {
  const visibleRows = useMemo(
    () => (hideImported ? rows.filter((r) => !r.imported) : rows),
    [rows, hideImported]
  );

  const columns: GridColDef<EtsyListingWithSyncInfo>[] = useMemo(
    () => [
      {
        field: 'image',
        headerName: '',
        width: 60,
        sortable: false,
        filterable: false,
        renderCell: (
          params: GridRenderCellParams<EtsyListingWithSyncInfo>
        ) => {
          const img = params.row.listing.images?.[0]?.url_170x135;
          return img ? (
            <Box
              component="img"
              src={img}
              alt={params.row.listing.title}
              sx={{
                width: 40,
                height: 40,
                objectFit: 'cover',
                borderRadius: 1,
              }}
            />
          ) : (
            <Box
              sx={{
                width: 40,
                height: 40,
                bgcolor: 'grey.200',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                —
              </Typography>
            </Box>
          );
        },
      },
      {
        field: 'title',
        headerName: 'Title',
        flex: 1,
        minWidth: 220,
        valueGetter: (_value, row) => row.listing.title,
      },
      {
        field: 'price',
        headerName: 'Price',
        width: 100,
        valueGetter: (_value, row) => formatEtsyPrice(row.listing.price),
      },
      {
        field: 'quantity',
        headerName: 'Qty',
        width: 70,
        valueGetter: (_value, row) => row.listing.quantity,
      },
      {
        field: 'variants',
        headerName: 'Variants',
        width: 110,
        renderCell: (
          params: GridRenderCellParams<EtsyListingWithSyncInfo>
        ) =>
          params.row.variantCount <= 1 ? (
            <Chip size="small" label="Simple" variant="outlined" />
          ) : (
            <Chip
              size="small"
              label={`${params.row.variantCount} variants`}
              color="info"
            />
          ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 130,
        renderCell: (
          params: GridRenderCellParams<EtsyListingWithSyncInfo>
        ) => {
          if (params.row.imported) {
            return <Chip size="small" label="Imported" color="success" />;
          }
          return <Chip size="small" label="Available" variant="outlined" />;
        },
      },
    ],
    []
  );

  const isRowSelectable = (params: GridRowParams<EtsyListingWithSyncInfo>) =>
    !params.row.imported;

  return (
    <DataGrid
      autoHeight
      rows={visibleRows}
      columns={columns}
      getRowId={(row) => row.listing.listing_id}
      loading={loading}
      checkboxSelection
      disableRowSelectionOnClick
      isRowSelectable={isRowSelectable}
      rowSelectionModel={selection}
      onRowSelectionModelChange={onSelectionChange}
      initialState={{
        pagination: { paginationModel: { pageSize: 25 } },
        sorting: { sortModel: [{ field: 'title', sort: 'asc' }] },
      }}
      pageSizeOptions={[25, 50, 100]}
    />
  );
}
