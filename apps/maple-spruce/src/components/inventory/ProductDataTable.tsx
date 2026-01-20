'use client';

import { useMemo } from 'react';
import { Box, Chip, IconButton, Typography, Alert, Paper } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Product, Artist, Category, RequestState } from '@maple/ts/domain';
import { formatPrice } from '@maple/ts/domain';
import { surfaces, borders, radii, shadows } from '@maple/react/theme';

interface ProductDataTableProps {
  productsState: RequestState<Product[]>;
  artistMap: Map<string, Artist>;
  categoryMap: Map<string, Category>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  /** Optional filtered products - if provided, uses these instead of productsState */
  filteredProducts?: Product[];
}

const statusColors: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  draft: 'warning',
  discontinued: 'default',
};

export function ProductDataTable({
  productsState,
  artistMap,
  categoryMap,
  onEdit,
  onDelete,
  filteredProducts,
}: ProductDataTableProps) {
  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: 'image',
        headerName: '',
        width: 60,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<Product>) => {
          const imageUrl = params.row.squareCache?.imageUrl;
          return imageUrl ? (
            <Box
              component="img"
              src={imageUrl}
              alt={params.row.squareCache?.name || 'Product'}
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
        field: 'name',
        headerName: 'Name',
        flex: 1,
        minWidth: 200,
        valueGetter: (_value, row: Product) => row.squareCache?.name || '',
      },
      {
        field: 'category',
        headerName: 'Category',
        width: 150,
        valueGetter: (_value, row: Product) => {
          if (!row.categoryId) return 'Uncategorized';
          return categoryMap.get(row.categoryId)?.name || 'Unknown';
        },
        renderCell: (params: GridRenderCellParams) => (
          <Chip
            label={params.value as string}
            size="small"
            variant={params.value === 'Uncategorized' ? 'outlined' : 'filled'}
            color={params.value === 'Uncategorized' ? 'default' : 'primary'}
          />
        ),
      },
      {
        field: 'artist',
        headerName: 'Artist',
        width: 150,
        valueGetter: (_value, row: Product) => {
          return artistMap.get(row.artistId)?.name || 'Unknown';
        },
      },
      {
        field: 'price',
        headerName: 'Price',
        width: 100,
        valueGetter: (_value, row: Product) =>
          row.squareCache?.priceCents || 0,
        renderCell: (params: GridRenderCellParams) => (
          <Typography variant="body2" fontWeight="medium">
            {formatPrice(params.value as number)}
          </Typography>
        ),
      },
      {
        field: 'quantity',
        headerName: 'Qty',
        width: 80,
        valueGetter: (_value, row: Product) => row.squareCache?.quantity || 0,
        renderCell: (params: GridRenderCellParams) => {
          const qty = params.value as number;
          return (
            <Chip
              label={qty}
              size="small"
              color={qty === 0 ? 'error' : qty <= 5 ? 'warning' : 'default'}
              variant="outlined"
            />
          );
        },
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: (params: GridRenderCellParams<Product>) => (
          <Chip
            label={params.row.status}
            size="small"
            color={statusColors[params.row.status] || 'default'}
          />
        ),
      },
      {
        field: 'sku',
        headerName: 'SKU',
        width: 130,
        valueGetter: (_value, row: Product) => row.squareCache?.sku || '',
      },
      {
        field: 'actions',
        headerName: '',
        width: 100,
        sortable: false,
        filterable: false,
        renderCell: (params: GridRenderCellParams<Product>) => (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              onClick={() => onEdit(params.row)}
              size="small"
              aria-label="Edit"
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <IconButton
              onClick={() => onDelete(params.row)}
              size="small"
              aria-label="Delete"
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [artistMap, categoryMap, onEdit, onDelete]
  );

  if (productsState.status === 'error') {
    return (
      <Alert severity="error">
        Failed to load products: {productsState.error}
      </Alert>
    );
  }

  if (productsState.status === 'idle') {
    return null;
  }

  // Use filtered products if provided, otherwise use all products from state
  const products =
    filteredProducts ??
    (productsState.status === 'success' ? productsState.data : []);

  if (productsState.status === 'success' && productsState.data.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No products yet</Typography>
        <Typography>Click &quot;Add Product&quot; to get started</Typography>
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
        rows={products}
        columns={columns}
        loading={productsState.status === 'loading'}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 25 } },
          sorting: { sortModel: [{ field: 'name', sort: 'asc' }] },
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
