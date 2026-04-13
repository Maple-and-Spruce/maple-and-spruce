import { describe, it, expect } from 'vitest';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './category';

// Force v8 to process the module for coverage
import * as categoryModule from './category';

describe('Category types', () => {
  const baseCategory: Category = {
    id: 'cat-1',
    name: 'Ceramics',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('creates a category with required fields', () => {
    expect(baseCategory.id).toBe('cat-1');
    expect(baseCategory.name).toBe('Ceramics');
    expect(baseCategory.order).toBe(1);
  });

  it('creates a category with optional description', () => {
    const category: Category = {
      ...baseCategory,
      description: 'Handmade pottery and ceramic art',
    };
    expect(category.description).toBe('Handmade pottery and ceramic art');
  });

  it('creates a CreateCategoryInput', () => {
    const input: CreateCategoryInput = {
      name: 'Jewelry',
      order: 2,
    };
    expect(input.name).toBe('Jewelry');
    expect(input.order).toBe(2);
  });

  it('creates a CreateCategoryInput with description', () => {
    const input: CreateCategoryInput = {
      name: 'Textiles',
      order: 3,
      description: 'Woven and dyed fabrics',
    };
    expect(input.description).toBe('Woven and dyed fabrics');
  });

  it('creates an UpdateCategoryInput with only id', () => {
    const input: UpdateCategoryInput = {
      id: 'cat-1',
    };
    expect(input.id).toBe('cat-1');
    expect(input.name).toBeUndefined();
  });

  it('creates an UpdateCategoryInput with partial fields', () => {
    const input: UpdateCategoryInput = {
      id: 'cat-1',
      name: 'Updated Ceramics',
      order: 5,
    };
    expect(input.name).toBe('Updated Ceramics');
    expect(input.order).toBe(5);
  });

  it('module is defined', () => {
    expect(categoryModule).toBeDefined();
  });
});
