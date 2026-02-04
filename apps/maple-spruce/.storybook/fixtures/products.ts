import type { Product } from '@maple/ts/domain';

/**
 * Mock product data for Storybook stories
 */

export const mockProduct: Product = {
  id: 'prod-001',
  artistId: 'artist-001',
  categoryId: 'cat-001',
  status: 'active',
  squareItemId: 'sq-item-001',
  squareVariationId: 'sq-var-001',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2024-03-15T10:00:00Z'),
  updatedAt: new Date('2024-06-20T14:30:00Z'),
  squareCache: {
    name: 'Hand-thrown Ceramic Vase',
    description:
      'A beautiful hand-thrown ceramic vase with a sage green glaze. Perfect for displaying fresh flowers.',
    priceCents: 4500,
    quantity: 3,
    sku: 'prd_abc12345',
    imageUrl: 'https://picsum.photos/seed/product1/400/400',
    syncedAt: new Date('2026-01-15T10:00:00Z'),
  },
};

export const mockProductNoImage: Product = {
  id: 'prod-002',
  artistId: 'artist-002',
  categoryId: 'cat-003',
  status: 'active',
  squareItemId: 'sq-item-002',
  squareVariationId: 'sq-var-002',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2024-04-10T09:00:00Z'),
  updatedAt: new Date('2024-05-15T16:45:00Z'),
  squareCache: {
    name: 'Maple Cutting Board',
    description: 'Handcrafted maple cutting board with live edge detail.',
    priceCents: 8500,
    quantity: 5,
    sku: 'prd_def67890',
    syncedAt: new Date('2026-01-15T10:00:00Z'),
  },
};

export const mockProductDraft: Product = {
  id: 'prod-003',
  artistId: 'artist-001',
  categoryId: 'cat-001',
  status: 'draft',
  squareItemId: 'sq-item-003',
  squareVariationId: 'sq-var-003',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2024-08-01T11:00:00Z'),
  updatedAt: new Date('2024-08-01T11:00:00Z'),
  squareCache: {
    name: 'Stoneware Mug Set (4)',
    description: 'Set of 4 handmade stoneware mugs.',
    priceCents: 6000,
    quantity: 2,
    sku: 'prd_ghi11223',
    imageUrl: 'https://picsum.photos/seed/product3/400/400',
    syncedAt: new Date('2026-01-15T10:00:00Z'),
  },
};

export const mockProductDiscontinued: Product = {
  id: 'prod-004',
  artistId: 'artist-003',
  categoryId: 'cat-002',
  status: 'discontinued',
  squareItemId: 'sq-item-004',
  squareVariationId: 'sq-var-004',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2023-06-15T12:00:00Z'),
  updatedAt: new Date('2024-09-01T08:00:00Z'),
  squareCache: {
    name: 'Woven Wall Hanging',
    description: 'Macrame wall hanging with natural cotton cord.',
    priceCents: 12000,
    quantity: 0,
    sku: 'prd_jkl44556',
    imageUrl: 'https://picsum.photos/seed/product4/400/400',
    syncedAt: new Date('2026-01-15T10:00:00Z'),
  },
};

export const mockProductOutOfStock: Product = {
  id: 'prod-005',
  artistId: 'artist-002',
  categoryId: 'cat-004',
  status: 'active',
  customCommissionRate: 0.35,
  squareItemId: 'sq-item-005',
  squareVariationId: 'sq-var-005',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2024-05-20T10:00:00Z'),
  updatedAt: new Date('2024-07-10T14:00:00Z'),
  squareCache: {
    name: 'Silver Pendant Necklace',
    description: 'Hand-forged sterling silver pendant on a 18" chain.',
    priceCents: 7500,
    quantity: 0,
    sku: 'prd_mno77889',
    imageUrl: 'https://picsum.photos/seed/product5/400/400',
    syncedAt: new Date('2026-01-15T10:00:00Z'),
  },
};

export const mockProducts: Product[] = [
  mockProduct,
  mockProductNoImage,
  mockProductDraft,
  mockProductDiscontinued,
  mockProductOutOfStock,
];

export const mockActiveProducts: Product[] = mockProducts.filter(
  (p) => p.status === 'active'
);
