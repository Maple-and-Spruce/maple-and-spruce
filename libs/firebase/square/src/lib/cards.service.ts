/**
 * Square Cards API service
 *
 * Stores a card on file for a customer from a Web Payments SDK nonce. The
 * resulting `cardId` is what recurring subscriptions charge against (a nonce
 * is single-use, so subscriptions cannot use it directly).
 *
 * @see https://developer.squareup.com/docs/cards-api/overview
 */
import { SquareClient, Square } from 'square';

export interface CreateCardOnFileInput {
  /** Single-use nonce from the Web Payments SDK `card.tokenize()`. */
  sourceId: string;
  /** Square customer the card is filed under. */
  customerId: string;
  /** Cardholder name for display (optional). */
  cardholderName?: string;
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
    const response = await this.client.cards.create({
      idempotencyKey: input.idempotencyKey,
      sourceId: input.sourceId,
      card: {
        customerId: input.customerId,
        cardholderName: input.cardholderName,
      },
    });

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
}

function throwIfErrors(
  errors: Square.Error_[] | undefined,
  operation: string
): void {
  if (!errors || errors.length === 0) return;
  const msg = errors
    .map((e) => e.detail || e.code || 'Unknown error')
    .join('; ');
  throw new Error(`Square ${operation} error: ${msg}`);
}
