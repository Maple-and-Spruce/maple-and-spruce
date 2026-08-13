import { describe, expect, it, vi } from 'vitest';
import {
  buildAddToCartDataLayerEvent,
  buildAddToCartPixelEvent,
  buildPurchaseDataLayerEvent,
  buildPurchasePixelEvent,
  buildViewContentPixelEvent,
  buildViewItemDataLayerEvent,
  trackAddClassToCart,
  trackPurchaseClass,
  trackViewClass,
} from './class-analytics';
import {
  MAPLE_SPRUCE_PIXEL_ID,
  MUSIC_TOGETHER_PIXEL_ID,
} from './meta-pixels';

const CLASS_ID = 'cls_abc123';
const CLASS_NAME = 'Beginner Pottery';

describe('Meta Pixel event builders', () => {
  it('ViewContent carries the catalog id, type, value, and currency', () => {
    const event = buildViewContentPixelEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
    });

    expect(event.name).toBe('ViewContent');
    expect(event.params).toMatchObject({
      content_ids: [CLASS_ID],
      content_type: 'product',
      content_name: CLASS_NAME,
      value: 45,
      currency: 'USD',
    });
  });

  it('AddToCart multiplies value by quantity and sets num_items', () => {
    const event = buildAddToCartPixelEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
      quantity: 3,
    });

    expect(event.name).toBe('AddToCart');
    expect(event.params).toMatchObject({
      content_ids: [CLASS_ID],
      content_type: 'product',
      value: 135,
      currency: 'USD',
      num_items: 3,
    });
  });

  it('Purchase uses the actual amount paid (post-discount), not list price', () => {
    const event = buildPurchasePixelEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      pricePaidCents: 8000, // 2 × $45 = $90 list, $80 after discount
      quantity: 2,
      confirmationNumber: 'REG-001',
    });

    expect(event.name).toBe('Purchase');
    expect(event.params).toMatchObject({
      content_ids: [CLASS_ID],
      content_type: 'product',
      value: 80,
      currency: 'USD',
      num_items: 2,
    });
  });

  it('Purchase carries the confirmation number as the dedup eventID', () => {
    const event = buildPurchasePixelEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      pricePaidCents: 4500,
      quantity: 1,
      confirmationNumber: 'MS-AB12CD',
    });

    // Must equal the server CAPI event's `event_id` so Meta dedups the two.
    expect(event.eventID).toBe('MS-AB12CD');
  });
});

describe('GA4 dataLayer event builders', () => {
  it('view_item populates ecommerce.items with the class id and unit price', () => {
    const event = buildViewItemDataLayerEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
    });

    expect(event.event).toBe('view_item');
    expect(event.ecommerce).toMatchObject({
      currency: 'USD',
      value: 45,
      items: [
        { item_id: CLASS_ID, item_name: CLASS_NAME, price: 45, quantity: 1 },
      ],
    });
  });

  it('add_to_cart uses unit price per item with quantity', () => {
    const event = buildAddToCartDataLayerEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
      quantity: 2,
    });

    expect(event.event).toBe('add_to_cart');
    expect(event.ecommerce).toMatchObject({
      currency: 'USD',
      value: 90,
      items: [
        { item_id: CLASS_ID, item_name: CLASS_NAME, price: 45, quantity: 2 },
      ],
    });
  });

  it('purchase derives unit price from pricePaid / quantity and includes transaction_id', () => {
    const event = buildPurchaseDataLayerEvent({
      classId: CLASS_ID,
      className: CLASS_NAME,
      pricePaidCents: 8000,
      quantity: 2,
      confirmationNumber: 'REG-001',
    });

    expect(event.event).toBe('purchase');
    expect(event.ecommerce).toMatchObject({
      currency: 'USD',
      value: 80,
      transaction_id: 'REG-001',
      items: [
        { item_id: CLASS_ID, item_name: CLASS_NAME, price: 40, quantity: 2 },
      ],
    });
  });
});

/**
 * The site runs two Meta pixels: Maple & Spruce (site-wide via GTM) and Music
 * Together (on `/music-together*`, a separate ad account). A bare
 * `fbq('track', …)` broadcasts to EVERY initialized pixel, so one un-scoped
 * call here would file craft-class purchases into the Music Together dataset
 * and train that ad account on the wrong conversions.
 */
