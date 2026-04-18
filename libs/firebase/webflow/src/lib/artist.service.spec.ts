import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateSlug,
  mapArtistToFieldData,
  ArtistService,
} from './artist.service';
import type { Artist } from '@maple/ts/domain';

describe('generateSlug', () => {
  it('converts name to lowercase', () => {
    expect(generateSlug('John Doe')).toBe('john-doe');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('Jane Smith')).toBe('jane-smith');
  });

  it('removes special characters', () => {
    expect(generateSlug("O'Brien")).toBe('o-brien');
    expect(generateSlug('Smith & Sons')).toBe('smith-sons');
    expect(generateSlug('Name (Test)')).toBe('name-test');
  });

  it('handles multiple consecutive special characters', () => {
    expect(generateSlug('Test...Name')).toBe('test-name');
    expect(generateSlug('A & B & C')).toBe('a-b-c');
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateSlug('  Name  ')).toBe('name');
    expect(generateSlug('-Name-')).toBe('name');
    expect(generateSlug('---Test---')).toBe('test');
  });

  it('handles names with numbers', () => {
    expect(generateSlug('Studio 54')).toBe('studio-54');
    expect(generateSlug('24Seven')).toBe('24seven');
  });

  it('handles single word names', () => {
    expect(generateSlug('Artist')).toBe('artist');
  });

  it('handles empty strings', () => {
    expect(generateSlug('')).toBe('');
  });

  it('handles names with accented characters', () => {
    // Accented characters are removed (not transliterated)
    expect(generateSlug('José García')).toBe('jos-garc-a');
  });

  it('handles complex real-world names', () => {
    expect(generateSlug('Mary Jane Watson-Parker')).toBe(
      'mary-jane-watson-parker'
    );
    expect(generateSlug("Dr. John O'Neill III")).toBe('dr-john-o-neill-iii');
  });
});

describe('mapArtistToFieldData', () => {
  const mockArtist: Artist = {
    id: 'artist-123',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    defaultCommissionRate: 0.4,
    status: 'active',
    notes: 'Internal notes about this artist',
    photoUrl: 'https://storage.example.com/artists/jane.jpg',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-15'),
  };

  const prodOptions = { isDev: false };
  const devOptions = { isDev: true };

  it('maps firebase-id correctly', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['firebase-id']).toBe('artist-123');
  });

  it('maps name correctly', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData.name).toBe('Jane Doe');
  });

  it('generates slug from name', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData.slug).toBe('jane-doe');
  });

  it('sets is-dev-environment to false for prod', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['is-dev-environment']).toBe(false);
  });

  it('sets is-dev-environment to true for dev', () => {
    const fieldData = mapArtistToFieldData(mockArtist, devOptions);
    expect(fieldData['is-dev-environment']).toBe(true);
  });

  it('includes profile-image when photoUrl is present', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['profile-image']).toEqual({
      url: 'https://storage.example.com/artists/jane.jpg',
      alt: 'Jane Doe profile photo',
    });
  });

  it('omits profile-image when photoUrl is undefined', () => {
    const artistWithoutPhoto: Artist = {
      ...mockArtist,
      photoUrl: undefined,
    };
    const fieldData = mapArtistToFieldData(artistWithoutPhoto, prodOptions);
    expect(fieldData['profile-image']).toBeUndefined();
  });

  it('excludes sensitive fields like email and commission rate', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData).not.toHaveProperty('email');
    expect(fieldData).not.toHaveProperty('phone');
    expect(fieldData).not.toHaveProperty('defaultCommissionRate');
    expect(fieldData).not.toHaveProperty('notes');
    expect(fieldData).not.toHaveProperty('status');
    expect(fieldData).not.toHaveProperty('createdAt');
    expect(fieldData).not.toHaveProperty('updatedAt');
  });

  it('includes only the expected synced fields', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    const keys = Object.keys(fieldData);
    expect(keys).toHaveLength(5); // firebase-id, name, slug, is-dev-environment, profile-image
    expect(keys).toContain('firebase-id');
    expect(keys).toContain('name');
    expect(keys).toContain('slug');
    expect(keys).toContain('is-dev-environment');
    expect(keys).toContain('profile-image');
  });

  it('handles artist with special characters in name', () => {
    const artistWithSpecialName: Artist = {
      ...mockArtist,
      id: 'artist-special',
      name: "Mary O'Brien & Co.",
    };
    const fieldData = mapArtistToFieldData(artistWithSpecialName, prodOptions);
    expect(fieldData.name).toBe("Mary O'Brien & Co.");
    expect(fieldData.slug).toBe('mary-o-brien-co');
  });

  it('generates correct alt text for profile image', () => {
    const fieldData = mapArtistToFieldData(mockArtist, prodOptions);
    expect(fieldData['profile-image']?.alt).toBe('Jane Doe profile photo');
  });
});

// ── ArtistService tests ────────────────────────────────────────────────

