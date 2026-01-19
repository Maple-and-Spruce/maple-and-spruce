'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type {
  Product,
  CreateProductInput,
  Artist,
  Category,
} from '@maple/ts/domain';
import {
  ProductDataTable,
  ProductFilterToolbar,
  ProductForm,
  DeleteConfirmDialog,
  defaultFilters,
} from '../../components/inventory';
import type { ProductFilters } from '../../components/inventory';
import { AppShell } from '../../components/layout';
import { useProducts, useArtists, useCategories } from '../../hooks';

export default function InventoryPage() {
  // Product state from hook (fetches on mount)
  const {
    productsState,
    createProduct,
    updateProduct,
    deleteProduct: deleteProductApi,
  } = useProducts();

  // Artist state for dropdown and display
  const { artistsState } = useArtists();

  // Category state for dropdown and display
  const { categoriesState } = useCategories();

  // Filter state
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters);

  // Create artist lookup map for efficient name display
  const artistMap = useMemo(() => {
    if (artistsState.status !== 'success') return new Map<string, Artist>();
    return new Map(artistsState.data.map((a) => [a.id, a]));
  }, [artistsState]);

  // Create category lookup map for efficient name display
  const categoryMap = useMemo(() => {
    if (categoriesState.status !== 'success')
      return new Map<string, Category>();
    return new Map(categoriesState.data.map((c) => [c.id, c]));
  }, [categoriesState]);

  // Apply filters to products
  const filteredProducts = useMemo(() => {
    if (productsState.status !== 'success') return [];

    let result = productsState.data;

    // Search filter
    if (filters.search.trim()) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter((p) => {
        const name = p.squareCache?.name?.toLowerCase() || '';
        const sku = p.squareCache?.sku?.toLowerCase() || '';
        const description = p.squareCache?.description?.toLowerCase() || '';
        return (
          name.includes(searchLower) ||
          sku.includes(searchLower) ||
          description.includes(searchLower)
        );
      });
    }

    // Category filter
    if (filters.categoryIds.length > 0) {
      result = result.filter((p) => {
        // Handle uncategorized filter (empty string in categoryIds)
        if (filters.categoryIds.includes('')) {
          return !p.categoryId || filters.categoryIds.includes(p.categoryId);
        }
        return p.categoryId && filters.categoryIds.includes(p.categoryId);
      });
    }

    // Artist filter
    if (filters.artistIds.length > 0) {
      result = result.filter((p) => filters.artistIds.includes(p.artistId));
    }

    // Status filter
    if (filters.statuses.length > 0) {
      result = result.filter((p) => filters.statuses.includes(p.status));
    }

    // In stock only
    if (filters.inStockOnly) {
      result = result.filter((p) => (p.squareCache?.quantity || 0) > 0);
    }

    return result;
  }, [productsState, filters]);

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenForm = useCallback((product?: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingProduct(undefined);
  }, []);

  const handleSubmitForm = useCallback(
    async (data: CreateProductInput) => {
      setIsSubmitting(true);

      try {
        if (editingProduct) {
          await updateProduct({ id: editingProduct.id, ...data });
        } else {
          await createProduct(data);
        }
        // Form handles closing on success
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingProduct, createProduct, updateProduct]
  );

  const handleOpenDelete = useCallback((product: Product) => {
    setProductToDelete(product);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setProductToDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!productToDelete) return;

    setIsDeleting(true);

    try {
      await deleteProductApi(productToDelete.id);
      handleCloseDelete();
    } catch (error) {
      console.error('Failed to delete product:', error);
      // TODO: Show error toast
    } finally {
      setIsDeleting(false);
    }
  }, [productToDelete, handleCloseDelete, deleteProductApi]);

  const totalCount =
    productsState.status === 'success' ? productsState.data.length : 0;

  return (
    <AppShell>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Inventory
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenForm()}
        >
          Add Product
        </Button>
      </Box>

      <ProductFilterToolbar
        filters={filters}
        onFiltersChange={setFilters}
        artists={artistsState.status === 'success' ? artistsState.data : []}
        categories={
          categoriesState.status === 'success' ? categoriesState.data : []
        }
        totalCount={totalCount}
        filteredCount={filteredProducts.length}
      />

      <ProductDataTable
        productsState={productsState}
        artistMap={artistMap}
        categoryMap={categoryMap}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
        filteredProducts={filteredProducts}
      />

      <ProductForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        product={editingProduct}
        artists={artistsState.status === 'success' ? artistsState.data : []}
        categories={
          categoriesState.status === 'success' ? categoriesState.data : []
        }
        isSubmitting={isSubmitting}
      />

      <DeleteConfirmDialog
        open={!!productToDelete}
        product={productToDelete}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />
    </AppShell>
  );
}
