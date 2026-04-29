/**
 * Pure builder for an RSS 2.0 product-catalog feed compatible with both
 * Meta Commerce Manager and Google Merchant Center.
 *
 * Both ingest the same RSS 2.0 + `xmlns:g="http://base.google.com/ns/1.0"`
 * shape, so a single endpoint serves both. Field choices follow the tighter
 * of the two specs (Google's title 150-char, id 50-char limits) so the
 * output validates against both.
 */

// XML namespace URI required verbatim by both Meta Commerce Manager and
// Google Merchant Center. It is an identifier, not a URL we fetch — the
// `http://` form is what the spec mandates.
// eslint-disable-next-line sonarjs/no-clear-text-protocols
const XMLNS_GOOGLE = 'http://base.google.com/ns/1.0';

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;
const ID_MAX = 50;

export interface CatalogChannel {
  title: string;
  link: string;
  description: string;
}

export interface CatalogFeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  priceCents: number;
  currency: string;
  available: boolean;
  brand: string;
}

/**
 * Escape a value for use as XML text or attribute content.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip HTML tags and collapse whitespace for plain-text feed fields.
 *
 * Class descriptions can contain rich-text markup from the admin editor;
 * Meta and Google both want plain text in `<g:description>`. We strip tags,
 * decode the handful of entities we typically emit, and collapse whitespace.
 */
export function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Format a price in the `"19.99 USD"` shape required by both platforms.
 * Both reject `$` prefixes and integer-cent values.
 */
export function formatPrice(priceCents: number, currency: string): string {
  const amount = (priceCents / 100).toFixed(2);
  return `${amount} ${currency}`;
}

function renderItem(item: CatalogFeedItem): string {
  const id = truncate(item.id, ID_MAX);
  const title = truncate(stripHtml(item.title), TITLE_MAX);
  const description = truncate(stripHtml(item.description), DESCRIPTION_MAX);
  const availability = item.available ? 'in_stock' : 'out_of_stock';
  const price = formatPrice(item.priceCents, item.currency);

  return [
    '    <item>',
    `      <g:id>${escapeXml(id)}</g:id>`,
    `      <g:title>${escapeXml(title)}</g:title>`,
    `      <g:description>${escapeXml(description)}</g:description>`,
    `      <g:link>${escapeXml(item.link)}</g:link>`,
    `      <g:image_link>${escapeXml(item.imageLink)}</g:image_link>`,
    `      <g:availability>${availability}</g:availability>`,
    `      <g:price>${escapeXml(price)}</g:price>`,
    '      <g:condition>new</g:condition>',
    `      <g:brand>${escapeXml(item.brand)}</g:brand>`,
    '      <g:identifier_exists>false</g:identifier_exists>',
    '    </item>',
  ].join('\n');
}

/**
 * Build the full RSS 2.0 XML document. Items without an `imageLink` are
 * omitted — both platforms reject items with no image, so silently dropping
 * them is preferable to shipping invalid rows that fail catalog ingestion.
 */
export function buildClassCatalogFeed(
  channel: CatalogChannel,
  items: CatalogFeedItem[]
): string {
  const validItems = items.filter((item) => item.imageLink && item.link);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rss version="2.0" xmlns:g="${XMLNS_GOOGLE}">`,
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    ...validItems.map(renderItem),
    '  </channel>',
    '</rss>',
  ];

  return lines.join('\n');
}
