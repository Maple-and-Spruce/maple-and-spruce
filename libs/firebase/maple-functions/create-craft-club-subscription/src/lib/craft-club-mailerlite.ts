import type {
  MailerLiteOrder,
  MailerLiteProduct,
} from '@maple/firebase/mailerlite';

/** The one MailerLite product every Craft Club order points at. */
export const CRAFT_CLUB_PRODUCT_RESOURCE_ID = 'craft-club-membership';

/**
 * The MailerLite product and order for a new Craft Club membership.
 *
 * Keyed on the Square subscription, so a retry updates the same order and a
 * member who cancels and later re-subscribes (a new subscription) counts as a
 * new sale. Valued at the first month only.
 */
export function buildCraftClubMailerLiteSale(input: {
  email: string;
  squareSubscriptionId: string;
  monthlyPriceCents: number;
}): { product: MailerLiteProduct; order: MailerLiteOrder } {
  const price = Math.round(input.monthlyPriceCents) / 100;
  return {
    product: {
      resourceId: CRAFT_CLUB_PRODUCT_RESOURCE_ID,
      name: 'Craft Club membership (first month)',
      price,
      url: 'https://mapleandsprucefolkarts.com/craft-club',
    },
    order: {
      resourceId: `craftclub-${input.squareSubscriptionId}`,
      customerEmail: input.email,
      items: [
        {
          productResourceId: CRAFT_CLUB_PRODUCT_RESOURCE_ID,
          quantity: 1,
          price,
        },
      ],
      totalPrice: price,
      status: 'complete',
    },
  };
}
