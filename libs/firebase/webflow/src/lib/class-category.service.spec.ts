import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapClassCategoryToFieldData,
  ClassCategoryService,
} from './class-category.service';
import type { ClassCategory } from '@maple/ts/domain';
import type { WebflowClient } from 'webflow-api';

const mockCategory: ClassCategory = {
  id: 'cat-123',
  name: 'Natural Dyeing',
  description: 'Plant-based color for fiber and cloth.',
  order: 20,
  icon: '🌿',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-15'),
};

const prodOptions = { isDev: false };
const devOptions = { isDev: true };

describe('mapClassCategoryToFieldData', () => {
  it('maps firebase-id, name and slug', () => {
    const fieldData = mapClassCategoryToFieldData(mockCategory, prodOptions);
    expect(fieldData['firebase-id']).toBe('cat-123');
    expect(fieldData.name).toBe('Natural Dyeing');
    expect(fieldData.slug).toBe('natural-dyeing');
  });

  it('sets is-dev-environment from the isDev option', () => {
    expect(
      mapClassCategoryToFieldData(mockCategory, prodOptions)[
        'is-dev-environment'
      ]
    ).toBe(false);
    expect(
      mapClassCategoryToFieldData(mockCategory, devOptions)['is-dev-environment']
    ).toBe(true);
  });

  it('maps description, order and icon when present', () => {
    const fieldData = mapClassCategoryToFieldData(mockCategory, prodOptions);
    expect(fieldData['description']).toBe(
      'Plant-based color for fiber and cloth.'
    );
    expect(fieldData['order']).toBe(20);
    expect(fieldData['icon']).toBe('🌿');
  });

  it('sends order 0 rather than dropping it', () => {
    // 0 is a real ordering value (first category), not "unset" — a truthiness
    // check here would silently reorder the whole list in Webflow.
    const fieldData = mapClassCategoryToFieldData(
      { ...mockCategory, order: 0 },
      prodOptions
    );
    expect(fieldData['order']).toBe(0);
  });

  it('omits description and icon when absent', () => {
    const fieldData = mapClassCategoryToFieldData(
      { ...mockCategory, description: undefined, icon: undefined },
      prodOptions
    );
    expect(fieldData['description']).toBeUndefined();
    expect(fieldData['icon']).toBeUndefined();
  });

  it('does not sync the internal gallery image pool', () => {
    // galleryImages is an admin-side shared pool for building class galleries,
    // not public page content.
    const fieldData = mapClassCategoryToFieldData(
      {
        ...mockCategory,
        galleryImages: [{ url: 'https://example.com/a.jpg', alt: 'a' }],
      },
      prodOptions
    );
    expect(fieldData).not.toHaveProperty('galleryImages');
    expect(fieldData).not.toHaveProperty('gallery-images');
  });

  it('excludes bookkeeping fields', () => {
    const fieldData = mapClassCategoryToFieldData(mockCategory, prodOptions);
    expect(fieldData).not.toHaveProperty('createdAt');
    expect(fieldData).not.toHaveProperty('updatedAt');
    expect(fieldData).not.toHaveProperty('webflowItemId');
  });

  it('slugifies names with special characters', () => {
    const fieldData = mapClassCategoryToFieldData(
      { ...mockCategory, name: 'Fiber Arts & Weaving!' },
      prodOptions
    );
    expect(fieldData.slug).toBe('fiber-arts-weaving');
  });
});

// ============================================================================
// ClassCategoryService (with a mocked WebflowClient)
// ============================================================================

function createMockClient() {
  return {
    collections: {
      items: {
        listItems: vi.fn(),
        getItem: vi.fn(),
        createItem: vi.fn(),
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        deleteItemLive: vi.fn(),
        publishItem: vi.fn(),
      },
    },
  } as unknown as WebflowClient;
}

