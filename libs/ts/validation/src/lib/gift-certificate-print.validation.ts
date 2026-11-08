/**
 * Validation for printing a batch of gift certificates (#314).
 *
 * Run in the admin dialog and again in the route, before any Square call or
 * Firestore write. Whether a class type has certificates switched on is
 * checked by the route, which reads the type.
 *
 * @see https://vestjs.dev/
 */
import { test, enforce, only, skipWhen } from 'vest';
import {
  GIFT_CERTIFICATE_BATCH_MAX,
  ISSUED_GIFT_CARD_MAX_CENTS,
  ISSUED_GIFT_CARD_MIN_CENTS,
  isAllowedCertificateQuantity,
  isAllowedIssuedGiftCardAmount,
  isGiftCertificateDesignId,
} from '@maple/ts/domain';
import { staticSuite } from './static-suite';

export interface PrintGiftCertificatesValidationInput {
  kind?: string;
  amountCents?: unknown;
  classCategoryId?: string;
  quantity?: unknown;
  design?: unknown;
  idempotencyKey?: string;
}

/** A dialog-made key: letters, digits and dashes, 8 to 64 long. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

const AMOUNT_MESSAGE = `Enter whole dollars from $${ISSUED_GIFT_CARD_MIN_CENTS / 100} to $${ISSUED_GIFT_CARD_MAX_CENTS / 100}`;

export const printGiftCertificatesValidation = staticSuite(
  (data: PrintGiftCertificatesValidationInput, field?: string | string[]) => {
    only(field);

    test('kind', 'Choose a dollar amount or a class type', () => {
      enforce(data.kind).inside(['amount', 'class']);
    });

    skipWhen(data.kind !== 'amount', () => {
      test('amountCents', AMOUNT_MESSAGE, () => {
        enforce(isAllowedIssuedGiftCardAmount(data.amountCents)).isTruthy();
      });
    });

    skipWhen(data.kind !== 'class', () => {
      test('classCategoryId', 'Choose a class type', () => {
        enforce(data.classCategoryId).isNotBlank();
      });
    });

    test('quantity', `Print from 1 to ${GIFT_CERTIFICATE_BATCH_MAX} at a time`, () => {
      enforce(isAllowedCertificateQuantity(data.quantity)).isTruthy();
    });

    test('design', 'Choose a design', () => {
      enforce(isGiftCertificateDesignId(data.design)).isTruthy();
    });

    test('idempotencyKey', 'Close this and open it again, then try again', () => {
      enforce(data.idempotencyKey ?? '').matches(IDEMPOTENCY_KEY_RE);
    });
  }
);
