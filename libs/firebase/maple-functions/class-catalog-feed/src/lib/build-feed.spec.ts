import { describe, it, expect } from 'vitest';
import {
  buildClassCatalogFeed,
  escapeXml,
  formatPrice,
  stripHtml,
  type CatalogChannel,
  type CatalogFeedItem,
} from './build-feed';

const channel: CatalogChannel = {
  title: 'Maple & Spruce Classes',
  link: 'https://mapleandsprucefolkarts.com/upcoming-classes',
  description: 'Test channel',
};

const baseItem: CatalogFeedItem = {
  id: 'class-1',
  title: 'Stained Glass Studio Series',
  description: 'A four-week studio series',
  link: 'https://mapleandsprucefolkarts.com/classes/stained-glass-studio-series',
  imageLink: 'https://example.com/image.jpg',
  priceCents: 18000,
  currency: 'USD',
  available: true,
  brand: 'Maple & Spruce',
  availabilityPostalCodes: '26508',
};

describe('escapeXml', () => {
  it('escapes the five XML metacharacters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f'
    );
  });

  it('passes plain text through unchanged', () => {
    expect(escapeXml('plain text 123')).toBe('plain text 123');
  });
});

describe('stripHtml', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello   <strong>world</strong></p>')).toBe(
      'Hello world'
    );
  });

  it('decodes common entities so they do not double-escape', () => {
    expect(stripHtml('Mary &amp; Sue&nbsp;hike')).toBe('Mary & Sue hike');
  });

  it('returns empty string for tag-only input', () => {
    expect(stripHtml('<br/><br/>')).toBe('');
  });
});

describe('formatPrice', () => {
  it('formats whole-dollar prices with two decimals', () => {
    expect(formatPrice(4500, 'USD')).toBe('45.00 USD');
  });

  it('formats sub-dollar prices', () => {
    expect(formatPrice(99, 'USD')).toBe('0.99 USD');
  });

  it('uses the requested currency code', () => {
    expect(formatPrice(1000, 'CAD')).toBe('10.00 CAD');
  });
});

describe('buildClassCatalogFeed', () => {
  it('emits a well-formed RSS 2.0 envelope with the google namespace', () => {
    const xml = buildClassCatalogFeed(channel, [baseItem]);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">'
    );
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml.trim().endsWith('</rss>')).toBe(true);
  });

  it('emits all required Meta + Google fields per item', () => {
    const xml = buildClassCatalogFeed(channel, [baseItem]);

    expect(xml).toContain('<g:id>class-1</g:id>');
    expect(xml).toContain('<g:title>Stained Glass Studio Series</g:title>');
    expect(xml).toContain('<g:description>A four-week studio series</g:description>');
    expect(xml).toContain(
      '<g:link>https://mapleandsprucefolkarts.com/classes/stained-glass-studio-series</g:link>'
    );
    expect(xml).toContain('<g:image_link>https://example.com/image.jpg</g:image_link>');
    expect(xml).toContain('<g:availability>in_stock</g:availability>');
    expect(xml).toContain('<g:price>180.00 USD</g:price>');
    expect(xml).toContain('<g:condition>new</g:condition>');
    expect(xml).toContain('<g:brand>Maple &amp; Spruce</g:brand>');
    expect(xml).toContain('<g:identifier_exists>false</g:identifier_exists>');
    expect(xml).toContain(
      '<g:availability_postal_codes>26508</g:availability_postal_codes>'
    );
  });

  it('emits availability_postal_codes for each item (Meta locality requirement)', () => {
    const xml = buildClassCatalogFeed(channel, [
      { ...baseItem, availabilityPostalCodes: '26505,26508' },
    ]);
    expect(xml).toContain(
      '<g:availability_postal_codes>26505,26508</g:availability_postal_codes>'
    );
  });

  it('marks items with no availability as out_of_stock', () => {
    const xml = buildClassCatalogFeed(channel, [
      { ...baseItem, available: false },
    ]);
    expect(xml).toContain('<g:availability>out_of_stock</g:availability>');
  });

  it('escapes XML metacharacters in titles and descriptions', () => {
    const xml = buildClassCatalogFeed(channel, [
      {
        ...baseItem,
        title: 'Knives & Forks <demo>',
        description: '"Quoted" with <em>markup</em> & ampersand',
      },
    ]);

    expect(xml).toContain('<g:title>Knives &amp; Forks</g:title>');
    expect(xml).toContain(
      '<g:description>&quot;Quoted&quot; with markup &amp; ampersand</g:description>'
    );
  });

  it('truncates titles to 150 characters (Google limit)', () => {
    const longTitle = 'A'.repeat(200);
    const xml = buildClassCatalogFeed(channel, [
      { ...baseItem, title: longTitle },
    ]);

    const match = xml.match(/<g:title>(.*?)<\/g:title>/);
    expect(match).not.toBeNull();
    expect(match?.[1].length).toBe(150);
  });

  it('truncates descriptions to 5000 characters', () => {
    const longDescription = 'B'.repeat(6000);
    const xml = buildClassCatalogFeed(channel, [
      { ...baseItem, description: longDescription },
    ]);

    const match = xml.match(/<g:description>(.*?)<\/g:description>/);
    expect(match).not.toBeNull();
    expect(match?.[1].length).toBe(5000);
  });

  it('drops items with no image_link rather than emitting invalid rows', () => {
    const xml = buildClassCatalogFeed(channel, [
      baseItem,
      { ...baseItem, id: 'class-2', imageLink: '' },
    ]);

    expect(xml).toContain('<g:id>class-1</g:id>');
    expect(xml).not.toContain('<g:id>class-2</g:id>');
  });

  it('drops items with no link', () => {
    const xml = buildClassCatalogFeed(channel, [
      { ...baseItem, id: 'class-3', link: '' },
    ]);

    expect(xml).not.toContain('<g:id>class-3</g:id>');
  });

  it('emits an empty channel when no items are valid', () => {
    const xml = buildClassCatalogFeed(channel, []);
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
  });

  it('escapes the channel title containing an ampersand', () => {
    const xml = buildClassCatalogFeed(channel, []);
    expect(xml).toContain('<title>Maple &amp; Spruce Classes</title>');
  });
});
