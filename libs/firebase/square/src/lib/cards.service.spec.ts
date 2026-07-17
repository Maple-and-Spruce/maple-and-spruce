import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SquareError } from 'square';
import { CardsService } from './cards.service';
import { PaymentError } from './payments.service';

interface MockClient {
  cards: {
    create: ReturnType<typeof vi.fn>;
    disable: ReturnType<typeof vi.fn>;
  };
}

const baseInput = {
  sourceId: 'cnon:card-nonce-ok',
  customerId: 'CUST_1',
  cardholderName: 'Casey Nguyen',
  verificationToken: 'verf:store-token',
  idempotencyKey: 'mtcard-reg-1',
};

describe('CardsService.createCardOnFile', () => {
  let mockClient: MockClient;
  let service: CardsService;

  beforeEach(() => {
    mockClient = {
      cards: { create: vi.fn(), disable: vi.fn() },
    };
    service = new CardsService(mockClient as never);
  });

  it('returns the vaulted card id + last4 on success', async () => {
    mockClient.cards.create.mockResolvedValue({
      card: { id: 'CARD_1', last4: '1111', cardBrand: 'VISA' },
    });

    const result = await service.createCardOnFile(baseInput);

    expect(result).toEqual({
      cardId: 'CARD_1',
      last4: '1111',
      cardBrand: 'VISA',
    });
    // The verification token must be threaded to Square — real Square rejects
    // the vault without it.
    expect(mockClient.cards.create).toHaveBeenCalledWith(
      expect.objectContaining({ verificationToken: 'verf:store-token' })
    );
  });

  it('maps a thrown SquareError to a PaymentError preserving the code + detail', async () => {
    const squareError = new SquareError({ message: 'HTTP 400' });
    Object.defineProperty(squareError, 'errors', {
      value: [
        {
          code: 'VERIFICATION_TOKEN_USED',
          detail: 'The verification token was already used.',
        },
      ],
      writable: true,
    });
    mockClient.cards.create.mockRejectedValue(squareError);

    try {
      await service.createCardOnFile(baseInput);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentError);
      expect((error as PaymentError).squareErrorCode).toBe(
        'VERIFICATION_TOKEN_USED'
      );
      // Detail flows into the message so prod logs show why the vault failed
      // instead of a generic "Unable to process payment".
      expect((error as PaymentError).userMessage).toContain(
        'verification token'
      );
    }
  });

  it('maps a SquareError with no errors array to a PaymentError with a message', async () => {
    mockClient.cards.create.mockRejectedValue(
      new SquareError({ message: 'Internal server error' })
    );

    await expect(service.createCardOnFile(baseInput)).rejects.toBeInstanceOf(
      PaymentError
    );
  });

  it('wraps a generic thrown Error as a PaymentError', async () => {
    mockClient.cards.create.mockRejectedValue(new Error('Network timeout'));

    const err = await service
      .createCardOnFile(baseInput)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).squareErrorCode).toBeUndefined();
  });

  it('throws a PaymentError with the code on a 200-with-errors response', async () => {
    mockClient.cards.create.mockResolvedValue({
      errors: [{ code: 'INVALID_CARD', detail: 'Card is invalid.' }],
    });

    const err = await service
      .createCardOnFile(baseInput)
      .catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).squareErrorCode).toBe('INVALID_CARD');
  });
});
