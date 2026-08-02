import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapDemoToFieldData, MtDemoWebflowService } from './mt-demo.service';
import type { MusicTogetherDemo } from '@maple/ts/domain';

// A future, EST (pre-DST) Thursday at 10:00 AM ET: 2027-03-04T15:00:00Z.
// DST 2027 starts March 14, so 15:00 UTC = 10:00 AM America/New_York.
const baseDemo: MusicTogetherDemo = {
  id: 'demo-123',
  dateTime: new Date('2027-03-04T15:00:00Z'),
  location: 'Morgantown Public Library',
  capacityFamilies: 8,
  visible: true,
  createdAt: new Date('2026-01-01'),
};

describe('mapDemoToFieldData', () => {
  const prodOptions = { isDev: false, confirmedCount: 0 };

  it('maps firebase-id, name (incl. location), and slug', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['firebase-id']).toBe('demo-123');
    expect(typeof fd.name).toBe('string');
    expect(fd.name).toContain('Morgantown Public Library');
    expect(typeof fd.slug).toBe('string');
    expect(fd.slug).not.toBe('');
  });

  it('sets is-dev-environment from options', () => {
    expect(
      mapDemoToFieldData(baseDemo, { isDev: true, confirmedCount: 0 })[
        'is-dev-environment'
      ]
    ).toBe(true);
    expect(mapDemoToFieldData(baseDemo, prodOptions)['is-dev-environment']).toBe(
      false
    );
  });

  it('maps numeric capacity/spots fields', () => {
    const fd = mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 3 });
    expect(fd['capacity-families']).toBe(8);
    expect(fd['spots-remaining']).toBe(5);
  });

  it('is FREE — carries no price or installment fields', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd).not.toHaveProperty('price-full-cents');
    expect(fd).not.toHaveProperty('price-display');
    expect(fd).not.toHaveProperty('installment-summary');
  });

  it('derives status=open for a visible, future-dated demo with room', () => {
    const fd = mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 3 });
    expect(fd['status']).toBe('open');
  });

  it('derives status=full when confirmed count reaches capacity', () => {
    const fd = mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 8 });
    expect(fd['status']).toBe('full');
  });

  it('derives status=past for a past-dated demo', () => {
    const fd = mapDemoToFieldData(
      { ...baseDemo, dateTime: new Date('2020-01-01T15:00:00Z') },
      prodOptions
    );
    expect(fd['status']).toBe('past');
  });

  it('sets date-time to the demo dateTime ISO string', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['date-time']).toBe('2027-03-04T15:00:00.000Z');
  });

  it('renders spots-display "Full" when no spots remain', () => {
    const fd = mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 8 });
    expect(fd['spots-display']).toBe('Full');
  });

  it('renders singular vs plural spots-display', () => {
    expect(
      mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 7 })[
        'spots-display'
      ]
    ).toBe('1 spot left');
    expect(
      mapDemoToFieldData(baseDemo, { isDev: false, confirmedCount: 6 })[
        'spots-display'
      ]
    ).toBe('2 spots left');
  });

  it('formats date-display as weekday, month day (ET)', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['date-display']).toBe('Thursday, March 4');
  });

  it('formats time-display as a start–end range with one meridiem (ET)', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['time-display']).toBe('10:00–10:45 AM');
  });

  it('uses the demo duration for the time-display end and duration-display', () => {
    const fd = mapDemoToFieldData(
      { ...baseDemo, durationMinutes: 60 },
      prodOptions
    );
    expect(fd['time-display']).toBe('10:00–11:00 AM');
    expect(fd['duration-display']).toBe('60 minutes');
  });

  it('falls back to the default MT duration when unset', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['duration-display']).toBe('45 minutes');
  });

  it('maps the free-text location', () => {
    const fd = mapDemoToFieldData(baseDemo, prodOptions);
    expect(fd['location']).toBe('Morgantown Public Library');
  });
});

describe('MtDemoWebflowService', () => {
  const COLLECTION_ID = 'col-mt-demos-123';

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

  let service: MtDemoWebflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MtDemoWebflowService(mockClient as any, COLLECTION_ID);
  });

  describe('syncDemo', () => {
    it('creates a new Webflow item when demo does not exist', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new-item',
      });

      const result = await service.syncDemo({
        demo: baseDemo,
        publish: false,
        isDev: false,
        confirmedCount: 2,
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
            'firebase-id': 'demo-123',
            'spots-remaining': 6,
          }),
        })
      );
    });

    it('creates a DEV item as a draft (leak guard) and does not publish', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-dev-item',
      });

      await service.syncDemo({
        demo: baseDemo,
        // In dev the trigger passes publish=false; even if it didn't, isDraft
        // is what keeps a full-site publish from making it live.
        publish: false,
        isDev: true,
      });

      expect(mockClient.collections.items.createItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        expect.objectContaining({ isDraft: true })
      );
      expect(mockClient.collections.items.publishItem).not.toHaveBeenCalled();
    });

    it('updates an existing DEV item as a draft (leak guard)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'demo-123' } }],
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      await service.syncDemo({ demo: baseDemo, isDev: true });

      const call = mockClient.collections.items.updateItem.mock.calls[0][2];
      expect(call.isDraft).toBe(true);
    });

    it('updates an existing Webflow item and omits slug on update', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'demo-123' } }],
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncDemo({
        demo: baseDemo,
        confirmedCount: 0,
      });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-existing',
        isNew: false,
      });
      const sentFieldData =
        mockClient.collections.items.updateItem.mock.calls[0][2].fieldData;
      expect(sentFieldData).not.toHaveProperty('slug');
      expect(sentFieldData['firebase-id']).toBe('demo-123');
    });

    it('publishes after sync when publish is true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-publish-me',
      });
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.syncDemo({ demo: baseDemo, publish: true });

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-publish-me'] }
      );
    });

    it('uses existingWebflowItemId fast path and skips listItems scan', async () => {
      mockClient.collections.items.getItem.mockResolvedValue({
        id: 'wf-known',
        fieldData: { 'firebase-id': 'demo-123' },
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncDemo({
        demo: baseDemo,
        existingWebflowItemId: 'wf-known',
      });

      expect(result.webflowItemId).toBe('wf-known');
      expect(result.isNew).toBe(false);
      expect(mockClient.collections.items.listItems).not.toHaveBeenCalled();
    });
  });

  describe('removeDemo', () => {
    it('deletes an existing item and returns true (staged by default)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-to-delete', fieldData: { 'firebase-id': 'demo-123' } }],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      const result = await service.removeDemo('demo-123');

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-to-delete'
      );
      expect(mockClient.collections.items.deleteItemLive).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'demo-123' } }],
      });
      mockClient.collections.items.deleteItemLive.mockResolvedValue({});

      const result = await service.removeDemo('demo-123', true);

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItemLive).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-live'
      );
    });

    it('returns false when demo not found', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeDemo('demo-missing');

      expect(result).toBe(false);
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });
  });
});
