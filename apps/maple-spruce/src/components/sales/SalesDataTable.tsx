'use client';

import { useMemo } from 'react';
import { Alert, Box, Chip, Paper, Typography } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid';
import type {
  Artist,
  Product,
  RequestState,
  Sale,
  SaleSource,
} from '@maple/ts/domain';
import { findVariant } from '@maple/ts/domain';
import { surfaces, borders, radii, shadows } from '@maple/react/theme';

interface SalesDataTableProps {
  salesState: RequestState<Sale[]>;
  productMap: Map<string, Product>;
  artistMap: Map<string, Artist>;
}

const sourceColor: Record<SaleSource, 'primary' | 'secondary' | 'default'> = {
  square: 'primary',
  etsy: 'secondary',
  manual: 'default',
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function SalesDataTable({
  salesState,
  productMap,
  artistMap,
}: SalesDataTableProps) {
  const columns: GridColDef<Sale>[] = useMemo(
    () => [
      {
        field: 'soldAt',
        headerName: 'Date',
        width: 110,
        valueGetter: (_value, row) => row.soldAt,
        renderCell: (params: GridRenderCellParams<Sale>) => {
          const d = params.row.soldAt;
          if (!d) return '';
          return d.toLocaleDateString();
        },
      },
      {
        field: 'product',
        headerName: 'Product',
        flex: 1,
        minWidth: 200,
        valueGetter: (_value, row) =>
          productMap.get(row.productId)?.squareCache?.name ?? row.productId,
      },
      {
        field: 'variant',
        headerName: 'Variant',
        width: 120,
        valueGetter: (_value, row) => {
          if (!row.variantId) return '—';
          const product = productMap.get(row.productId);
          if (!product) return row.variantId;
          const variant = findVariant(product, row.variantId);
          return variant?.label ?? row.variantId;
        },
      },
      {
        field: 'artist',
        headerName: 'Artist',
        width: 150,
        valueGetter: (_value, row) =>
          artistMap.get(row.artistId)?.name ?? 'Unknown',
      },
      {
        field: 'quantitySold',
        headerName: 'Qty',
        width: 70,
        type: 'number',
      },
      {
        field: 'salePrice',
        headerName: 'Sale price',
        width: 110,
        type: 'number',
        valueFormatter: (value: number) => formatCurrency(value ?? 0),
      },
      {
        field: 'commission',
        headerName: 'Commission',
        width: 110,
        type: 'number',
        valueFormatter: (value: number) => formatCurrency(value ?? 0),
      },
      {
        field: 'artistEarnings',
        headerName: 'Artist earnings',
        width: 130,
        type: 'number',
        valueFormatter: (value: number) => formatCurrency(value ?? 0),
      },
      {
        field: 'source',
        headerName: 'Source',
        width: 120,
        renderCell: (params: GridRenderCellParams<Sale>) => (
          <Chip
            label={params.row.source}
            size="small"
            color={sourceColor[params.row.source]}
            variant="outlined"
          />
        ),
      },
    ],
    [productMap, artistMap]
  );

  if (salesState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load sales: {salesState.error}
      </Alert>
    );
  }

  if (salesState.status === 'idle') {
    return null;
  }

  const sales = salesState.status === 'success' ? salesState.data : [];

  if (salesState.status === 'success' && sales.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
        <Typography variant="h6">No sales yet</Typography>
        <Typography>
          Sales recorded on Square or Etsy show up here automatically. Use
          &quot;Record Sale&quot; for manual entries.
        </Typography>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        backgroundColor: surfaces.paper,
        borderRadius: `${radii.lg}px`,
        border: `1px solid ${borders.default}`,
        boxShadow: shadows.sm,
        overflow: 'hidden',
      }}
    >
      <DataGrid
        rows={sales}
        columns={columns}
        loading={salesState.status === 'loading'}
        pageSizeOptions={[10, 25, 50, 100]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'soldAt', sort: 'desc' }] },
        }}
        disableRowSelectionOnClick
        autoHeight
        sx={{
          border: 'none',
          backgroundColor: surfaces.paper,
          '--DataGrid-containerBackground': surfaces.tableHeader,
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: surfaces.tableHeader,
            borderBottom: `1px solid ${borders.subtle}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
          },
          '& .MuiDataGrid-cell': {
            display: 'flex',
            alignItems: 'center',
            borderColor: borders.subtle,
          },
          '& .MuiDataGrid-row:last-child .MuiDataGrid-cell': {
            borderBottom: 'none',
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: `1px solid ${borders.subtle}`,
          },
        }}
      />
    </Paper>
  );
}
