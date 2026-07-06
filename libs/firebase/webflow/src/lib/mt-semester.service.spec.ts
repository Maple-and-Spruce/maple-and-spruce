import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapSemesterToFieldData, MtSemesterService } from './mt-semester.service';
import type { MusicTogetherSemester } from '@maple/ts/domain';

const baseSemester: MusicTogetherSemester = {
  id: 'semester-123',
  name: 'Fall 2026',
  season: 'fall',
  year: 2026,
  startDate: new Date('2026-09-10T14:00:00Z'),
  endDate: new Date('2026-11-12T14:00:00Z'),
  weeks: 10,
  enrollmentOpensAt: new Date('2026-08-01T12:00:00Z'),
  status: 'enrolling',
  notes: 'Exact dates confirmed by summer.',
  breaks: [
    {
      label: 'Thanksgiving Break',
      startDate: new Date('2026-11-24T05:00:00Z'),
      endDate: new Date('2026-11-28T05:00:00Z'),
    },
  ],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('mapSemesterToFieldData', () => {
  const prodOptions = { isDev: false };

  it('maps firebase-id, name, and slug', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['firebase-id']).toBe('semester-123');
    expect(fd.name).toBe('Fall 2026');
    expect(fd.slug).toBe('fall-2026');
  });

  it('sets is-dev-environment from options', () => {
    expect(
      mapSemesterToFieldData(baseSemester, { isDev: true })['is-dev-environment']
    ).toBe(true);
    expect(mapSemesterToFieldData(baseSemester, prodOptions)['is-dev-environment']).toBe(
      false
    );
  });

  it('maps season, season-label, year, and status', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['season']).toBe('fall');
    expect(fd['season-label']).toBe('Fall');
    expect(fd['year']).toBe(2026);
    expect(fd['status']).toBe('enrolling');
  });

  it('sets start-date and end-date to ISO strings', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['start-date']).toBe('2026-09-10T14:00:00.000Z');
    expect(fd['end-date']).toBe('2026-11-12T14:00:00.000Z');
  });

  it('sets enrollment-opens-at to an ISO string', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['enrollment-opens-at']).toBe('2026-08-01T12:00:00.000Z');
  });

  it('omits start-date, end-date, and enrollment-opens-at when absent', () => {
    const fd = mapSemesterToFieldData(
      {
        ...baseSemester,
        startDate: undefined,
        endDate: undefined,
        enrollmentOpensAt: undefined,
      },
      prodOptions
    );
    expect(fd).not.toHaveProperty('start-date');
    expect(fd).not.toHaveProperty('end-date');
    expect(fd).not.toHaveProperty('enrollment-opens-at');
  });

  it('sets sort-value from mtSemesterSortValue (startDate time when set)', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['sort-value']).toBe(baseSemester.startDate!.getTime());
  });

  it('falls back to year+season sort-value when startDate is unset', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, startDate: undefined },
      prodOptions
    );
    // fall is index 0 → year * 12 + 0
    expect(fd['sort-value']).toBe(2026 * 12);
  });

  it('maps weeks and weeks-display', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['weeks']).toBe(10);
    expect(fd['weeks-display']).toBe('10 weeks');
  });

  it('renders singular weeks-display', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, weeks: 1 },
      prodOptions
    );
    expect(fd['weeks-display']).toBe('1 week');
  });

  it('omits weeks and weeks-display when weeks is unset', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, weeks: undefined },
      prodOptions
    );
    expect(fd).not.toHaveProperty('weeks');
    expect(fd).not.toHaveProperty('weeks-display');
  });

  it('formats date-range-display collapsing a shared year', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['date-range-display']).toBe('September 10 – November 12, 2026');
  });

  it('spans years in date-range-display when they differ', () => {
    const fd = mapSemesterToFieldData(
      {
        ...baseSemester,
        startDate: new Date('2026-12-01T14:00:00Z'),
        endDate: new Date('2027-02-01T14:00:00Z'),
      },
      prodOptions
    );
    expect(fd['date-range-display']).toBe(
      'December 1, 2026 – February 1, 2027'
    );
  });

  it('degrades date-range-display to a single date when only start is set', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, endDate: undefined },
      prodOptions
    );
    expect(fd['date-range-display']).toBe('September 10, 2026');
  });

  it('renders an empty date-range-display when neither date is set', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, startDate: undefined, endDate: undefined },
      prodOptions
    );
    expect(fd['date-range-display']).toBe('');
  });

  it('summarizes breaks as "label: start – end"', () => {
    const fd = mapSemesterToFieldData(baseSemester, prodOptions);
    expect(fd['breaks-summary']).toBe(
      'Thanksgiving Break: November 24 – November 28'
    );
  });

  it('omits breaks-summary when there are no breaks', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, breaks: undefined },
      prodOptions
    );
    expect(fd).not.toHaveProperty('breaks-summary');
  });

  it('omits notes when absent', () => {
    const fd = mapSemesterToFieldData(
      { ...baseSemester, notes: undefined },
      prodOptions
    );
    expect(fd).not.toHaveProperty('notes');
    expect(mapSemesterToFieldData(baseSemester, prodOptions)['notes']).toBe(
      'Exact dates confirmed by summer.'
    );
  });
});

