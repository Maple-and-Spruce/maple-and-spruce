import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateClassSlug,
  mapClassToFieldData,
  ClassService,
} from './class.service';
import type { ClassSession, PublishableClass } from '@maple/ts/domain';
import { formatSessions } from '@maple/ts/domain';

// CI's nx-esbuild typecheck pulls these spec files into the apps/functions-*
// programs, where contextual typing for the literal `[{ dateTime: ... }]`
// doesn't always widen the array to the non-empty `[T, ...T[]]` tuple
// PublishableClass requires. Declaring the literal with an explicit tuple
// type sidesteps the inconsistency.
const oneSession: [ClassSession, ...ClassSession[]] = [
  { dateTime: new Date('2026-05-15T14:00:00.000Z') },
];

describe('generateClassSlug', () => {
  it('converts name to lowercase with hyphens', () => {
    expect(generateClassSlug('Pottery 101')).toBe('pottery-101');
  });

  it('removes special characters', () => {
    expect(generateClassSlug("Beginner's Knitting")).toBe('beginner-s-knitting');
    expect(generateClassSlug('Weaving & Dyeing')).toBe('weaving-dyeing');
  });

  it('handles multiple spaces and hyphens', () => {
    expect(generateClassSlug('Intro to  Woodworking')).toBe(
      'intro-to-woodworking'
    );
    expect(generateClassSlug('---Test Class---')).toBe('test-class');
  });

  it('handles empty strings', () => {
    expect(generateClassSlug('')).toBe('');
  });
});

