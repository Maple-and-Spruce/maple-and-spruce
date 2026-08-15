import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapInstructorToFieldData, InstructorService } from './instructor.service';
import type { Instructor } from '@maple/ts/domain';
import type { WebflowClient } from 'webflow-api';

describe('mapInstructorToFieldData', () => {
  const mockInstructor: Instructor = {
    id: 'instructor-123',
    name: 'Sarah Johnson',
    email: 'sarah@example.com',
    phone: '555-9876',
    status: 'active',
    bio: 'Expert weaver with 20 years of experience.',
    specialties: ['weaving', 'natural dyeing', 'spinning'],
    photoUrl: 'https://storage.example.com/instructors/sarah.jpg',
    payRate: 5000,
    payRateType: 'flat',
    notes: 'Teaches on Tuesdays',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-15'),
  };

  const prodOptions = { isDev: false };
  const devOptions = { isDev: true };

  it('maps firebase-id correctly', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData['firebase-id']).toBe('instructor-123');
  });

  it('maps name correctly', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData.name).toBe('Sarah Johnson');
  });

  it('generates slug from name', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData.slug).toBe('sarah-johnson');
  });

  it('sets is-dev-environment to false for prod', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData['is-dev-environment']).toBe(false);
  });

  it('sets is-dev-environment to true for dev', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, devOptions);
    expect(fieldData['is-dev-environment']).toBe(true);
  });

  it('includes profile-image when photoUrl is present', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData['profile-image']).toEqual({
      url: 'https://storage.example.com/instructors/sarah.jpg',
      alt: 'Sarah Johnson profile photo',
    });
  });

  it('omits profile-image when photoUrl is undefined', () => {
    const instructor: Instructor = { ...mockInstructor, photoUrl: undefined };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData['profile-image']).toBeUndefined();
  });

  it('includes bio when present', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData['bio']).toBe('Expert weaver with 20 years of experience.');
  });

  it('omits bio when undefined', () => {
    const instructor: Instructor = { ...mockInstructor, bio: undefined };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData['bio']).toBeUndefined();
  });

  it('includes specialties as comma-separated string', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData['specialties']).toBe('weaving, natural dyeing, spinning');
  });

  it('omits specialties when undefined', () => {
    const instructor: Instructor = { ...mockInstructor, specialties: undefined };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData['specialties']).toBeUndefined();
  });

  it('omits specialties when empty array', () => {
    const instructor: Instructor = { ...mockInstructor, specialties: [] };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData['specialties']).toBeUndefined();
  });

  it('excludes sensitive fields', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    expect(fieldData).not.toHaveProperty('email');
    expect(fieldData).not.toHaveProperty('phone');
    expect(fieldData).not.toHaveProperty('payRate');
    expect(fieldData).not.toHaveProperty('payRateType');
    expect(fieldData).not.toHaveProperty('notes');
    expect(fieldData).not.toHaveProperty('status');
    expect(fieldData).not.toHaveProperty('createdAt');
    expect(fieldData).not.toHaveProperty('updatedAt');
  });

  it('includes only expected synced fields with all data present', () => {
    const fieldData = mapInstructorToFieldData(mockInstructor, prodOptions);
    const keys = Object.keys(fieldData);
    expect(keys).toHaveLength(7);
    expect(keys).toContain('firebase-id');
    expect(keys).toContain('name');
    expect(keys).toContain('slug');
    expect(keys).toContain('is-dev-environment');
    expect(keys).toContain('profile-image');
    expect(keys).toContain('bio');
    expect(keys).toContain('specialties');
  });

  it('includes only base fields when optional data is absent', () => {
    const minimalInstructor: Instructor = {
      ...mockInstructor,
      photoUrl: undefined,
      bio: undefined,
      specialties: undefined,
    };
    const fieldData = mapInstructorToFieldData(minimalInstructor, prodOptions);
    const keys = Object.keys(fieldData);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('firebase-id');
    expect(keys).toContain('name');
    expect(keys).toContain('slug');
    expect(keys).toContain('is-dev-environment');
  });

  it('handles instructor with special characters in name', () => {
    const instructor: Instructor = {
      ...mockInstructor,
      name: "Mary O'Brien & Co.",
    };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData.name).toBe("Mary O'Brien & Co.");
    expect(fieldData.slug).toBe('mary-o-brien-co');
  });

  it('handles single specialty', () => {
    const instructor: Instructor = {
      ...mockInstructor,
      specialties: ['pottery'],
    };
    const fieldData = mapInstructorToFieldData(instructor, prodOptions);
    expect(fieldData['specialties']).toBe('pottery');
  });
});

