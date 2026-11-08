/**
 * Printed gift certificates (#314).
 *
 * Katie prints a batch of certificates from the admin Gift Cards page. Each
 * one is a real Square gift card, made and loaded when the batch is printed,
 * so it is spendable from the moment it comes off the printer. When she sells
 * one, she rings up the "Gift certificate" item at the register with the
 * amount and no tax (see `gift-certificate-item.ts`); nothing happens here.
 *
 * Shared by the route, its validation suite, the dialog and the print view.
 */

/** Most certificates in one batch. */
export const GIFT_CERTIFICATE_BATCH_MAX = 50;

/**
 * The certificate designs the print view can draw. The artwork and copy for
 * each live with the print view in the admin app; the server only checks the
 * id, so a batch always names a design the app knows.
 */
export const GIFT_CERTIFICATE_DESIGN_IDS = ['stained-glass'] as const;

export type GiftCertificateDesignId = (typeof GIFT_CERTIFICATE_DESIGN_IDS)[number];

export function isGiftCertificateDesignId(
  value: unknown
): value is GiftCertificateDesignId {
  return (
    typeof value === 'string' &&
    (GIFT_CERTIFICATE_DESIGN_IDS as readonly string[]).includes(value)
  );
}

/** Whether a batch size is allowed: a whole number from 1 to 50. */
export function isAllowedCertificateQuantity(quantity: unknown): boolean {
  return (
    typeof quantity === 'number' &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= GIFT_CERTIFICATE_BATCH_MAX
  );
}

/** Where the QR code on every certificate points. */
export const GIFT_CERTIFICATE_CLASSES_URL =
  'https://mapleandsprucefolkarts.com/upcoming-classes';
