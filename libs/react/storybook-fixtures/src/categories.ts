import type { Category } from '@maple/ts/domain';

/**
 * Mock category data for Storybook stories
 */

export const mockCategoryPottery: Category = {
  id: 'cat-001',
  name: 'Pottery',
  description: 'Handmade ceramic pottery and vessels',
  order: 1,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockCategoryTextiles: Category = {
  id: 'cat-002',
  name: 'Textiles',
  description: 'Woven goods, quilts, and fabric art',
  order: 2,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockCategoryWoodwork: Category = {
  id: 'cat-003',
  name: 'Woodwork',
  description: 'Hand-carved and turned wooden items',
  order: 3,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockCategoryJewelry: Category = {
  id: 'cat-004',
  name: 'Jewelry',
  description: 'Handcrafted jewelry and accessories',
  order: 4,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockCategoryFineArt: Category = {
  id: 'cat-005',
  name: 'Fine Art',
  description: 'Paintings, prints, and original artwork',
  order: 5,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T10:00:00Z'),
};

export const mockCategories: Category[] = [
  mockCategoryPottery,
  mockCategoryTextiles,
  mockCategoryWoodwork,
  mockCategoryJewelry,
  mockCategoryFineArt,
];