describe('MtSemesterService', () => {
  const COLLECTION_ID = 'col-mt-semesters-123';

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

  let service: MtSemesterService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MtSemesterService(mockClient as any, COLLECTION_ID);
  });

  describe('syncSemester', () => {
    it('creates a new Webflow item when semester does not exist', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-new-item',
      });

      const result = await service.syncSemester({
        semester: baseSemester,
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
            'firebase-id': 'semester-123',
            name: 'Fall 2026',
            season: 'fall',
          }),
        })
      );
    });

    it('updates an existing Webflow item and omits slug on update', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-existing', fieldData: { 'firebase-id': 'semester-123' } }],
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncSemester({ semester: baseSemester });

      expect(result).toEqual({
        success: true,
        webflowItemId: 'wf-existing',
        isNew: false,
      });
      const sentFieldData =
        mockClient.collections.items.updateItem.mock.calls[0][2].fieldData;
      expect(sentFieldData).not.toHaveProperty('slug');
      expect(sentFieldData['firebase-id']).toBe('semester-123');
    });

    it('publishes after sync when publish is true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });
      mockClient.collections.items.createItem.mockResolvedValue({
        id: 'wf-publish-me',
      });
      mockClient.collections.items.publishItem.mockResolvedValue({});

      await service.syncSemester({ semester: baseSemester, publish: true });

      expect(mockClient.collections.items.publishItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        { itemIds: ['wf-publish-me'] }
      );
    });

    it('uses existingWebflowItemId fast path and skips listItems scan', async () => {
      mockClient.collections.items.getItem.mockResolvedValue({
        id: 'wf-known',
        fieldData: { 'firebase-id': 'semester-123' },
      });
      mockClient.collections.items.updateItem.mockResolvedValue({});

      const result = await service.syncSemester({
        semester: baseSemester,
        existingWebflowItemId: 'wf-known',
      });

      expect(result.webflowItemId).toBe('wf-known');
      expect(result.isNew).toBe(false);
      expect(mockClient.collections.items.listItems).not.toHaveBeenCalled();
    });
  });

  describe('removeSemester', () => {
    it('deletes an existing item and returns true (staged by default)', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-to-delete', fieldData: { 'firebase-id': 'semester-123' } }],
      });
      mockClient.collections.items.deleteItem.mockResolvedValue({});

      const result = await service.removeSemester('semester-123');

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItem).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-to-delete'
      );
      expect(mockClient.collections.items.deleteItemLive).not.toHaveBeenCalled();
    });

    it('uses deleteItemLive when publish=true', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({
        items: [{ id: 'wf-live', fieldData: { 'firebase-id': 'semester-123' } }],
      });
      mockClient.collections.items.deleteItemLive.mockResolvedValue({});

      const result = await service.removeSemester('semester-123', true);

      expect(result).toBe(true);
      expect(mockClient.collections.items.deleteItemLive).toHaveBeenCalledWith(
        COLLECTION_ID,
        'wf-live'
      );
    });

    it('returns false when semester not found', async () => {
      mockClient.collections.items.listItems.mockResolvedValue({ items: [] });

      const result = await service.removeSemester('semester-missing');

      expect(result).toBe(false);
      expect(mockClient.collections.items.deleteItem).not.toHaveBeenCalled();
    });
  });
});
