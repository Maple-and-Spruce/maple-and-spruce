import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapSectionToFieldData, MtSectionService } from './mt-section.service';
import type { MusicTogetherSection } from '@maple/ts/domain';

const baseSection: MusicTogetherSection = {
  id: 'section-123',
  name: 'Spring 2026 — Tuesdays 10am',
  description: 'A joyful term of music and movement.',
  sessions: [
    { dateTime: new Date('2026-03-03T15:00:00Z') },
    { dateTime: new Date('2026-03-10T15:00:00Z') },
  ],
  capacityFamilies: 8,
  priceFullCents: 25200,
  status: 'open',
  location: 'Maple & Spruce Studio',
  room: 'Room A',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('mapSectionToFieldData', () => {
  const prodOptions = { isDev: false, familyCount: 0 };

  it('maps firebase-id, name, and slug', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(fd['firebase-id']).toBe('section-123');
    expect(fd.name).toBe('Spring 2026 — Tuesdays 10am');
    expect(fd.slug).toBe('spring-2026-tuesdays-10am');
  });

  it('sets is-dev-environment from options', () => {
    expect(
      mapSectionToFieldData(baseSection, { isDev: true, familyCount: 0 })[
        'is-dev-environment'
      ]
    ).toBe(true);
    expect(mapSectionToFieldData(baseSection, prodOptions)['is-dev-environment']).toBe(
      false
    );
  });

  it('maps numeric price/capacity/spots fields', () => {
    const fd = mapSectionToFieldData(baseSection, { isDev: false, familyCount: 3 });
    expect(fd['price-full-cents']).toBe(25200);
    expect(fd['capacity-families']).toBe(8);
    expect(fd['spots-remaining']).toBe(5);
    expect(fd['status']).toBe('open');
  });

  it('sets date-time to the first session ISO string', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(fd['date-time']).toBe('2026-03-03T15:00:00.000Z');
  });

  it('omits date-time when there are no sessions', () => {
    const fd = mapSectionToFieldData(
      { ...baseSection, sessions: [] },
      prodOptions
    );
    expect(fd).not.toHaveProperty('date-time');
  });

  it('formats whole-dollar price without decimals', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(fd['price-display']).toBe('$252');
  });

  it('formats fractional-dollar price with two decimals', () => {
    const fd = mapSectionToFieldData(
      { ...baseSection, priceFullCents: 25250 },
      prodOptions
    );
    expect(fd['price-display']).toBe('$252.50');
  });

  it('renders spots-display "Full" when no spots remain', () => {
    const fd = mapSectionToFieldData(baseSection, { isDev: false, familyCount: 8 });
    expect(fd['spots-display']).toBe('Full');
  });

  it('renders singular vs plural spots-display', () => {
    expect(
      mapSectionToFieldData(baseSection, { isDev: false, familyCount: 7 })[
        'spots-display'
      ]
    ).toBe('1 spot left');
    expect(
      mapSectionToFieldData(baseSection, { isDev: false, familyCount: 6 })[
        'spots-display'
      ]
    ).toBe('2 spots left');
  });

  it('populates date-display and time-display from sessions', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(typeof fd['date-display']).toBe('string');
    expect(fd['date-display']).not.toBe('');
    expect(typeof fd['time-display']).toBe('string');
  });

  it('includes location, room, and description when present', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(fd['location']).toBe('Maple & Spruce Studio');
    expect(fd['room']).toBe('Room A');
    expect(fd['description']).toBe('A joyful term of music and movement.');
  });

  it('omits optional fields when absent', () => {
    const fd = mapSectionToFieldData(
      { ...baseSection, location: undefined, room: undefined, description: undefined },
      prodOptions
    );
    expect(fd).not.toHaveProperty('location');
    expect(fd).not.toHaveProperty('room');
    expect(fd).not.toHaveProperty('description');
  });

  it('omits installment-summary when there is no installment plan', () => {
    const fd = mapSectionToFieldData(baseSection, prodOptions);
    expect(fd).not.toHaveProperty('installment-summary');
  });

  it('summarizes equal installments as "N payments of $X"', () => {
    const fd = mapSectionToFieldData(
      {
        ...baseSection,
        installmentPlan: [
          { amountCents: 13200, dueAt: new Date('2026-03-03') },
          { amountCents: 13200, dueAt: new Date('2026-03-31') },
        ],
      },
      prodOptions
    );
    expect(fd['installment-summary']).toBe('or 2 payments of $132');
  });

  it('summarizes unequal installments by total', () => {
    const fd = mapSectionToFieldData(
      {
        ...baseSection,
        installmentPlan: [
          { amountCents: 15000, dueAt: new Date('2026-03-03') },
          { amountCents: 10200, dueAt: new Date('2026-03-31') },
        ],
      },
      prodOptions
    );
    expect(fd['installment-summary']).toBe('or 2 payments totaling $252');
  });
});

describe('MtSectionService', () => {
  const COLLECTION_ID = 'col-mt-sections-123';

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

  let service: MtSectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MtSectionService(mockClient as any, COLLECTION_ID);
  });

  describe('syncSection', () => {
    it('creates a new Webflow item when section does not exist', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new-item',
      });

      const result = await service.syncSection({
        section: baseSection,
        publish: false,
        isDev: false,
        familyCount: 2,
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
            'firebase-id': 'section-123',
            name: 'Spring 2026 — Tuesdays 10am',
            'spots-remaining': 6,
          }),
        })
      );
    });

    it('updates an existing Webflow item and omits slug on update', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'section-123' } }],
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncSection({
        section: baseSection,
        familyCount: 0,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-existing',
        isNew: false,
      });
      const sentFieldData =
        mockClient.collections.items.updateItem.mock.calls[0][2].fieldData;
      expect(sentFieldData).not.toHaveProperty('slug');
      expect(sentFieldData['firebase-id']).toBe('section-123');
    });

    it('publishes after sync when publish is true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-publish-me',
      });
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.syncSection({ section: baseSection, publish: true });

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-publish-me'] }
      );
    });

    it('uses existingWebflowItemId fast path and skips listItems scan', async () => {
      mockClient.collections.items.getItem.mockResolvedValue({
        id: 'wf-known',
        fieldData: { 'firebase-id': 'section-123' },
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncSection({
        section: baseSection,
        existingWebflowItemId: 'wf-known',
      });

      expect(result.webflowItemId).toBe('wf-known');
      expect(result.isNew).toBe(false);
      expect(mockClient.collections.items.listItems).not.toHaveBeenCalled();
    });
  });

  describe('removeSection', () => {
    it('deletes an existing item and returns true (staged by default)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-to-delete', fieldData: { 'firebase-id': 'section-123' } }],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      const result = await service.removeSection('section-123');

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-to-delete'
      );
      expect(mockClient.collections.items.deleteItemLive).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'section-123' } }],
      });
      mockClient.collections.items.deleteItemLive.mockResolvedValue({});

      const result = await service.removeSection('section-123', true);

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItemLive).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-live'
      );
    });

    it('returns false when section not found', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeSection('section-missing');

      expect(result).toBe(false);
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });
  });
});