describe('mapClassToFieldData', () => {
  const mockClass: PublishableClass = {
    id: 'class-abc',
    name: 'Pottery 101',
    description: 'Learn the basics of pottery',
    shortDescription: 'Intro to pottery',
    instructorId: 'inst-1',
    sessions: oneSession,
    durationMinutes: 120,
    capacity: 10,
    priceCents: 4500,
    imageUrl: 'https://storage.example.com/pottery.jpg',
    categoryId: 'cat-1',
    skillLevel: 'beginner',
    status: 'published',
    location: 'Main Studio',
    materialsIncluded: 'Clay, glazes, tools',
    whatToBring: 'Apron, towel',
    minimumAge: 12,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  it('maps required fields', () => {
    const result = mapClassToFieldData(mockClass, { isDev: false });

    expect(result['firebase-id']).toBe('class-abc');
    expect(result.name).toBe('Pottery 101');
    expect(result.slug).toBe('pottery-101');
    expect(result['is-dev-environment']).toBe(false);
    expect(result['date-time']).toBe('2026-05-15T14:00:00.000Z');
    expect(result['duration-minutes']).toBe(120);
    expect(result['price-cents']).toBe(4500);
    expect(result.capacity).toBe(10);
  });

  it('formats date and time display in Eastern time', () => {
    // mockClass session is 2026-05-15T14:00:00.000Z = 10:00 AM Eastern (EDT)
    const result = mapClassToFieldData(mockClass, { isDev: false });
    const expected = formatSessions(
      [{ dateTime: new Date('2026-05-15T14:00:00.000Z') }],
      'America/New_York'
    );
    expect(result['date-display']).toBe(expected.dateDisplay);
    expect(result['time-display']).toBe(expected.timeDisplay);
  });

  it('formats price display correctly', () => {
    expect(mapClassToFieldData(mockClass, { isDev: false })['price-display']).toBe('$45');

    const freeClass = { ...mockClass, priceCents: 0 };
    expect(mapClassToFieldData(freeClass, { isDev: false })['price-display']).toBe('Free');

    const decimalClass = { ...mockClass, priceCents: 4550 };
    expect(mapClassToFieldData(decimalClass, { isDev: false })['price-display']).toBe('$45.50');
  });

  it('formats duration display correctly', () => {
    expect(mapClassToFieldData(mockClass, { isDev: false })['duration-display']).toBe('2 hours');

    const oneHour = { ...mockClass, durationMinutes: 60 };
    expect(mapClassToFieldData(oneHour, { isDev: false })['duration-display']).toBe('1 hour');

    const ninety = { ...mockClass, durationMinutes: 90 };
    expect(mapClassToFieldData(ninety, { isDev: false })['duration-display']).toBe('1.5 hours');

    const short = { ...mockClass, durationMinutes: 45 };
    expect(mapClassToFieldData(short, { isDev: false })['duration-display']).toBe('45 min');
  });

  it('appends "each" to duration when class has multiple sessions', () => {
    const multiSessionDates = [
      { dateTime: new Date('2026-05-31T17:00:00.000Z') },
      { dateTime: new Date('2026-06-07T17:00:00.000Z') },
      { dateTime: new Date('2026-06-14T17:00:00.000Z') },
    ] satisfies [ClassSession, ...ClassSession[]];
    const multiSession: PublishableClass = {
      ...mockClass,
      durationMinutes: 90,
      sessions: multiSessionDates,
    };
    expect(mapClassToFieldData(multiSession, { isDev: false })['duration-display']).toBe(
      '1.5 hours each'
    );

    const multiSessionShort: PublishableClass = {
      ...multiSession,
      durationMinutes: 45,
    };
    expect(mapClassToFieldData(multiSessionShort, { isDev: false })['duration-display']).toBe(
      '45 min each'
    );
  });

  it('formats spots display correctly', () => {
    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 9 })['spots-display']
    ).toBe('1 spot remaining');

    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 3 })['spots-display']
    ).toBe('7 spots remaining');

    expect(
      mapClassToFieldData(mockClass, { isDev: false, registrationCount: 10 })['spots-display']
    ).toBe('Waitlist Available');
  });

  it('sets isDev flag correctly', () => {
    const result = mapClassToFieldData(mockClass, { isDev: true });
    expect(result['is-dev-environment']).toBe(true);
  });

  it('calculates spots remaining from registration count', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      registrationCount: 3,
    });
    expect(result['spots-remaining']).toBe(7);
  });

  it('defaults spots remaining to full capacity when no registration count', () => {
    const result = mapClassToFieldData(mockClass, { isDev: false });
    expect(result['spots-remaining']).toBe(10);
  });

  it('maps skill level with proper capitalization', () => {
    expect(
      mapClassToFieldData(mockClass, { isDev: false })['skill-level']
    ).toBe('Beginner');

    const advancedClass = { ...mockClass, skillLevel: 'all-levels' as const };
    expect(
      mapClassToFieldData(advancedClass, { isDev: false })['skill-level']
    ).toBe('All Levels');
  });

  it('includes optional fields when present', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      instructorName: 'Jane Doe',
      instructorBio: 'Jane has been teaching pottery for 15 years.',
      instructorImage: 'https://storage.example.com/instructors/jane.jpg',
      categoryName: 'Ceramics',
    });

    expect(result['short-description']).toBe('Intro to pottery');
    expect(result.description).toBe('Learn the basics of pottery');
    expect(result.location).toBe('Main Studio');
    expect(result['materials-included']).toBe('Clay, glazes, tools');
    expect(result['what-to-bring']).toBe('Apron, towel');
    expect(result['minimum-age']).toBe(12);
    expect(result['instructor-name']).toBe('Jane Doe');
    expect(result['instructor-bio']).toBe(
      'Jane has been teaching pottery for 15 years.'
    );
    expect(result['instructor-image']).toEqual({
      url: 'https://storage.example.com/instructors/jane.jpg',
      alt: 'Jane Doe profile photo',
    });
    expect(result['category-name']).toBe('Ceramics');
    expect(result['class-image']).toEqual({
      url: 'https://storage.example.com/pottery.jpg',
      alt: 'Pottery 101 class image',
    });
  });

  it('uses fallback alt text for instructor image when no name provided', () => {
    const result = mapClassToFieldData(mockClass, {
      isDev: false,
      instructorImage: 'https://storage.example.com/instructors/jane.jpg',
    });

    expect(result['instructor-image']).toEqual({
      url: 'https://storage.example.com/instructors/jane.jpg',
      alt: 'Instructor profile photo',
    });
  });

  it('omits optional fields when not present', () => {
    const minimalClass: PublishableClass = {
      id: 'class-min',
      name: 'Basic Class',
      description: 'A basic class',
      sessions: [
        { dateTime: new Date('2026-06-01T10:00:00.000Z') },
      ] satisfies [ClassSession, ...ClassSession[]],
      durationMinutes: 60,
      capacity: 8,
      priceCents: 2500,
      skillLevel: 'all-levels',
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = mapClassToFieldData(minimalClass, { isDev: false });

    expect(result['short-description']).toBeUndefined();
    expect(result['class-image']).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result['materials-included']).toBeUndefined();
    expect(result['what-to-bring']).toBeUndefined();
    expect(result['minimum-age']).toBeUndefined();
    expect(result['instructor-name']).toBeUndefined();
    expect(result['instructor-bio']).toBeUndefined();
    expect(result['instructor-image']).toBeUndefined();
    expect(result['category-name']).toBeUndefined();
    expect(result['class-gallery']).toBeUndefined();
  });

  it('maps galleryImages to the class-gallery MultiImage field', () => {
    const classWithGallery: PublishableClass = {
      ...mockClass,
      galleryImages: [
        {
          url: 'https://storage.example.com/g1.jpg',
          alt: 'Hands centering clay on the wheel',
        },
        {
          url: 'https://storage.example.com/g2.jpg',
          alt: 'Finished bowls on a drying rack',
        },
      ],
    };

    const result = mapClassToFieldData(classWithGallery, { isDev: false });

    expect(result['class-gallery']).toEqual([
      {
        url: 'https://storage.example.com/g1.jpg',
        alt: 'Hands centering clay on the wheel',
      },
      {
        url: 'https://storage.example.com/g2.jpg',
        alt: 'Finished bowls on a drying rack',
      },
    ]);
  });

  it('omits class-gallery when galleryImages is empty', () => {
    const result = mapClassToFieldData(
      { ...mockClass, galleryImages: [] },
      { isDev: false }
    );

    expect(result['class-gallery']).toBeUndefined();
  });
});

