/**
 * Gift card purchase validation suite (#300).
 *
 * Runs on the buy page and again in `giftCards/purchaseGiftCard`, before any
 * Square call, so a bad request never reaches the card.
 *
 * @see https://vestjs.dev/
 */
import { test, enforce, only, skipWhen } from 'vest';
import {
  GIFT_CARD_MAX_CENTS,
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  GIFT_CARD_MIN_CENTS,
  isAllowedGiftCardAmount,
} from '@maple/ts/domain';
import { staticSuite } from './static-suite';

export interface GiftCardPurchaseValidationInput {
  kind?: string;
  amountCents?: unknown;
  classId?: string;
  buyerName?: string;
  buyerEmail?: string;
  recipientName?: string;
  recipientEmail?: string;
  message?: string;
  deliverTo?: string;
  sourceId?: string;
  idempotencyKey?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A browser-made key: letters, digits and dashes, 8 to 64 long. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

export const giftCardPurchaseValidation = staticSuite(
  (data: GiftCardPurchaseValidationInput, field?: string | string[]) => {
    only(field);

    test('kind', 'Choose an amount or a class', () => {
      enforce(data.kind).inside(['amount', 'class']);
    });

    skipWhen(data.kind !== 'amount', () => {
      test(
        'amountCents',
        `Choose a whole-dollar amount from $${GIFT_CARD_MIN_CENTS / 100} to $${GIFT_CARD_MAX_CENTS / 100}`,
        () => {
          enforce(isAllowedGiftCardAmount(data.amountCents)).isTruthy();
        }
      );
    });

    skipWhen(data.kind !== 'class', () => {
      test('classId', 'Choose a class', () => {
        enforce(data.classId).isNotBlank();
      });
    });

    test('buyerName', 'Your name is required', () => {
      enforce(data.buyerName).isNotBlank();
    });

    test('buyerName', 'Your name must be 100 characters or fewer', () => {
      enforce(data.buyerName ?? '').shorterThanOrEquals(100);
    });

    test('buyerEmail', 'Your email is required', () => {
      enforce(data.buyerEmail).isNotBlank();
    });

    test('buyerEmail', 'Enter a valid email address', () => {
      if (data.buyerEmail) enforce(data.buyerEmail.trim()).matches(EMAIL_RE);
    });

    test('recipientName', 'Their name must be 100 characters or fewer', () => {
      enforce(data.recipientName ?? '').shorterThanOrEquals(100);
    });

    test('deliverTo', 'Choose who we send it to', () => {
      enforce(data.deliverTo).inside(['recipient', 'buyer']);
    });

    skipWhen(data.deliverTo !== 'recipient', () => {
      test('recipientEmail', 'Their email is required to send it to them', () => {
        enforce(data.recipientEmail).isNotBlank();
      });
    });

    test('recipientEmail', 'Enter a valid email address', () => {
      if (data.recipientEmail) {
        enforce(data.recipientEmail.trim()).matches(EMAIL_RE);
      }
    });

    test(
      'message',
      `Keep the message to ${GIFT_CARD_MESSAGE_MAX_LENGTH} characters`,
      () => {
        enforce(data.message ?? '').shorterThanOrEquals(GIFT_CARD_MESSAGE_MAX_LENGTH);
      }
    );

    test('sourceId', 'Card details are required', () => {
      enforce(data.sourceId).isNotBlank();
    });

    test('idempotencyKey', 'Please refresh the page and try again', () => {
      enforce(data.idempotencyKey ?? '').matches(IDEMPOTENCY_KEY_RE);
    });
  }
);
