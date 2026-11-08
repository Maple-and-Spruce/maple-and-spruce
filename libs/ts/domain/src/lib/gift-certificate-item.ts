/**
 * The "Gift certificate" register item (#314).
 *
 * Printed gift certificates are Square gift cards loaded ahead of time. When
 * one is sold at the shop, Katie rings up a hand-made Square catalog item named
 * "Gift certificate" with a variable price. That money is gift card liability,
 * not shop income: it pays no artist and is not a class, a lesson or a product.
 *
 * The item is created in the Square Dashboard, so nothing in Firestore maps to
 * its catalog id. It is recognised by its name instead, and code that pulls
 * Square catalog items or order line items into our records skips it.
 */

/** The exact name of the register item, as it appears in Square. */
export const GIFT_CERTIFICATE_ITEM_NAME = 'Gift certificate';

function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * True when a Square catalog item or order line item is the "Gift certificate"
 * register item. Case and surrounding/repeated whitespace are ignored, so
 * "Gift Certificate" also matches; any other name (e.g. "Gift certificate
 * holder") does not.
 */
export function isGiftCertificateItemName(
  name: string | null | undefined
): boolean {
  if (!name) return false;
  return (
    normalizeItemName(name) === normalizeItemName(GIFT_CERTIFICATE_ITEM_NAME)
  );
}

/** True when an order line item is a sale of the "Gift certificate" item. */
export function isGiftCertificateLineItem(lineItem: {
  name?: string | null;
}): boolean {
  return isGiftCertificateItemName(lineItem.name);
}