describe('ClassCategoryService', () => {
  let mockClient: WebflowClient;
  let service: ClassCategoryService;
  const collectionId = 'col-cats';

  const items = () =>
    mockClient.collections.items as unknown as {
      listItems: ReturnType<typeof vi.fn>;
      getItem: ReturnType<typeof vi.fn>;
      createItem: ReturnType<typeof vi.fn>;
      updateItem: ReturnType<typeof vi.fn>;
      deleteItem: ReturnType<typeof vi.fn>;
      deleteItemLive: ReturnType<typeof vi.fn>;
      publishItem: ReturnType<typeof vi.fn>;
    };

  beforeEach(() => {
    mockClient = createMockClient();
    service = new ClassCategoryService(mockClient, collectionId);
  });

  describe('syncClassCategory', () => {
    it('creates a new item when the category is unknown to Webflow', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-new' });

      const result = await service.syncClassCategory({
        category: mockCategory,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-new',
        isNew: true,
      });
      expect(items().createItem).toHaveBeenCalledWith(
        collectionId,
        expect.objectContaining({
          isArchived: false,
          isDraft: false,
          fieldData: expect.objectContaining({ 'firebase-id': 'cat-123' }),
        })
      );
    });

    it('updates directly when a known item ID is supplied', async () => {
      items().getItem.mockResolvedValue({ id: 'wf-known' });
      items().updateItem.mockResolvedValue({});

      const result = await service.syncClassCategory({
        category: mockCategory,
        existingWebflowItemId: 'wf-known',
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-known',
        isNew: false,
      });
      // The known-ID path must not pay for a full collection scan.
      expect(items().listItems).not.toHaveBeenCalled();
    });

    it('falls back to a scan when the known item is gone from Webflow', async () => {
      items().getItem.mockRejectedValue(new Error('404 not found'));
      items().listItems.mockResolvedValue({
        items: [{ id: 'wf-found', fieldData: { 'firebase-id': 'cat-123' } }],
      });
      items().updateItem.mockResolvedValue({});

      const result = await service.syncClassCategory({
        category: mockCategory,
        existingWebflowItemId: 'wf-stale',
      });

      expect(result.webflowItemId).toBe('wf-found');
      expect(result.isNew).toBe(false);
    });

    it('omits slug on update so a collision suffix cannot freeze later syncs', async () => {
      items().getItem.mockResolvedValue({ id: 'wf-known' });
      items().updateItem.mockResolvedValue({});

      await service.syncClassCategory({
        category: mockCategory,
        existingWebflowItemId: 'wf-known',
      });

      const [, , payload] = items().updateItem.mock.calls[0];
      expect(payload.fieldData).not.toHaveProperty('slug');
      expect(payload.fieldData['name']).toBe('Natural Dyeing');
    });

    it('creates dev items as drafts so a site publish cannot leak them', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-dev' });

      await service.syncClassCategory({ category: mockCategory, isDev: true });

      expect(items().createItem).toHaveBeenCalledWith(
        collectionId,
        expect.objectContaining({ isDraft: true })
      );
    });

    it('publishes only when asked', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-new' });

      await service.syncClassCategory({ category: mockCategory });
      expect(items().publishItem).not.toHaveBeenCalled();

      await service.syncClassCategory({
        category: mockCategory,
        publish: true,
      });
      expect(items().publishItem).toHaveBeenCalledWith(collectionId, {
        itemIds: ['wf-new'],
      });
    });

    it('throws when Webflow creates an item without returning an ID', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({});

      await expect(
        service.syncClassCategory({ category: mockCategory })
      ).rejects.toThrow('Webflow API did not return an item ID after creation');
    });
  });

  describe('removeClassCategory', () => {
    it('returns false when no matching item exists', async () => {
      items().listItems.mockResolvedValue({ items: [] });

      expect(await service.removeClassCategory('cat-123')).toBe(false);
      expect(items().deleteItem).not.toHaveBeenCalled();
    });

    it('deletes the draft item when publish is false', async () => {
      items().getItem.mockResolvedValue({ id: 'wf-known' });

      expect(await service.removeClassCategory('cat-123', false, 'wf-known')).toBe(
        true
      );
      expect(items().deleteItem).toHaveBeenCalledWith(collectionId, 'wf-known');
      expect(items().deleteItemLive).not.toHaveBeenCalled();
    });

    it('deletes live when publish is true so the site updates without a republish', async () => {
      items().getItem.mockResolvedValue({ id: 'wf-known' });

      expect(await service.removeClassCategory('cat-123', true, 'wf-known')).toBe(
        true
      );
      expect(items().deleteItemLive).toHaveBeenCalledWith(
        collectionId,
        'wf-known'
      );
      expect(items().deleteItem).not.toHaveBeenCalled();
    });
  });
});
