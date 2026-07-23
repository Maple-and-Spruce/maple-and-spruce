/**
 * Class registration analytics events.
 *
 * Emits Meta Pixel + GA4 dataLayer events for the standard e-commerce funnel
 * (view → add_to_cart → purchase) so Meta can attribute conversions to items
 * in the class catalog feed (`/catalog/classes.xml`).
 *
 * Catalog match contract: every Meta event includes
 *   `content_ids: [classId]` and `content_type: 'product'`
 * where `classId` is the Firestore class document ID — the same value used
 * as the `id` field in `mapClassToFeedItem` (libs/firebase/maple-functions/
 * class-catalog-feed). If those drift apart, catalog match rate drops to 0%
 * and Advantage+ catalog ads stop targeting these items.
 */

const CURRENCY = 'USD';

export interface ViewClassInput {
  classId: string;
  className: string;
  priceCents: number;
}

export interface AddClassToCartInput {
  classId: string;
  className: string;
  priceCents: number;
  quantity: number;
}

export interface PurchaseClassInput {
  classId: string;
  className: string;
  pricePaidCents: number;
  quantity: number;
  confirmationNumber: string;
}

export interface MetaPixelEvent {
  name: 'ViewContent' | 'AddToCart' | 'Purchase';
  params: Record<string, unknown>;
  /**
   * Meta dedup key. When set, passed as `fbq('track', …, { eventID })` so a
   * server-side Conversions API event carrying the same id (see
   * `sendRegistrationConversion`) is counted once, not twice.
   */
  eventID?: string;
}

export interface DataLayerEvent {
  event: 'view_item' | 'add_to_cart' | 'purchase';
  ecommerce: Record<string, unknown>;
}

function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

export function buildViewContentPixelEvent(
  input: ViewClassInput
): MetaPixelEvent {
  return {
    name: 'ViewContent',
    params: {
      content_ids: [input.classId],
      content_type: 'product',
      content_name: input.className,
      value: centsToAmount(input.priceCents),
      currency: CURRENCY,
    },
  };
}

export function buildAddToCartPixelEvent(
  input: AddClassToCartInput
): MetaPixelEvent {
  return {
    name: 'AddToCart',
    params: {
      content_ids: [input.classId],
      content_type: 'product',
      content_name: input.className,
      value: centsToAmount(input.priceCents * input.quantity),
      currency: CURRENCY,
      num_items: input.quantity,
    },
  };
}

export function buildPurchasePixelEvent(
  input: PurchaseClassInput
): MetaPixelEvent {
  return {
    name: 'Purchase',
    // Dedup against the server-side CAPI Purchase, which uses the same
    // confirmation number as its `event_id`.
    eventID: input.confirmationNumber || undefined,
    params: {
      content_ids: [input.classId],
      content_type: 'product',
      content_name: input.className,
      value: centsToAmount(input.pricePaidCents),
      currency: CURRENCY,
      num_items: input.quantity,
    },
  };
}

export function buildViewItemDataLayerEvent(
  input: ViewClassInput
): DataLayerEvent {
  const price = centsToAmount(input.priceCents);
  return {
    event: 'view_item',
    ecommerce: {
      currency: CURRENCY,
      value: price,
      items: [
        {
          item_id: input.classId,
          item_name: input.className,
          price,
          quantity: 1,
        },
      ],
    },
  };
}

export function buildAddToCartDataLayerEvent(
  input: AddClassToCartInput
): DataLayerEvent {
  const price = centsToAmount(input.priceCents);
  return {
    event: 'add_to_cart',
    ecommerce: {
      currency: CURRENCY,
      value: centsToAmount(input.priceCents * input.quantity),
      items: [
        {
          item_id: input.classId,
          item_name: input.className,
          price,
          quantity: input.quantity,
        },
      ],
    },
  };
}

export function buildPurchaseDataLayerEvent(
  input: PurchaseClassInput
): DataLayerEvent {
  const value = centsToAmount(input.pricePaidCents);
  // Per-unit price after discounts; GA4 expects unit price in `items[].price`.
  const unitPrice =
    input.quantity > 0
      ? centsToAmount(input.pricePaidCents / input.quantity)
      : value;
  return {
    event: 'purchase',
    ecommerce: {
      currency: CURRENCY,
      value,
      transaction_id: input.confirmationNumber,
      items: [
        {
          item_id: input.classId,
          item_name: input.className,
          price: unitPrice,
          quantity: input.quantity,
        },
      ],
    },
  };
}

type FbqFn = (...args: unknown[]) => void;

interface AnalyticsWindow {
  fbq?: FbqFn;
  dataLayer?: Record<string, unknown>[];
}

// Trackers accept `unknown` (rather than a structural Window type) so callers
// can pass the real `window` object without fighting third-party global
// augmentations — gtag.js, fbevents, etc. each declare their own shapes for
// `window.fbq` / `window.dataLayer`.
function asAnalyticsWindow(win: unknown): AnalyticsWindow | null {
  if (win === null || typeof win !== 'object') return null;
  return win as AnalyticsWindow;
}

function dispatch(
  win: unknown,
  pixel: MetaPixelEvent,
  dataLayer: DataLayerEvent
): void {
  const w = asAnalyticsWindow(win);
  if (!w) return;
  if (typeof w.fbq === 'function') {
    if (pixel.eventID) {
      w.fbq('track', pixel.name, pixel.params, { eventID: pixel.eventID });
    } else {
      w.fbq('track', pixel.name, pixel.params);
    }
  }
  const layer = w.dataLayer ?? [];
  layer.push(dataLayer as unknown as Record<string, unknown>);
  w.dataLayer = layer;
}

export function trackViewClass(
  win: unknown,
  input: ViewClassInput
): void {
  dispatch(
    win,
    buildViewContentPixelEvent(input),
    buildViewItemDataLayerEvent(input)
  );
}

export function trackAddClassToCart(
  win: unknown,
  input: AddClassToCartInput
): void {
  dispatch(
    win,
    buildAddToCartPixelEvent(input),
    buildAddToCartDataLayerEvent(input)
  );
}

export function trackPurchaseClass(
  win: unknown,
  input: PurchaseClassInput
): void {
  dispatch(
    win,
    buildPurchasePixelEvent(input),
    buildPurchaseDataLayerEvent(input)
  );
}
