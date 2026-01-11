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
import type { Product, CreateProductInput, RequestState } from '@maple/ts/domain';
import {
  ProductList,
  ProductForm,
  DeleteConfirmDialog,
} from '../../components/inventory';

/**
 * Mock data for development - will be replaced with Firebase calls
 */
const mockProducts: Product[] = [
  {
    id: '1',
    artistId: 'artist-1',
    name: 'Handwoven Wool Scarf',
    description: 'Beautiful handwoven scarf made with local wool',
    price: 85.0,
    sku: 'SCARF-001',
    status: 'available',
    createdAt: new Date(),
  },
  {
    id: '2',
    artistId: 'artist-1',
    name: 'Ceramic Mug Set',
    description: 'Set of 4 hand-thrown ceramic mugs',
    price: 120.0,
    sku: 'MUG-SET-001',
    status: 'available',
    etsyListingId: '1234567890',
    createdAt: new Date(),
  },
  {
    id: '3',
    artistId: 'artist-2',
    name: 'Maple Cutting Board',
    description: 'Handcrafted cutting board from local maple',
    price: 65.0,
    status: 'sold',
    createdAt: new Date(),
    soldAt: new Date(),
  },
];

export default function InventoryPage() {
  // Product list state
  const [productsState, setProductsState] = useState<RequestState<Product[]>>({
    status: 'success',
    data: mockProducts,
  });

  // Form dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete dialog state
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
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

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (editingProduct) {
        // Update existing product
        setProductsState((prev) => {
          if (prev.status !== 'success') return prev;
          return {
            ...prev,
            data: prev.data.map((p) =>
              p.id === editingProduct.id ? { ...p, ...data } : p
            ),
          };
        });
      } else {
        // Create new product
        const newProduct: Product = {
          id: `mock-${Date.now()}`,
          ...data,
          createdAt: new Date(),
        };
        setProductsState((prev) => {
          if (prev.status !== 'success') return prev;
          return {
            ...prev,
            data: [newProduct, ...prev.data],
          };
        });
      }

      setIsSubmitting(false);
      handleCloseForm();
    },
    [editingProduct, handleCloseForm]
  );

  const handleOpenDelete = useCallback((product: Product) => {
    setDeleteProduct(product);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeleteProduct(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteProduct) return;

    setIsDeleting(true);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    setProductsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((p) => p.id !== deleteProduct.id),
      };
    });

    setIsDeleting(false);
    handleCloseDelete();
  }, [deleteProduct, handleCloseDelete]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            Maple & Spruce
          </Typography>
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
          open={!!deleteProduct}
          product={deleteProduct}
          onClose={handleCloseDelete}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      </Container>
    </Box>
  );
}