describe('pixel isolation', () => {
  const cases: Array<[string, (win: unknown) => void]> = [
    [
      'ViewContent',
      (win) =>
        trackViewClass(win, {
          classId: CLASS_ID,
          className: CLASS_NAME,
          priceCents: 4500,
        }),
    ],
    [
      'AddToCart',
      (win) =>
        trackAddClassToCart(win, {
          classId: CLASS_ID,
          className: CLASS_NAME,
          priceCents: 4500,
          quantity: 2,
        }),
    ],
    [
      'Purchase',
      (win) =>
        trackPurchaseClass(win, {
          classId: CLASS_ID,
          className: CLASS_NAME,
          pricePaidCents: 9000,
          quantity: 2,
          confirmationNumber: 'MS-ISO001',
        }),
    ],
  ];

  it.each(cases)('%s is scoped to the Maple & Spruce pixel', (name, track) => {
    const fbq = vi.fn();
    track({ fbq, dataLayer: [] });

    const calls = fbq.mock.calls.filter(
      (c) => c[0] === 'trackSingle' && c[2] === name
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(MAPLE_SPRUCE_PIXEL_ID);

    // No un-scoped track() anywhere — that would also hit the MT pixel.
    expect(fbq.mock.calls.some((c) => c[0] === 'track')).toBe(false);
    // And the Music Together pixel is never addressed from this module.
    expect(
      fbq.mock.calls.some((c) => c[1] === MUSIC_TOGETHER_PIXEL_ID)
    ).toBe(false);
  });

  it('never initializes a pixel — GTM owns the Maple & Spruce base code', () => {
    const fbq = vi.fn();
    trackViewClass(
      { fbq, dataLayer: [] },
      { classId: CLASS_ID, className: CLASS_NAME, priceCents: 4500 }
    );
    // Re-initializing would clobber the advanced-matching config GTM applies.
    expect(fbq.mock.calls.some((c) => c[0] === 'init')).toBe(false);
  });
});

describe('trackers fire pixel + dataLayer side effects', () => {
  it('trackViewClass calls fbq and pushes to dataLayer', () => {
    const fbq = vi.fn();
    const win: { fbq: typeof fbq; dataLayer?: Record<string, unknown>[] } = {
      fbq,
    };

    trackViewClass(win, {
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
    });

    expect(fbq).toHaveBeenCalledWith(
      'trackSingle',
      MAPLE_SPRUCE_PIXEL_ID,
      'ViewContent',
      {
        content_ids: [CLASS_ID],
        content_type: 'product',
        content_name: CLASS_NAME,
        value: 45,
        currency: 'USD',
      }
    );
    expect(win.dataLayer).toHaveLength(1);
    expect(win.dataLayer?.[0]).toMatchObject({ event: 'view_item' });
  });

  it('trackPurchaseClass passes the dedup eventID as the fbq options arg', () => {
    const fbq = vi.fn();
    const win: { fbq: typeof fbq; dataLayer?: Record<string, unknown>[] } = {
      fbq,
    };

    trackPurchaseClass(win, {
      classId: CLASS_ID,
      className: CLASS_NAME,
      pricePaidCents: 8000,
      quantity: 2,
      confirmationNumber: 'MS-ZZ99YY',
    });

    expect(fbq).toHaveBeenCalledWith(
      'trackSingle',
      MAPLE_SPRUCE_PIXEL_ID,
      'Purchase',
      expect.objectContaining({ content_ids: [CLASS_ID], value: 80 }),
      { eventID: 'MS-ZZ99YY' }
    );
  });

  it('trackAddClassToCart appends to an existing dataLayer queue', () => {
    const fbq = vi.fn();
    const existing = [{ event: 'pageview' }];
    const win = { fbq, dataLayer: existing };

    trackAddClassToCart(win, {
      classId: CLASS_ID,
      className: CLASS_NAME,
      priceCents: 4500,
      quantity: 1,
    });

    expect(win.dataLayer).toHaveLength(2);
    expect(win.dataLayer[1]).toMatchObject({ event: 'add_to_cart' });
  });

  it('trackPurchaseClass works when fbq is not yet installed (dataLayer only)', () => {
    const win: { dataLayer?: Record<string, unknown>[] } = {};

    trackPurchaseClass(win, {
      classId: CLASS_ID,
      className: CLASS_NAME,
      pricePaidCents: 4500,
      quantity: 1,
      confirmationNumber: 'REG-002',
    });

    expect(win.dataLayer).toHaveLength(1);
    expect(win.dataLayer?.[0]).toMatchObject({
      event: 'purchase',
      ecommerce: { transaction_id: 'REG-002' },
    });
  });

  it('all trackers are no-ops when window is null (SSR-safe)', () => {
    expect(() =>
      trackViewClass(null, {
        classId: CLASS_ID,
        className: CLASS_NAME,
        priceCents: 4500,
      })
    ).not.toThrow();
    expect(() =>
      trackAddClassToCart(null, {
        classId: CLASS_ID,
        className: CLASS_NAME,
        priceCents: 4500,
        quantity: 1,
      })
    ).not.toThrow();
    expect(() =>
      trackPurchaseClass(null, {
        classId: CLASS_ID,
        className: CLASS_NAME,
        pricePaidCents: 4500,
        quantity: 1,
        confirmationNumber: 'REG-003',
      })
    ).not.toThrow();
  });
});

describe('Catalog match contract', () => {
  it('Pixel event content_ids matches the field used by mapClassToFeedItem', () => {
    // The class catalog feed (libs/firebase/maple-functions/class-catalog-feed/
    // src/lib/class-catalog-feed.ts) sets `id: classEntity.id` on each feed
    // item. Meta matches catalog items by comparing this id to the
    // `content_ids` in pixel events. Both must be the Firestore class doc id.
    const firestoreClassDocId = 'cls_xyz789';

    const view = buildViewContentPixelEvent({
      classId: firestoreClassDocId,
      className: CLASS_NAME,
      priceCents: 4500,
    });
    const cart = buildAddToCartPixelEvent({
      classId: firestoreClassDocId,
      className: CLASS_NAME,
      priceCents: 4500,
      quantity: 1,
    });
    const purchase = buildPurchasePixelEvent({
      classId: firestoreClassDocId,
      className: CLASS_NAME,
      pricePaidCents: 4500,
      quantity: 1,
      confirmationNumber: 'REG-004',
    });

    for (const event of [view, cart, purchase]) {
      expect(event.params['content_ids']).toEqual([firestoreClassDocId]);
      expect(event.params['content_type']).toBe('product');
    }
  });
});
