# @maple/react/data

Data access hooks for Maple & Spruce.

## Hooks

- `useProducts` - Product CRUD operations with RequestState
- `useArtists` - Artist CRUD operations with RequestState
- `useCategories` - Category CRUD operations with RequestState (includes reordering)

## Usage

```tsx
import { useProducts, useArtists, useCategories } from '@maple/react/data';

function ProductList() {
  const { productsState, createProduct, updateProduct, deleteProduct } = useProducts();

  if (productsState.status === 'loading') {
    return <Spinner />;
  }

  if (productsState.status === 'error') {
    return <Error message={productsState.error} />;
  }

  return <List items={productsState.data} />;
}
```
