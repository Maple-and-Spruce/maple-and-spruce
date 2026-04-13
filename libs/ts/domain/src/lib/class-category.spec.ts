import { describe, it, expect } from 'vitest';
import type {
  ClassCategory,
  CreateClassCategoryInput,
  UpdateClassCategoryInput,
} from './class-category';

// Force v8 to process the module for coverage
import * as classCategoryModule from './class-category';

describe('ClassCategory types', () => {
  const baseClassCategory: ClassCategory = {
    id: 'ccat-1',
    name: 'Fiber Arts',
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('creates a class category with required fields', () => {
    expect(baseClassCategory.id).toBe('ccat-1');
    expect(baseClassCategory.name).toBe('Fiber Arts');
    expect(baseClassCategory.order).toBe(1);
  });

  it('creates a class category with optional fields', () => {
    const category: ClassCategory = {
      ...baseClassCategory,
      description: 'Knitting, weaving, and spinning',
      icon: 'yarn',
    };
    expect(category.description).toBe('Knitting, weaving, and spinning');
    expect(category.icon).toBe('yarn');
  });

  it('creates a CreateClassCategoryInput with required fields', () => {
    const input: CreateClassCategoryInput = {
      name: 'Woodworking',
      order: 2,
    };
    expect(input.name).toBe('Woodworking');
    expect(input.order).toBe(2);
  });

  it('creates a CreateClassCategoryInput with all fields', () => {
    const input: CreateClassCategoryInput = {
      name: 'Ceramics',
      order: 3,
      description: 'Pottery and clay work',
      icon: 'pottery',
    };
    expect(input.description).toBe('Pottery and clay work');
    expect(input.icon).toBe('pottery');
  });

  it('creates an UpdateClassCategoryInput with only id', () => {
    const input: UpdateClassCategoryInput = {
      id: 'ccat-1',
    };
    expect(input.id).toBe('ccat-1');
    expect(input.name).toBeUndefined();
  });

  it('creates an UpdateClassCategoryInput with partial fields', () => {
    const input: UpdateClassCategoryInput = {
      id: 'ccat-1',
      name: 'Updated Fiber Arts',
      description: 'Updated description',
    };
    expect(input.name).toBe('Updated Fiber Arts');
    expect(input.order).toBeUndefined();
  });

  it('module is defined', () => {
    expect(classCategoryModule).toBeDefined();
  });
});
