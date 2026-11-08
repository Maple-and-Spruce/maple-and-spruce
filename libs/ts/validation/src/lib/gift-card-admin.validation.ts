/**
 * Validation for the admin gift card actions (#310): giving a free card and
 * marking a register card as a class certificate.
 *
 * Run in the admin dialogs and again in the routes, before any Square call or
 * Firestore write.
 *
 * @see https://vestjs.dev/
 */
import { test, enforce, only, skipWhen } from 'vest';
import {
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  GIFT_CARD_NAME_MAX_LENGTH,
  ISSUED_GIFT_CARD_MAX_CENTS,
  ISSUED_GIFT_CARD_MIN_CENTS,
  ISSUED_GIFT_CARD_REASON_MAX_LENGTH,
  ISSUED_GIFT_CARD_REASON_MIN_LENGTH,
  customGiftCardCodeProblem,
  isAllowedIssuedGiftCardAmount,
} from '@maple/ts/domain';
import { staticSuite } from './static-suite';

/** The To / From / message fields both actions share. */
interface CertificateTextInput {
  recipientName?: string;
  fromName?: string;
  message?: string;
}

export interface IssueGiftCardValidationInput extends CertificateTextInput {
  kind?: string;
  amountCents?: unknown;
  classCategoryId?: string;
  valueCents?: unknown;
  reason?: string;
  code?: string;
  idempotencyKey?: string;
}

export interface MarkClassCertificateValidationInput extends CertificateTextInput {
  giftCardId?: string;
  classCategoryId?: string;
}

/** A dialog-made key: letters, digits and dashes, 8 to 64 long. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

const AMOUNT_MESSAGE = `Enter whole dollars from $${ISSUED_GIFT_CARD_MIN_CENTS / 100} to $${ISSUED_GIFT_CARD_MAX_CENTS / 100}`;

function certificateTextTests(data: CertificateTextInput): void {
  test(
    'recipientName',
    `Keep the name to ${GIFT_CARD_NAME_MAX_LENGTH} characters`,
    () => {
      enforce(data.recipientName ?? '').shorterThanOrEquals(GIFT_CARD_NAME_MAX_LENGTH);
    }
  );

  test('fromName', `Keep the name to ${GIFT_CARD_NAME_MAX_LENGTH} characters`, () => {
    enforce(data.fromName ?? '').shorterThanOrEquals(GIFT_CARD_NAME_MAX_LENGTH);
  });

  test(
    'message',
    `Keep the note to ${GIFT_CARD_MESSAGE_MAX_LENGTH} characters`,
    () => {
      enforce(data.message ?? '').shorterThanOrEquals(GIFT_CARD_MESSAGE_MAX_LENGTH);
    }
  );
}

export const issueGiftCardValidation = staticSuite(
  (data: IssueGiftCardValidationInput, field?: string | string[]) => {
    only(field);

    test('kind', 'Choose an amount or a class type', () => {
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
      test('valueCents', AMOUNT_MESSAGE, () => {
        enforce(isAllowedIssuedGiftCardAmount(data.valueCents)).isTruthy();
      });
    });

    skipWhen(!data.code?.trim(), () => {
      test('code', customGiftCardCodeProblem(data.code ?? '') ?? 'Check the code', () => {
        enforce(customGiftCardCodeProblem(data.code ?? '')).isUndefined();
      });
    });

    test('reason', 'Say why the studio is giving this card', () => {
      enforce(data.reason).isNotBlank();
    });

    test(
      'reason',
      `Use at least ${ISSUED_GIFT_CARD_REASON_MIN_LENGTH} characters`,
      () => {
        enforce((data.reason ?? '').trim()).longerThanOrEquals(
          ISSUED_GIFT_CARD_REASON_MIN_LENGTH
        );
      }
    );

    test(
      'reason',
      `Keep the reason to ${ISSUED_GIFT_CARD_REASON_MAX_LENGTH} characters`,
      () => {
        enforce((data.reason ?? '').trim()).shorterThanOrEquals(
          ISSUED_GIFT_CARD_REASON_MAX_LENGTH
        );
      }
    );

    certificateTextTests(data);

    test('idempotencyKey', 'Close this and open it again, then try again', () => {
      enforce(data.idempotencyKey ?? '').matches(IDEMPOTENCY_KEY_RE);
    });
  }
);

export const markClassCertificateValidation = staticSuite(
  (data: MarkClassCertificateValidationInput, field?: string | string[]) => {
    only(field);

    test('giftCardId', 'Gift card id is required', () => {
      enforce(data.giftCardId).isNotBlank();
    });

    test('classCategoryId', 'Choose a class type', () => {
      enforce(data.classCategoryId).isNotBlank();
    });

    certificateTextTests(data);
  }
);
