import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Class } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  classFindAll: vi.fn(),
  classCountRegistrations: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findAll: mocks.classFindAll,
    countRegistrations: mocks.classCountRegistrations,
  },
}));

import {
  buildFeedFromClasses,
  CATALOG_FEED_HEADERS,
  generateClassSlug,
  handleCatalogFeedRequest,
  mapClassToFeedItem,
  type CatalogFeedResponse,
} from './class-catalog-feed';

function makeClass(overrides: Partial<Class> = {}): Class {
  const now = new Date('2026-04-01T00:00:00Z');
  return {
    id: 'class-abc',
    name: 'Stained Glass Studio Series',
    description: 'A four-week studio series for stained glass.',
    sessions: [{ dateTime: new Date('2026-05-01T18:00:00Z') }],
    durationMinutes: 180,
    capacity: 8,
    priceCents: 18000,
    imageUrl: 'https://example.com/stained-glass.jpg',
    skillLevel: 'all-levels',
    status: 'published',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('generateClassSlug', () => {
  it('lowercases and hyphenates a class name', () => {
    expect(generateClassSlug('Stained Glass Studio Series')).toBe(
      'stained-glass-studio-series'
    );
  });

  it('strips leading and trailing punctuation', () => {
    expect(generateClassSlug("!!Hammered Copper!!")).toBe('hammered-copper');
  });

  it('collapses runs of non-alphanumeric characters', () => {
    expect(generateClassSlug('Try-It :: Class!')).toBe('try-it-class');
  });
});

describe('mapClassToFeedItem', () => {
  it('falls back to the name-derived slug when webflowSlug is absent', () => {
    const item = mapClassToFeedItem(makeClass(), 0);
    expect(item?.link).toBe(
      'https://mapleandsprucefolkarts.com/classes/stained-glass-studio-series'
    );
  });

  it('builds the public link from the real Webflow slug when present', () => {
    const item = mapClassToFeedItem(
      makeClass({ webflowSlug: 'stained-glass-studio-series-b192d' }),
      0
    );
    expect(item?.link).toBe(
      'https://mapleandsprucefolkarts.com/classes/stained-glass-studio-series-b192d'
    );
  });

  it('reports availability based on remaining spots', () => {
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 5)?.available).toBe(true);
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 8)?.available).toBe(false);
    expect(mapClassToFeedItem(makeClass({ capacity: 8 }), 99)?.available).toBe(false);
  });

  it('prefers shortDescription over description when present', () => {
    const item = mapClassToFeedItem(
      makeClass({
        shortDescription: 'Short tag',
        description: 'Long description body',
      }),
      0
    );
    expect(item?.description).toBe('Short tag');
  });

  it('falls back to description when shortDescription is missing', () => {
    const item = mapClassToFeedItem(
      makeClass({ shortDescription: undefined, description: 'Full body' }),
      0
    );
    expect(item?.description).toBe('Full body');
  });

  it('returns null when the class has no image (catalog would reject it)', () => {
    expect(mapClassToFeedItem(makeClass({ imageUrl: undefined }), 0)).toBeNull();
  });

  it('uses USD as the currency', () => {
    expect(mapClassToFeedItem(makeClass(), 0)?.currency).toBe('USD');
  });

  it('preserves the priceCents value untouched for the formatter', () => {
    expect(mapClassToFeedItem(makeClass({ priceCents: 4500 }), 0)?.priceCents).toBe(
      4500
    );
  });

  it('attaches the studio postal code so Meta accepts the row as locally available', () => {
    expect(mapClassToFeedItem(makeClass(), 0)?.availabilityPostalCodes).toBe(
      '26508'
    );
  });
});

