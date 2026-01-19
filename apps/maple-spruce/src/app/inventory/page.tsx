'use client';

import { useState, useCallback, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Product, CreateProductInput, Artist } from '@maple/ts/domain';
import {
  ProductList,
  ProductForm,
  DeleteConfirmDialog,
} from '../../components/inventory';
import { AppShell } from '../../components/layout';
import { useProducts, useArtists } from '../../hooks';

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

  // Create artist lookup map for efficient name display
  const artistMap = useMemo(() => {
    if (artistsState.status !== 'success') return new Map<string, Artist>();
    return new Map(artistsState.data.map((a) => [a.id, a]));
  }, [artistsState]);

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

      <ProductList
        productsState={productsState}
        artistMap={artistMap}
        onEdit={handleOpenForm}
        onDelete={handleOpenDelete}
      />

      <ProductForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSubmit={handleSubmitForm}
        product={editingProduct}
        artists={artistsState.status === 'success' ? artistsState.data : []}
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
