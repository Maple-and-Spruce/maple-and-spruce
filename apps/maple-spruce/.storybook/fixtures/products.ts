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
  variants: [
    {
      id: 'var-001',
      label: 'Regular',
      sku: 'prd_abc12345',
      priceCents: 4500,
      quantity: 3,
      squareVariationId: 'sq-var-001',
    },
  ],
  squareCache: {
    name: 'Hand-thrown Ceramic Vase',
    description:
      'A beautiful hand-thrown ceramic vase with a sage green glaze. Perfect for displaying fresh flowers.',
    priceCents: 4500,
    quantity: 3,
    sku: 'prd_abc12345',
    imageUrl: 'https://picsum.photos/seed/product1/400/400',
    syncedAt: new Date('2024-06-20T14:30:00Z'),
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
  variants: [
    {
      id: 'var-002',
      label: 'Regular',
      sku: 'prd_def67890',
      priceCents: 8500,
      quantity: 5,
      squareVariationId: 'sq-var-002',
    },
  ],
  squareCache: {
    name: 'Maple Cutting Board',
    description: 'Handcrafted maple cutting board with live edge detail.',
    priceCents: 8500,
    quantity: 5,
    sku: 'prd_def67890',
    syncedAt: new Date('2024-05-15T16:45:00Z'),
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
  variants: [
    {
      id: 'var-003',
      label: 'Regular',
      sku: 'prd_ghi11223',
      priceCents: 6000,
      quantity: 2,
      squareVariationId: 'sq-var-003',
    },
  ],
  squareCache: {
    name: 'Stoneware Mug Set (4)',
    description: 'Set of 4 handmade stoneware mugs.',
    priceCents: 6000,
    quantity: 2,
    sku: 'prd_ghi11223',
    imageUrl: 'https://picsum.photos/seed/product3/400/400',
    syncedAt: new Date('2024-08-01T11:00:00Z'),
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
  variants: [
    {
      id: 'var-004',
      label: 'Regular',
      sku: 'prd_jkl44556',
      priceCents: 12000,
      quantity: 0,
      squareVariationId: 'sq-var-004',
    },
  ],
  squareCache: {
    name: 'Woven Wall Hanging',
    description: 'Macrame wall hanging with natural cotton cord.',
    priceCents: 12000,
    quantity: 0,
    sku: 'prd_jkl44556',
    imageUrl: 'https://picsum.photos/seed/product4/400/400',
    syncedAt: new Date('2024-09-01T08:00:00Z'),
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
  variants: [
    {
      id: 'var-005',
      label: 'Regular',
      sku: 'prd_mno77889',
      priceCents: 7500,
      quantity: 0,
      squareVariationId: 'sq-var-005',
    },
  ],
  squareCache: {
    name: 'Silver Pendant Necklace',
    description: 'Hand-forged sterling silver pendant on a 18" chain.',
    priceCents: 7500,
    quantity: 0,
    sku: 'prd_mno77889',
    imageUrl: 'https://picsum.photos/seed/product5/400/400',
    syncedAt: new Date('2024-07-10T14:00:00Z'),
  },
};

export const mockProductMultiVariant: Product = {
  id: 'prod-006',
  artistId: 'artist-001',
  categoryId: 'cat-002',
  status: 'active',
  squareItemId: 'sq-item-006',
  squareCatalogVersion: 1,
  squareLocationId: 'sq-loc-001',
  createdAt: new Date('2024-09-10T12:00:00Z'),
  updatedAt: new Date('2024-10-01T09:00:00Z'),
  variantProperties: ['Size'],
  variants: [
    {
      id: 'var-006a',
      label: 'Small',
      sku: 'prd_size_sm',
      priceCents: 3000,
      quantity: 4,
      squareVariationId: 'sq-var-006a',
    },
    {
      id: 'var-006b',
      label: 'Medium',
      sku: 'prd_size_md',
      priceCents: 3500,
      quantity: 7,
      squareVariationId: 'sq-var-006b',
    },
    {
      id: 'var-006c',
      label: 'Large',
      sku: 'prd_size_lg',
      priceCents: 4000,
      quantity: 2,
      squareVariationId: 'sq-var-006c',
    },
  ],
  squareCache: {
    name: 'Hand-knit Wool Hat',
    description: 'Soft merino wool hat, available in three sizes.',
    priceCents: 3000,
    quantity: 13,
    sku: 'prd_size_sm',
    imageUrl: 'https://picsum.photos/seed/product6/400/400',
    syncedAt: new Date('2024-10-01T09:00:00Z'),
  },
};

export const mockProducts: Product[] = [
  mockProduct,
  mockProductNoImage,
  mockProductDraft,
  mockProductDiscontinued,
  mockProductOutOfStock,
  mockProductMultiVariant,
];

export const mockActiveProducts: Product[] = mockProducts.filter(
  (p) => p.status === 'active'
);
