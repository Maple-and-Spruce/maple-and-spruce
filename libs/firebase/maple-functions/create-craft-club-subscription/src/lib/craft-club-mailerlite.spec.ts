import { describe, expect, it } from 'vitest';
import {
  buildCraftClubMailerLiteSale,
  CRAFT_CLUB_PRODUCT_RESOURCE_ID,
} from './craft-club-mailerlite';

describe('buildCraftClubMailerLiteSale', () => {
  const sale = buildCraftClubMailerLiteSale({
    email: 'olive@example.com',
    squareSubscriptionId: 'sub_123',
    monthlyPriceCents: 3000,
  });

  it('records the first month in dollars against the one membership product', () => {
    expect(sale.product).toMatchObject({
      resourceId: CRAFT_CLUB_PRODUCT_RESOURCE_ID,
      price: 30,
    });
    expect(sale.order).toEqual({
      resourceId: 'craftclub-sub_123',
      customerEmail: 'olive@example.com',
      items: [
        {
          productResourceId: CRAFT_CLUB_PRODUCT_RESOURCE_ID,
          quantity: 1,
          price: 30,
        },
      ],
      totalPrice: 30,
      status: 'complete',
    });
  });

  it('keys the order on the subscription, so a re-subscribe is a new sale', () => {
    const again = buildCraftClubMailerLiteSale({
      email: 'olive@example.com',
      squareSubscriptionId: 'sub_456',
      monthlyPriceCents: 3000,
    });
    expect(again.order.resourceId).not.toBe(sale.order.resourceId);
  });
});
