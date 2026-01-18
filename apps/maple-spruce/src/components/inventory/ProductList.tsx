'use client';

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Grid2 as Grid,
  Skeleton,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Product } from '@maple/ts/domain';
import type { RequestState } from '@maple/ts/domain';

interface ProductListProps {
  productsState: RequestState<Product[]>;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

const statusColors: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  draft: 'warning',
  discontinued: 'default',
};

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h3">
              {product.name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {product.description || 'No description'}
            </Typography>
            <Typography variant="h5" color="primary" sx={{ mb: 1 }}>
              ${product.price.toFixed(2)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={product.status}
                size="small"
                color={statusColors[product.status]}
              />
              {product.sku && (
                <Chip label={`SKU: ${product.sku}`} size="small" variant="outlined" />
              )}
              {product.etsyListingId && (
                <Chip label="Etsy" size="small" variant="outlined" color="info" />
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton onClick={onEdit} size="small" aria-label="Edit">
              <EditIcon />
            </IconButton>
            <IconButton
              onClick={onDelete}
              size="small"
              aria-label="Delete"
              color="error"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3].map((i) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
          <Card>
            <CardContent>
              <Skeleton variant="text" width="60%" height={32} />
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="40%" height={40} />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Skeleton variant="rounded" width={80} height={24} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

export function ProductList({
  productsState,
  onEdit,
  onDelete,
}: ProductListProps) {
  if (productsState.status === 'loading') {
    return <LoadingSkeleton />;
  }

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

  const products = productsState.data;

  if (products.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 8,
          color: 'text.secondary',
        }}
      >
        <Typography variant="h6">No products yet</Typography>
        <Typography>Click "Add Product" to get started</Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={2}>
      {products.map((product) => (
        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={product.id}>
          <ProductCard
            product={product}
            onEdit={() => onEdit(product)}
            onDelete={() => onDelete(product)}
          />
        </Grid>
      ))}
    </Grid>
  );
}