// ── ClassService tests ──────────────────────────────────────────────────

describe('ClassService', () => {
  const COLLECTION_ID = 'col-classes-123';

  // Mock Webflow client
  const mockClient = {
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
  };

  let service: ClassService;

  const mockClass: PublishableClass = {
    id: 'class-abc',
    name: 'Pottery 101',
    description: 'Learn the basics of pottery',
    shortDescription: 'Intro to pottery',
    instructorId: 'inst-1',
    sessions: oneSession,
    durationMinutes: 120,
    capacity: 10,
    priceCents: 4500,
    imageUrl: 'https://storage.example.com/pottery.jpg',
    categoryId: 'cat-1',
    skillLevel: 'beginner',
    status: 'published',
    location: 'Main Studio',
    materialsIncluded: 'Clay, glazes, tools',
    whatToBring: 'Apron, towel',
    minimumAge: 12,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ClassService(mockClient as any, COLLECTION_ID);
  });

  describe('syncClass', () => {
    it('creates a new Webflow item when class does not exist', async () => {
      // findByFirebaseId returns nothing
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      // Webflow auto-suffixed the slug on create — capture the real value.
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new-item',
        fieldData: { slug: 'pottery-101-9f2a1' },
      });

      const result = await service.syncClass({
        classEntity: mockClass,
        publish: false,
        isDev: false,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-new-item',
        webflowSlug: 'pottery-101-9f2a1',
        isNew: true,
      });
      expect(mockClient.collections.items.createItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        expect.objectContaining({
          isArchived: false,
          isDraft: false,
          fieldData: expect.objectContaining({
            'firebase-id': 'class-abc',
            name: 'Pottery 101',
          }),
        })
      );
    });

    it('updates an existing Webflow item when class already exists', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            id: 'wf-existing',
            fieldData: { 'firebase-id': 'class-abc' },
          },
        ],
      });
      // Update response echoes the item's existing (unchanged) slug.
      mockClient.collections.items.updateItem.mockResolvedValue({
        fieldData: { slug: 'pottery-101-9f2a1' },
      });

      const result = await service.syncClass({
        classEntity: mockClass,
        publish: false,
        isDev: false,
        instructorName: 'Jane Doe',
        categoryName: 'Ceramics',
        registrationCount: 3,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-existing',
        webflowSlug: 'pottery-101-9f2a1',
        isNew: false,
      });
      expect(mockClient.collections.items.updateItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-existing',
        expect.objectContaining({
          isArchived: false,
          isDraft: false,
          fieldData: expect.objectContaining({
            'firebase-id': 'class-abc',
            'instructor-name': 'Jane Doe',
            'category-name': 'Ceramics',
            'spots-remaining': 7,
          }),
        })
      );

      // Slug must not be sent on update — Webflow rejects with 400 when
      // a slug collides (it auto-suffixes on create but not on update).
      const sentFieldData = mockClient.collections.items.updateItem.mock
        .calls[0][2].fieldData;
      expect(sentFieldData).not.toHaveProperty('slug');
    });

    it('publishes the item after sync when publish is true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-publish-me',
      });
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.syncClass({
        classEntity: mockClass,
        publish: true,
        isDev: false,
      });

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-publish-me'] }
      );
    });

    it('does not publish the item when publish is false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-no-publish',
      });

      await service.syncClass({
        classEntity: mockClass,
        publish: false,
        isDev: false,
      });

      expect(
        mockClient.collections.items.publishItem
      ).not.toHaveBeenCalled();
    });

    it('defaults publish to false and isDev to false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-defaults',
      });

      await service.syncClass({ classEntity: mockClass });

      expect(
        mockClient.collections.items.publishItem
      ).not.toHaveBeenCalled();
      // The field data should have isDev = false
      const createCall = mockClient.collections.items.createItem.mock.calls[0];
      expect(createCall[1].fieldData['is-dev-environment']).toBe(false);
    });

    it('passes instructorBio and instructorImage through to field data', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-enriched',
      });

      await service.syncClass({
        classEntity: mockClass,
        instructorName: 'Jane',
        instructorBio: 'Expert potter',
        instructorImage: 'https://example.com/jane.jpg',
      });

      const createCall = mockClient.collections.items.createItem.mock.calls[0];
      expect(createCall[1].fieldData['instructor-bio']).toBe('Expert potter');
      expect(createCall[1].fieldData['instructor-image']).toEqual({
        url: 'https://example.com/jane.jpg',
        alt: 'Jane profile photo',
      });
    });

    it('uses existingWebflowItemId fast path and skips listItems scan', async () => {
      mockClient.collections.items.getItem.mockResolvedValue({
        id: 'wf-known',
        fieldData: { 'firebase-id': 'class-abc' },
      });
      mockClient.collections.items.updateItem.mockResolvedValue({
        fieldData: { slug: 'pottery-101' },
      });

      const result = await service.syncClass({
        classEntity: mockClass,
        existingWebflowItemId: 'wf-known',
        registrationCount: 4,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-known',
        webflowSlug: 'pottery-101',
        isNew: false,
      });
      expect(mockClient.collections.items.getItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-known'
      );
      // No collection scan needed when we have the ID.
      expect(mockClient.collections.items.listItems).not.toHaveBeenCalled();
      expect(mockClient.collections.items.updateItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-known',
        expect.any(Object)
      );
    });

    it('falls back to listItems scan when known Webflow item is gone (404)', async () => {
      // getItem rejects (item deleted in Webflow)
      mockClient.collections.items.getItem.mockRejectedValue(
        new Error('Not found')
      );
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-recreated',
      });

      const result = await service.syncClass({
        classEntity: mockClass,
        existingWebflowItemId: 'wf-deleted',
      });

      expect(result.isNew).toBe(true);
      expect(result.webflowItemId).toBe('wf-recreated');
      expect(mockClient.collections.items.listItems).toHaveBeenCalled();
      expect(mockClient.collections.items.createItem).toHaveBeenCalled();
    });

    it('paginates findByFirebaseId past the first 100 items', async () => {
      const fillerItems = Array.from({ length: 100 }, (_, i) => ({
        id: `wf-other-${i}`,
        fieldData: { 'firebase-id': `other-class-${i}` },
      }));
      // First page: 100 items, none matching → caller pages forward
      // Second page: contains the match
      mockClient.collections.items.listItems
        .mockResolvedValueOnce({ items: fillerItems })
        .mockResolvedValueOnce({
          items: [
            {
              id: 'wf-needle',
              fieldData: { 'firebase-id': 'class-abc' },
            },
          ],
        });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncClass({ classEntity: mockClass });

      expect(result.isNew).toBe(false);
      expect(result.webflowItemId).toBe('wf-needle');
      expect(mockClient.collections.items.listItems).toHaveBeenCalledTimes(2);
      expect(mockClient.collections.items.listItems).toHaveBeenNthCalledWith(
        2,
        COLLECTION_ID,
        { limit: 100, offset: 100 }
      );
    });
  });

  describe('createItem', () => {
    it('throws when Webflow API returns no ID', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({});

      await expect(
        service.syncClass({ classEntity: mockClass })
      ).rejects.toThrow('Webflow API did not return an item ID after creation');
    });
  });

  describe('removeClass', () => {
    it('deletes existing Webflow item and returns true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            id: 'wf-to-delete',
            fieldData: { 'firebase-id': 'class-abc' },
          },
        ],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      const result = await service.removeClass('class-abc');

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-to-delete'
      );
    });

    it('defaults to staged delete (deleteItem, not deleteItemLive)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-staged', fieldData: { 'firebase-id': 'class-abc' } }],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      await service.removeClass('class-abc');

      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledTimes(1);
      expect(
        mockClient.collections.items.deleteItemLive
      ).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true to auto-publish removal', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'class-abc' } }],
      });
      mockClient.collections.items.deleteItemLive.mockResolvedValue({});

      const result = await service.removeClass('class-abc', true);

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItemLive).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-live'
      );
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });

    it('uses deleteItem when publish=false', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-staged', fieldData: { 'firebase-id': 'class-abc' } }],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      await service.removeClass('class-abc', false);

      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-staged'
      );
      expect(
        mockClient.collections.items.deleteItemLive
      ).not.toHaveBeenCalled();
    });

    it('returns false when class not found in Webflow', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeClass('class-nonexistent');

      expect(result).toBe(false);
      expect(
        mockClient.collections.items.deleteItem
      ).not.toHaveBeenCalled();
    });

    it('does not call any delete when publish=true and item not found', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeClass('class-missing', true);

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

  describe('findByFirebaseId (via syncClass/removeClass)', () => {
    it('returns null when listItems response has no items', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({});

      const result = await service.removeClass('class-abc');
      expect(result).toBe(false);
    });

    it('returns null when listItems throws an error', async () => {
      mockClient.collections.items.listItems.mockRejectedValue(
        new Error('Network error')
      );

      const result = await service.removeClass('class-abc');
      expect(result).toBe(false);
    });

    it('returns null when matching item has no id', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [
          {
            // no id field
            fieldData: { 'firebase-id': 'class-abc' },
          },
        ],
      });

      // Should treat it as not found, so syncClass creates a new item
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new',
      });

      const result = await service.syncClass({ classEntity: mockClass });
      expect(result.isNew).toBe(true);
    });
  });
});