describe('buildFeedFromClasses', () => {
  it('emits one <item> per published class with an image', () => {
    const xml = buildFeedFromClasses([
      { classEntity: makeClass({ id: 'a', name: 'Class A' }), registrationCount: 0 },
      { classEntity: makeClass({ id: 'b', name: 'Class B' }), registrationCount: 0 },
    ]);

    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
    expect(xml).toContain('<g:id>a</g:id>');
    expect(xml).toContain('<g:id>b</g:id>');
  });

  it('drops classes without an image rather than failing the feed', () => {
    const xml = buildFeedFromClasses([
      { classEntity: makeClass({ id: 'a' }), registrationCount: 0 },
      {
        classEntity: makeClass({ id: 'no-image', imageUrl: undefined }),
        registrationCount: 0,
      },
    ]);

    expect(xml).toContain('<g:id>a</g:id>');
    expect(xml).not.toContain('<g:id>no-image</g:id>');
  });

  it('drops sold-out classes from the feed entirely (no out_of_stock rows)', () => {
    const xml = buildFeedFromClasses([
      {
        classEntity: makeClass({ id: 'open', name: 'Open', capacity: 8 }),
        registrationCount: 2,
      },
      {
        classEntity: makeClass({ id: 'full', name: 'Full', capacity: 4 }),
        registrationCount: 4,
      },
      {
        classEntity: makeClass({ id: 'oversold', name: 'Over', capacity: 4 }),
        registrationCount: 99,
      },
    ]);

    expect(xml).toContain('<g:id>open</g:id>');
    expect(xml).not.toContain('<g:id>full</g:id>');
    expect(xml).not.toContain('<g:id>oversold</g:id>');
    expect(xml).not.toContain('out_of_stock');
  });

  it('produces an empty-channel document when no classes are passed', () => {
    const xml = buildFeedFromClasses([]);
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
    expect(xml.trim().endsWith('</rss>')).toBe(true);
  });
});

interface FakeResponse extends CatalogFeedResponse {
  statusCode: number;
  body: string | unknown;
  headers: Record<string, string>;
}

function createFakeResponse(): FakeResponse {
  const fake = {
    statusCode: 0,
    body: undefined as string | unknown,
    headers: {} as Record<string, string>,
  } as FakeResponse;

  fake.setHeader = (name: string, value: string) => {
    fake.headers[name] = value;
  };

  fake.status = (code: number) => {
    fake.statusCode = code;
    return {
      send: (body?: string) => {
        fake.body = body ?? '';
      },
      json: (body: unknown) => {
        fake.body = body;
      },
    };
  };

  return fake;
}

describe('handleCatalogFeedRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.classFindAll.mockResolvedValue([]);
    mocks.classCountRegistrations.mockResolvedValue(0);
  });

  it('short-circuits OPTIONS preflight requests with 204', async () => {
    const res = createFakeResponse();
    await handleCatalogFeedRequest({ method: 'OPTIONS' }, res);

    expect(res.statusCode).toBe(204);
    expect(mocks.classFindAll).not.toHaveBeenCalled();
  });

  it('queries published, upcoming classes only', async () => {
    const res = createFakeResponse();
    await handleCatalogFeedRequest({ method: 'GET' }, res);

    expect(mocks.classFindAll).toHaveBeenCalledWith({
      status: 'published',
      upcoming: true,
    });
  });

  it('writes the catalog headers and a 200 status on success', async () => {
    mocks.classFindAll.mockResolvedValue([
      makeClass({ id: 'class-1', name: 'Class One' }),
    ]);

    const res = createFakeResponse();
    await handleCatalogFeedRequest({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    Object.entries(CATALOG_FEED_HEADERS).forEach(([key, value]) => {
      expect(res.headers[key]).toBe(value);
    });
    expect(typeof res.body).toBe('string');
    expect(res.body).toContain('<g:id>class-1</g:id>');
  });

  it('drops sold-out classes and emits only open ones as in_stock', async () => {
    mocks.classFindAll.mockResolvedValue([
      makeClass({ id: 'sold-out', name: 'Sold Out', capacity: 4 }),
      makeClass({ id: 'open', name: 'Open Class', capacity: 8 }),
    ]);
    mocks.classCountRegistrations.mockImplementation(async (id: string) =>
      id === 'sold-out' ? 4 : 0
    );

    const res = createFakeResponse();
    await handleCatalogFeedRequest({ method: 'GET' }, res);

    const xml = res.body as string;
    expect(xml).not.toContain('<g:id>sold-out</g:id>');
    expect(xml).toContain('<g:id>open</g:id>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).not.toContain('out_of_stock');
  });

  it('returns 500 with a JSON error body when the repository throws', async () => {
    mocks.classFindAll.mockRejectedValue(new Error('boom'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {
      /* swallow expected error log */
    });

    const res = createFakeResponse();
    await handleCatalogFeedRequest({ method: 'GET' }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to generate feed' });

    consoleError.mockRestore();
  });
});
