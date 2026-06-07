/**
 * Integration tests for the classCatalogFeed HTTP endpoint.
 *
 * Exercises the deployed onRequest endpoint through the Functions emulator
 * against real Firestore (seeded via the emulator REST API). Verifies the
 * filter rules that decide which classes reach Meta Commerce Manager and
 * Google Merchant Center:
 *
 *   - Only `published` classes appear (not draft / cancelled / completed)
 *   - Only classes with at least one upcoming session appear
 *   - Classes missing an image are silently dropped (catalog would reject)
 *   - Sold-out classes are dropped entirely (no `out_of_stock` rows) so
 *     Meta Advantage+ stops burning impressions on full sessions
 *   - Open spots → `<g:availability>in_stock</g:availability>`
 *   - OPTIONS preflight short-circuits with 204
 *
 * Seeds use the emulator's Firestore REST API directly; we don't hit any
 * Cloud Function except `classCatalogFeed` so each test owns its dataset.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EMULATOR_CONFIG,
  clearFirestoreEmulator,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';

const FEED_URL = `${EMULATOR_CONFIG.functionsHost}/${EMULATOR_CONFIG.projectId}/${EMULATOR_CONFIG.region}/classCatalogFeed`;

function isoFutureDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isoPastDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

interface SeedClassOptions {
  id: string;
  name: string;
  status?: 'draft' | 'published' | 'cancelled' | 'completed';
  capacity?: number;
  sessionAt?: string;
  imageUrl?: string | null;
  priceCents?: number;
}

async function seedClass(opts: SeedClassOptions): Promise<void> {
  const sessionAt = opts.sessionAt ?? isoFutureDays(30);
  const data: Record<string, unknown> = {
    name: opts.name,
    description: `Description for ${opts.name}`,
    sessions: [{ dateTime: sessionAt }],
    firstSessionAt: sessionAt,
    durationMinutes: 120,
    capacity: opts.capacity ?? 8,
    priceCents: opts.priceCents ?? 4500,
    skillLevel: 'all-levels',
    status: opts.status ?? 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (opts.imageUrl !== null) {
    data['imageUrl'] = opts.imageUrl ?? `https://example.com/${opts.id}.jpg`;
  }
  await setFirestoreDoc('classes', opts.id, data);
}

async function seedRegistration(
  classId: string,
  index: number,
  status: 'pending' | 'confirmed' | 'cancelled' = 'confirmed'
): Promise<void> {
  await setFirestoreDoc('registrations', `${classId}-reg-${index}`, {
    classId,
    status,
    studentName: `Student ${index}`,
    studentEmail: `student${index}@test.com`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function fetchFeed(): Promise<{ status: number; body: string }> {
  const response = await fetch(FEED_URL, { method: 'GET' });
  return { status: response.status, body: await response.text() };
}

function extractIds(xml: string): string[] {
  const matches = xml.match(/<g:id>([^<]+)<\/g:id>/g) ?? [];
  return matches.map((m) => m.replace(/<\/?g:id>/g, ''));
}

describe('classCatalogFeed', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  describe('CORS preflight', () => {
    it('short-circuits OPTIONS with 204 and no body', async () => {
      const response = await fetch(FEED_URL, { method: 'OPTIONS' });
      expect(response.status).toBe(204);
      const text = await response.text();
      expect(text).toBe('');
    });
  });

  describe('Status filter', () => {
    it('includes published classes and excludes draft / cancelled / completed', async () => {
      await Promise.all([
        seedClass({ id: 'pub', name: 'Published', status: 'published' }),
        seedClass({ id: 'draft', name: 'Draft', status: 'draft' }),
        seedClass({ id: 'cancelled', name: 'Cancelled', status: 'cancelled' }),
        seedClass({ id: 'completed', name: 'Completed', status: 'completed' }),
      ]);

      const result = await fetchFeed();
      expect(result.status).toBe(200);
      const ids = extractIds(result.body);
      expect(ids).toEqual(['pub']);
    });
  });

  describe('Upcoming filter', () => {
    it('drops classes whose only session is in the past', async () => {
      await Promise.all([
        seedClass({
          id: 'future',
          name: 'Future',
          sessionAt: isoFutureDays(14),
        }),
        seedClass({
          id: 'past',
          name: 'Past',
          sessionAt: isoPastDays(14),
        }),
      ]);

      const result = await fetchFeed();
      expect(extractIds(result.body)).toEqual(['future']);
    });
  });

  describe('Missing image', () => {
    it('drops classes with no imageUrl so the row never fails ingestion', async () => {
      await Promise.all([
        seedClass({ id: 'with-image', name: 'With Image' }),
        seedClass({ id: 'no-image', name: 'No Image', imageUrl: null }),
      ]);

      const result = await fetchFeed();
      expect(extractIds(result.body)).toEqual(['with-image']);
    });
  });

  describe('Sold-out filter', () => {
    it('drops sold-out classes entirely (no out_of_stock rows reach Meta)', async () => {
      await Promise.all([
        seedClass({ id: 'open', name: 'Open Spots', capacity: 8 }),
        seedClass({ id: 'full', name: 'Full Class', capacity: 4 }),
        seedClass({ id: 'oversold', name: 'Oversold', capacity: 4 }),
      ]);
      // 2 confirmed for 'open' (6 spots left), 4 confirmed for 'full' (sold out),
      // 99 confirmed for 'oversold' (also sold out, negative-spots edge case)
      await Promise.all([
        seedRegistration('open', 1),
        seedRegistration('open', 2),
        seedRegistration('full', 1),
        seedRegistration('full', 2),
        seedRegistration('full', 3),
        seedRegistration('full', 4),
        ...Array.from({ length: 99 }, (_, i) =>
          seedRegistration('oversold', i)
        ),
      ]);

      const result = await fetchFeed();
      const ids = extractIds(result.body);
      expect(ids).toEqual(['open']);
      expect(result.body).not.toContain('out_of_stock');
      expect(result.body).toContain('<g:availability>in_stock</g:availability>');
    });

    it('counts pending registrations toward capacity (holds a spot like confirmed)', async () => {
      await seedClass({ id: 'mixed', name: 'Mixed', capacity: 3 });
      await Promise.all([
        seedRegistration('mixed', 1, 'pending'),
        seedRegistration('mixed', 2, 'pending'),
        seedRegistration('mixed', 3, 'confirmed'),
      ]);

      const result = await fetchFeed();
      expect(extractIds(result.body)).toEqual([]);
    });

    it('ignores cancelled registrations when counting capacity', async () => {
      await seedClass({ id: 'partial', name: 'Partial', capacity: 2 });
      await Promise.all([
        seedRegistration('partial', 1, 'confirmed'),
        seedRegistration('partial', 2, 'cancelled'),
        seedRegistration('partial', 3, 'cancelled'),
      ]);

      const result = await fetchFeed();
      expect(extractIds(result.body)).toEqual(['partial']);
    });
  });

  describe('Feed shape', () => {
    it('emits valid RSS 2.0 with the Google namespace and the catalog headers', async () => {
      await seedClass({
        id: 'shape',
        name: 'Shape Test',
        priceCents: 19900,
      });

      const response = await fetch(FEED_URL, { method: 'GET' });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(response.headers.get('cache-control')).toContain('max-age=900');

      const xml = await response.text();
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
      expect(xml).toContain('<g:id>shape</g:id>');
      expect(xml).toContain('<g:price>199.00 USD</g:price>');
      expect(xml).toContain('<g:availability_postal_codes>26508</g:availability_postal_codes>');
      expect(xml.trim().endsWith('</rss>')).toBe(true);
    });

    it('produces an empty-channel document when no classes are seeded', async () => {
      const result = await fetchFeed();
      expect(result.status).toBe(200);
      expect(result.body).toContain('<channel>');
      expect(result.body).not.toContain('<item>');
      expect(result.body.trim().endsWith('</rss>')).toBe(true);
    });
  });
});
