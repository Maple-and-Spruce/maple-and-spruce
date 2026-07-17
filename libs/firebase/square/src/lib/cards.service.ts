/**
 * Square Cards API service
 *
 * Stores a card on file for a customer from a Web Payments SDK nonce. The
 * resulting `cardId` is what recurring subscriptions charge against (a nonce
 * is single-use, so subscriptions cannot use it directly).
 *
 * @see https://developer.squareup.com/docs/cards-api/overview
 */
import { SquareClient, Square, SquareError } from 'square';
import { PaymentError, getPaymentErrorMessage } from './payments.service';

export interface CreateCardOnFileInput {
  /** Single-use nonce from the Web Payments SDK `card.tokenize()`. */
  sourceId: string;
  /** Square customer the card is filed under. */
  customerId: string;
  /** Cardholder name for display (optional). */
  cardholderName?: string;
  /**
   * SCA verification token from the Web Payments SDK
   * `verifyBuyer({ intent: 'STORE' })`. Real Square REQUIRES this to vault a
   * card on file — omitting it makes `cards.create` fail (the sandbox mock is
   * lenient, real Square is not). Always thread it through from the client.
   */
  verificationToken?: string;
  /** Idempotency key — repeated calls with the same key are de-duped. */
  idempotencyKey: string;
}

export interface CreateCardOnFileResult {
  cardId: string;
  last4?: string;
  cardBrand?: string;
}

export class CardsService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Convert a single-use payment nonce into a durable card on file under the
   * given customer, returning the `cardId` for subscription billing.
   */
  async createCardOnFile(
    input: CreateCardOnFileInput
  ): Promise<CreateCardOnFileResult> {
    let response;
    try {
      response = await this.client.cards.create({
        idempotencyKey: input.idempotencyKey,
        sourceId: input.sourceId,
        verificationToken: input.verificationToken,
        card: {
          customerId: input.customerId,
          cardholderName: input.cardholderName,
        },
      });
    } catch (error) {
      // The SDK throws SquareError on HTTP-level failures (4xx/5xx) — the
      // real-Square vault-rejection path. Preserve the Square error code +
      // detail as a PaymentError so callers surface it (a raw throw here
      // was previously swallowed into a generic "Unable to process payment"
      // with no squareErrorCode, hiding why real Square rejected the vault).
      throw toCardPaymentError(error);
    }

    throwIfErrors(response.errors, 'create card');

    const card = response.card;
    if (!card?.id) {
      throw new Error('Square card create returned no id');
    }

    return {
      cardId: card.id,
      last4: card.last4,
      cardBrand: card.cardBrand as string | undefined,
    };
  }

  /**
   * Disable a card on file so it can never be charged again. Used when a
   * customer replaces the card behind a card-on-file agreement — the old card
   * is detached so only the new one remains chargeable. Disabling an already
   * disabled (or unknown) card is a no-op on Square's side; we surface errors
   * so callers can decide whether to treat them as fatal.
   */
  async disableCard(cardId: string): Promise<void> {
    const response = await this.client.cards.disable({ cardId });
    throwIfErrors(response.errors, 'disable card');
  }
}

function throwIfErrors(
  errors: Square.Error_[] | undefined,
  operation: string
): void {
  if (!errors || errors.length === 0) return;
  // 200-with-errors path (rare). Preserve the Square code so callers can
  // discriminate; the message carries Square's detail for logs + customers.
  const detail = errors
    .map((e) => e.detail || e.code || 'Unknown error')
    .join('; ');
  throw new PaymentError(
    `Square ${operation} error: ${detail}`,
    errors[0]?.code
  );
}

/**
 * Map a thrown Cards-API error into a PaymentError that keeps Square's error
 * code and a customer-facing message. SquareError (HTTP failures) carries the
 * `errors[]` array; anything else falls back to a generic vault message.
 */
function toCardPaymentError(error: unknown): PaymentError {
  if (error instanceof SquareError) {
    const squareErrors = error.errors ?? [];
    const message =
      squareErrors.length > 0
        ? getPaymentErrorMessage(squareErrors)
        : error.message ||
          'Unable to store your card. Please try a different card.';
    return new PaymentError(message, squareErrors[0]?.code);
  }
  if (error instanceof PaymentError) {
    return error;
  }
  const message =
    error instanceof Error
      ? error.message
      : 'Unable to store your card. Please try a different card.';
  return new PaymentError(message);
}