// ============================================================================
// InstructorService class tests (with mocked WebflowClient)
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

const testInstructor: Instructor = {
  id: 'inst-001',
  name: 'Test Instructor',
  email: 'test@example.com',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('InstructorService', () => {
  let mockClient: WebflowClient;
  let service: InstructorService;
  const collectionId = 'col-123';

  // Helper to access mocked methods
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
    service = new InstructorService(mockClient, collectionId);
  });

  describe('syncInstructor', () => {
    it('creates a new item when instructor does not exist in Webflow', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-new-1' });

      const result = await service.syncInstructor({
        instructor: testInstructor,
        isDev: false,
      });

      expect(result).toEqual({ success: true, webflowItemId: 'wf-new-1', isNew: true });
      expect(items().createItem).toHaveBeenCalledWith(collectionId, expect.objectContaining({
        isArchived: false,
        isDraft: false,
      }));
    });

    it('creates a DEV item as a draft so a full-site publish never makes it live', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-dev-1' });

      await service.syncInstructor({ instructor: testInstructor, isDev: true });

      expect(items().createItem).toHaveBeenCalledWith(
        collectionId,
        expect.objectContaining({ isDraft: true })
      );
      expect(items().publishItem).not.toHaveBeenCalled();
    });

    it('keeps an existing DEV item as a draft on update', async () => {
      items().listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'inst-001' } }],
      });
      items().updateItem.mockResolvedValue({});

      await service.syncInstructor({ instructor: testInstructor, isDev: true });

      expect(items().updateItem).toHaveBeenCalledWith(
        collectionId,
        'wf-existing',
        expect.objectContaining({ isDraft: true })
      );
    });

    it('updates an existing item when instructor exists in Webflow', async () => {
      items().listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'inst-001' } }],
      });
      items().updateItem.mockResolvedValue({});

      const result = await service.syncInstructor({
        instructor: testInstructor,
        isDev: false,
      });

      expect(result).toEqual({ success: true, webflowItemId: 'wf-existing', isNew: false });
      expect(items().updateItem).toHaveBeenCalledWith(
        collectionId,
        'wf-existing',
        expect.objectContaining({ isArchived: false, isDraft: false })
      );

      // Slug must not be sent on update — Webflow rejects with 400 when
      // a slug collides (it auto-suffixes on create but not on update).
      const sentFieldData = items().updateItem.mock.calls[0][2].fieldData;
      expect(sentFieldData).not.toHaveProperty('slug');
    });

    it('publishes item when publish is true', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-pub' });
      items().publishItem.mockResolvedValue({});

      await service.syncInstructor({
        instructor: testInstructor,
        publish: true,
        isDev: false,
      });

      expect(items().publishItem).toHaveBeenCalledWith(collectionId, {
        itemIds: ['wf-pub'],
      });
    });

    it('does not publish when publish is false', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-nopub' });

      await service.syncInstructor({
        instructor: testInstructor,
        publish: false,
        isDev: false,
      });

      expect(items().publishItem).not.toHaveBeenCalled();
    });

    it('throws when createItem returns no id', async () => {
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({});

      await expect(
        service.syncInstructor({ instructor: testInstructor, isDev: false })
      ).rejects.toThrow('Webflow API did not return an item ID after creation');
    });

    it('uses existingWebflowItemId fast path and skips listItems scan', async () => {
      items().getItem.mockResolvedValue({
        id: 'wf-known',
        fieldData: { 'firebase-id': 'inst-001' },
      });
      items().updateItem.mockResolvedValue({});

      const result = await service.syncInstructor({
        instructor: testInstructor,
        existingWebflowItemId: 'wf-known',
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-known',
        isNew: false,
      });
      expect(items().getItem).toHaveBeenCalledWith(collectionId, 'wf-known');
      expect(items().listItems).not.toHaveBeenCalled();
    });

    it('falls back to listItems scan when known Webflow item is gone', async () => {
      items().getItem.mockRejectedValue(new Error('Not found'));
      items().listItems.mockResolvedValue({ items: [] });
      items().createItem.mockResolvedValue({ id: 'wf-recreated' });

      const result = await service.syncInstructor({
        instructor: testInstructor,
        existingWebflowItemId: 'wf-deleted',
      });

      expect(result.isNew).toBe(true);
      expect(result.webflowItemId).toBe('wf-recreated');
      expect(items().listItems).toHaveBeenCalled();
    });

    it('paginates findByFirebaseId past the first 100 items', async () => {
      const fillerItems = Array.from({ length: 100 }, (_, i) => ({
        id: `wf-other-${i}`,
        fieldData: { 'firebase-id': `other-inst-${i}` },
      }));
      items()
        .listItems.mockResolvedValueOnce({ items: fillerItems })
        .mockResolvedValueOnce({
          items: [
            {
              id: 'wf-needle',
              fieldData: { 'firebase-id': 'inst-001' },
            },
          ],
        });
      items().updateItem.mockResolvedValue({});

      const result = await service.syncInstructor({
        instructor: testInstructor,
      });

      expect(result.isNew).toBe(false);
      expect(result.webflowItemId).toBe('wf-needle');
      expect(items().listItems).toHaveBeenCalledTimes(2);
      expect(items().listItems).toHaveBeenNthCalledWith(2, collectionId, {
        limit: 100,
        offset: 100,
      });
    });
  });

  describe('removeInstructor', () => {
    it('deletes item when found in Webflow', async () => {
      items().listItems.mockResolvedValue({
        items: [{ id: 'wf-del', fieldData: { 'firebase-id': 'inst-001' } }],
      });
      items().deleteItem.mockResolvedValue({});

      const result = await service.removeInstructor('inst-001');

      expect(result).toBe(true);
      expect(items().deleteItem).toHaveBeenCalledWith(collectionId, 'wf-del');
    });

    it('defaults to staged delete (deleteItem, not deleteItemLive)', async () => {
      items().listItems.mockResolvedValue({
        items: [
          { id: 'wf-staged', fieldData: { 'firebase-id': 'inst-001' } },
        ],
      });
      items().deleteItem.mockResolvedValue({});

      await service.removeInstructor('inst-001');

      expect(items().deleteItem).toHaveBeenCalledTimes(1);
      expect(items().deleteItemLive).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true to auto-publish removal', async () => {
      items().listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'inst-001' } }],
      });
      items().deleteItemLive.mockResolvedValue({});

      const result = await service.removeInstructor('inst-001', true);

      expect(result).toBe(true);
      expect(items().deleteItemLive).toHaveBeenCalledWith(
        collectionId,
        'wf-live'
      );
      expect(items().deleteItem).not.toHaveBeenCalled();
    });

    it('uses deleteItem when publish=false', async () => {
      items().listItems.mockResolvedValue({
        items: [
          { id: 'wf-staged', fieldData: { 'firebase-id': 'inst-001' } },
        ],
      });
      items().deleteItem.mockResolvedValue({});

      await service.removeInstructor('inst-001', false);

      expect(items().deleteItem).toHaveBeenCalledWith(
        collectionId,
        'wf-staged'
      );
      expect(items().deleteItemLive).not.toHaveBeenCalled();
    });

    it('returns false when instructor not found in Webflow', async () => {
      items().listItems.mockResolvedValue({ items: [] });

      const result = await service.removeInstructor('nonexistent');

      expect(result).toBe(false);
      expect(items().deleteItem).not.toHaveBeenCalled();
    });

    it('does not call any delete when publish=true and item not found', async () => {
      items().listItems.mockResolvedValue({ items: [] });

      const result = await service.removeInstructor('nonexistent', true);

      expect(result).toBe(false);
      expect(items().deleteItem).not.toHaveBeenCalled();
      expect(items().deleteItemLive).not.toHaveBeenCalled();
    });
  });

  describe('findByFirebaseId (via syncInstructor)', () => {
    it('handles listItems returning undefined items', async () => {
      items().listItems.mockResolvedValue({});
      items().createItem.mockResolvedValue({ id: 'wf-fallback' });

      const result = await service.syncInstructor({
        instructor: testInstructor,
        isDev: false,
      });

      expect(result.isNew).toBe(true);
    });

    it('handles listItems throwing an error', async () => {
      items().listItems.mockRejectedValue(new Error('API error'));
      items().createItem.mockResolvedValue({ id: 'wf-retry' });

      const result = await service.syncInstructor({
        instructor: testInstructor,
        isDev: false,
      });

      // findByFirebaseId catches errors and returns null, so it creates new
      expect(result.isNew).toBe(true);
    });

    it('skips items without an id', async () => {
      items().listItems.mockResolvedValue({
        items: [{ fieldData: { 'firebase-id': 'inst-001' } }], // no id
      });
      items().createItem.mockResolvedValue({ id: 'wf-noid' });

      const result = await service.syncInstructor({
        instructor: testInstructor,
        isDev: false,
      });

      expect(result.isNew).toBe(true);
    });
  });

  describe('publishItem', () => {
    it('calls publishItem on the Webflow API', async () => {
      items().publishItem.mockResolvedValue({});

      await service.publishItem('wf-item-1');

      expect(items().publishItem).toHaveBeenCalledWith(collectionId, {
        itemIds: ['wf-item-1'],
      });
    });
  });
});