describe('ArtistService', () => {
  const COLLECTION_ID = 'col-artists-123';

  // Mock Webflow client following the same pattern as class.service.spec.ts
  const mockClient = {
    collections: {
      items: {
        listItems: vi.fn(),
        createItem: vi.fn(),
        updateItem: vi.fn(),
        deleteItem: vi.fn(),
        deleteItemLive: vi.fn(),
        publishItem: vi.fn(),
      },
    },
  };

  let service: ArtistService;

  const mockArtist: Artist = {
    id: 'artist-abc',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-1234',
    photoUrl: 'https://storage.example.com/jane.jpg',
    status: 'active',
    defaultCommissionRate: 0.4,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ArtistService(mockClient as any, COLLECTION_ID);
  });

  describe('syncArtist', () => {
    it('creates a new Webflow item when artist does not exist', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new-item',
      });

      const result = await service.syncArtist({
        artist: mockArtist,
        publish: false,
        isDev: false,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-new-item',
        isNew: true,
      });
      expect(mockClient.collections.items.createItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        expect.objectContaining({
          isArchived: false,
          isDraft: false,
          fieldData: expect.objectContaining({
            'firebase-id': 'artist-abc',
            name: 'Jane Doe',
          }),
        })
      );
    });

    it('updates an existing Webflow item when artist already exists', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            id: 'wf-existing',
            fieldData: { 'firebase-id': 'artist-abc' },
          },
        ],
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncArtist({
        artist: mockArtist,
        publish: false,
        isDev: false,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-existing',
        isNew: false,
      });
      expect(mockClient.collections.items.updateItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-existing',
        expect.objectContaining({
          isArchived: false,
          isDraft: false,
          fieldData: expect.objectContaining({
            'firebase-id': 'artist-abc',
          }),
        })
      );
    });

    it('publishes the item after sync when publish is true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-publish-me',
      });
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.syncArtist({
        artist: mockArtist,
        publish: true,
        isDev: false,
      });

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-publish-me'] }
      );
    });

    it('does not publish when publish is false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-no-publish',
      });

      await service.syncArtist({
        artist: mockArtist,
        publish: false,
        isDev: false,
      });

      expect(mockClient.collections.items.publishItem).not.toHaveBeenCalled();
    });

    it('defaults publish to false and isDev to false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-defaults',
      });

      await service.syncArtist({ artist: mockArtist });

      expect(mockClient.collections.items.publishItem).not.toHaveBeenCalled();
      const createCall = mockClient.collections.items.createItem.mock.calls[0];
      expect(createCall[1].fieldData['is-dev-environment']).toBe(false);
    });
  });

  describe('createItem (via syncArtist)', () => {
    it('throws when Webflow API returns no ID', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({});

      await expect(
        service.syncArtist({ artist: mockArtist })
      ).rejects.toThrow('Webflow API did not return an item ID after creation');
    });
  });

  describe('removeArtist', () => {
    it('deletes existing Webflow item and returns true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            id: 'wf-to-delete',
            fieldData: { 'firebase-id': 'artist-abc' },
          },
        ],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      const result = await service.removeArtist('artist-abc');

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-to-delete'
      );
    });

    it('defaults to staged delete (deleteItem, not deleteItemLive)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          { id: 'wf-staged', fieldData: { 'firebase-id': 'artist-abc' } },
        ],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      await service.removeArtist('artist-abc');

      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledTimes(1);
      expect(
        mockClient.collections.items.deleteItemLive
      ).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true to auto-publish removal', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'artist-abc' } }],
      });
      mockClient.collections.items.deleteItemLive.mockResolvedValue({});

      const result = await service.removeArtist('artist-abc', true);

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItemLive).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-live'
      );
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });

    it('uses deleteItem when publish=false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          { id: 'wf-staged', fieldData: { 'firebase-id': 'artist-abc' } },
        ],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      await service.removeArtist('artist-abc', false);

      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-staged'
      );
      expect(
        mockClient.collections.items.deleteItemLive
      ).not.toHaveBeenCalled();
    });

    it('returns false when artist not found in Webflow', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeArtist('artist-nonexistent');

      expect(result).toBe(false);
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });

    it('does not call any delete when publish=true and item not found', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeArtist('artist-missing', true);

      expect(result).toBe(false);
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
      expect(
        mockClient.collections.items.deleteItemLive
      ).not.toHaveBeenCalled();
    });
  });

  describe('publishItem', () => {
    it('publishes item to Webflow live site', async () => {
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.publishItem('wf-item-789');

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-item-789'] }
      );
    });
  });

  describe('findByFirebaseId (via syncArtist/removeArtist)', () => {
    it('returns null when listItems response has no items array', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({});

      const result = await service.removeArtist('artist-abc');
      expect(result).toBe(false);
    });

    it('returns null when listItems throws an error', async () => {
      mockClient.collections.items.listItems.mockRejectedValue(
        new Error('Network error')
      );

      const result = await service.removeArtist('artist-abc');
      expect(result).toBe(false);
    });

    it('returns null when matching item has no id', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            // no id field
            fieldData: { 'firebase-id': 'artist-abc' },
          },
        ],
      });

      // Should treat it as not found, so syncArtist creates a new item
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new',
      });

      const result = await service.syncArtist({ artist: mockArtist });
      expect(result.isNew).toBe(true);
    });
  });
});
