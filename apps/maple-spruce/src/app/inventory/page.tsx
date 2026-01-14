'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  AppBar,
  Toolbar,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { Product, CreateProductInput } from '@maple/ts/domain';
import {
  ProductList,
  ProductForm,
  DeleteConfirmDialog,
} from '../../components/inventory';
import { UserMenu } from '../../components/auth';
import { useProducts } from '../../hooks';

export default function InventoryPage() {
  // Product state from hook (fetches on mount)
  const {
    productsState,
    createProduct,
    updateProduct,
    deleteProduct: deleteProductApi,
  } = useProducts();

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
        handleCloseForm();
      } catch (error) {
        console.error('Failed to save product:', error);
        // TODO: Show error toast
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingProduct, handleCloseForm, createProduct, updateProduct]
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Maple & Spruce
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Typography variant="h4" component="h2">
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
          onEdit={handleOpenForm}
          onDelete={handleOpenDelete}
        />

        <ProductForm
          open={isFormOpen}
          onClose={handleCloseForm}
          onSubmit={handleSubmitForm}
          product={editingProduct}
          isSubmitting={isSubmitting}
        />

        <DeleteConfirmDialog
          open={!!productToDelete}
          product={productToDelete}
          onClose={handleCloseDelete}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      </Container>
    </Box>
  );
}
