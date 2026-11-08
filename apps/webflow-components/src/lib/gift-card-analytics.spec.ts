import { describe, it, expect, vi } from 'vitest';
import { MAPLE_SPRUCE_PIXEL_ID } from './meta-pixels';
import { trackAddGiftCardToCart, trackPurchaseGiftCard } from './gift-card-analytics';

describe('gift card analytics', () => {
  it('fires a Purchase named "Gift card" to the Maple & Spruce pixel and GA4', () => {
    const win = { fbq: vi.fn(), dataLayer: [] as Record<string, unknown>[] };

    trackPurchaseGiftCard(win, { valueCents: 5000, transactionId: 'gftc:abc' });

    expect(win.fbq).toHaveBeenCalledWith(
      'trackSingle',
      MAPLE_SPRUCE_PIXEL_ID,
      'Purchase',
      expect.objectContaining({ content_ids: ['gift-card'], content_name: 'Gift card', value: 50 }),
      { eventID: 'gftc:abc' }
    );
    expect(win.dataLayer[0]).toMatchObject({
      event: 'purchase',
      ecommerce: {
        value: 50,
        transaction_id: 'gftc:abc',
        items: [{ item_id: 'gift-card', item_name: 'Gift card', quantity: 1 }],
      },
    });
  });

  it('fires add_to_cart for a known amount only', () => {
    const win = { dataLayer: [] as Record<string, unknown>[] };
    trackAddGiftCardToCart(win, { valueCents: Number.NaN });
    expect(win.dataLayer).toHaveLength(0);
    trackAddGiftCardToCart(win, { valueCents: 2500 });
    expect(win.dataLayer[0]).toMatchObject({ event: 'add_to_cart', ecommerce: { value: 25 } });
  });
});
