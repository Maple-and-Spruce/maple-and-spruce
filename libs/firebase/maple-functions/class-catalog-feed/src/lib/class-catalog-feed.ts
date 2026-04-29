/**
 * Class Catalog Feed
 *
 * Public HTTP endpoint that serves an RSS 2.0 product-catalog feed of
 * published classes. The feed is consumed by Meta Commerce Manager and
 * Google Merchant Center via their scheduled-fetch flows.
 *
 * Single-feed strategy: both platforms accept RSS 2.0 with the
 * `xmlns:g="http://base.google.com/ns/1.0"` namespace, so one endpoint
 * serves both rather than maintaining separate CSV/TSV files.
 *
 * Subscribe via: /catalog/classes.xml
 */
import { onRequest } from 'firebase-functions/v2/https';
import { ClassRepository } from '@maple/firebase/database';
import type { Class } from '@maple/ts/domain';
import {
  buildClassCatalogFeed,
  type CatalogFeedItem,
} from './build-feed';

const PUBLIC_SITE_BASE_URL = 'https://mapleandsprucefolkarts.com';
const CLASSES_INDEX_PATH = '/upcoming-classes';
const CLASS_DETAIL_PATH = '/classes';
const CHANNEL_TITLE = 'Maple & Spruce Classes';
const CHANNEL_DESCRIPTION =
  'In-person art and craft classes at Maple & Spruce Folk Arts in Morgantown, WV.';
const BRAND = 'Maple & Spruce';
const CURRENCY = 'USD';
// Studio postal code in Morgantown, WV. Meta requires `availability_postal_codes`
// for non-shippable / locally-fulfilled items; without it, every row fails
// catalog ingestion with "Locality fields are missing or incomplete".
const STUDIO_POSTAL_CODES = '26508';

/**
 * Generate the URL slug for a class name. Mirrors the slug logic used by
 * the Webflow sync (`generateClassSlug` in `@maple/firebase/webflow`) so
 * the `link` field points at the correct Webflow class detail page.
 */
export function generateClassSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const CATALOG_FEED_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  // Meta and Google fetch on cadences from hourly to daily; 15min lets edits
  // propagate within one fetch cycle while absorbing repeated requests.
  'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=1800',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

export interface ClassWithRegistrations {
  classEntity: Class;
  registrationCount: number;
}

/**
 * Map a class plus its registration count to a feed item. Returns null if
 * the class lacks the data both platforms require (image, name).
 */
export function mapClassToFeedItem(
  classEntity: Class,
  registrationCount: number
): CatalogFeedItem | null {
  if (!classEntity.imageUrl || !classEntity.name) {
    return null;
  }

  const slug = generateClassSlug(classEntity.name);
  const spotsRemaining = Math.max(
    0,
    classEntity.capacity - registrationCount
  );

  return {
    id: classEntity.id,
    title: classEntity.name,
    description: classEntity.shortDescription || classEntity.description,
    link: `${PUBLIC_SITE_BASE_URL}${CLASS_DETAIL_PATH}/${slug}`,
    imageLink: classEntity.imageUrl,
    priceCents: classEntity.priceCents,
    currency: CURRENCY,
    available: spotsRemaining > 0,
    brand: BRAND,
    availabilityPostalCodes: STUDIO_POSTAL_CODES,
  };
}

export function buildFeedFromClasses(
  classes: ClassWithRegistrations[]
): string {
  const items = classes
    .map(({ classEntity, registrationCount }) =>
      mapClassToFeedItem(classEntity, registrationCount)
    )
    .filter((item): item is CatalogFeedItem => item !== null);

  return buildClassCatalogFeed(
    {
      title: CHANNEL_TITLE,
      link: `${PUBLIC_SITE_BASE_URL}${CLASSES_INDEX_PATH}`,
      description: CHANNEL_DESCRIPTION,
    },
    items
  );
}

/**
 * Minimal request/response shapes for `handleCatalogFeedRequest` so the
 * handler can be unit-tested without spinning up an HTTP server.
 */
export interface CatalogFeedRequest {
  method: string;
}

export interface CatalogFeedResponse {
  setHeader(name: string, value: string): void;
  status(code: number): {
    send(body?: string): void;
    json(body: unknown): void;
  };
}

export async function handleCatalogFeedRequest(
  request: CatalogFeedRequest,
  response: CatalogFeedResponse
): Promise<void> {
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  try {
    const classes = await ClassRepository.findAll({
      status: 'published',
      upcoming: true,
    });

    const enriched: ClassWithRegistrations[] = await Promise.all(
      classes.map(async (classEntity) => ({
        classEntity,
        registrationCount: await ClassRepository.countRegistrations(
          classEntity.id
        ),
      }))
    );

    const xml = buildFeedFromClasses(enriched);

    Object.entries(CATALOG_FEED_HEADERS).forEach(([key, value]) => {
      response.setHeader(key, value);
    });
    response.status(200).send(xml);
  } catch (error) {
    console.error('Error generating class catalog feed:', error);
    response.status(500).json({ error: 'Failed to generate feed' });
  }
}

export const classCatalogFeed = onRequest(
  // No minInstances — the 15-minute CDN cache from CATALOG_FEED_HEADERS
  // absorbs cold starts between Meta/Google fetch cycles.
  { region: 'us-east4', cors: true, concurrency: 80 },
  (request, response) => handleCatalogFeedRequest(request, response)
);
