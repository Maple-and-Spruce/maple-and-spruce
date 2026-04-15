import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SquareError } from 'square';
import {
  getPaymentErrorMessage,
  PaymentError,
  PaymentsService,
} from './payments.service';

describe('getPaymentErrorMessage', () => {
  it('should return user-friendly message for CARD_DECLINED', () => {
    const errors = [{ code: 'CARD_DECLINED', detail: 'Card declined' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card was declined. Please try a different card.'
    );
  });

  it('should return user-friendly message for CVV_FAILURE', () => {
    const errors = [{ code: 'CVV_FAILURE', detail: 'CVV check failed' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The CVV number is incorrect. Please check your card details and try again.'
    );
  });

  it('should return user-friendly message for INSUFFICIENT_FUNDS', () => {
    const errors = [
      { code: 'INSUFFICIENT_FUNDS', detail: 'Insufficient funds' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Insufficient funds. Please try a different payment method.'
    );
  });

  it('should return user-friendly message for INVALID_EXPIRATION', () => {
    const errors = [{ code: 'INVALID_EXPIRATION' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The card expiration date is invalid. Please check your card details.'
    );
  });

  it('should return user-friendly message for ADDRESS_VERIFICATION_FAILURE', () => {
    const errors = [{ code: 'ADDRESS_VERIFICATION_FAILURE' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The billing address does not match the card on file. Please verify your address.'
    );
  });

  it('should return user-friendly message for CARD_EXPIRED', () => {
    const errors = [{ code: 'CARD_EXPIRED' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card has expired. Please use a different card.'
    );
  });

  it('should return user-friendly message for CARD_TOKEN_EXPIRED', () => {
    const errors = [{ code: 'CARD_TOKEN_EXPIRED' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your payment session has expired. Please refresh the page and try again.'
    );
  });

  it('should fall back to Square detail message for unknown error codes', () => {
    const errors = [
      { code: 'SOME_UNKNOWN_CODE', detail: 'Something specific happened' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe('Something specific happened');
  });

  it('should return generic message when no detail and no known code', () => {
    const errors = [{ code: 'SOME_UNKNOWN_CODE' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Unable to process payment. Please try again or use a different card.'
    );
  });

  it('should check all errors in array for known codes', () => {
    const errors = [
      { code: 'SOME_OTHER_ERROR' },
      { code: 'CARD_DECLINED' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card was declined. Please try a different card.'
    );
  });
});

describe('PaymentError', () => {
  it('should store user message and square error code', () => {
    const error = new PaymentError('Your card was declined.', 'CARD_DECLINED');
    expect(error.message).toBe('Your card was declined.');
    expect(error.userMessage).toBe('Your card was declined.');
    expect(error.squareErrorCode).toBe('CARD_DECLINED');
    expect(error.name).toBe('PaymentError');
  });

  it('should be an instance of Error', () => {
    const error = new PaymentError('Test message');
    expect(error).toBeInstanceOf(Error);
  });

  it('works without squareErrorCode', () => {
    const error = new PaymentError('Something failed');
    expect(error.squareErrorCode).toBeUndefined();
  });
});

// ── PaymentsService tests ───────────────────────────────────────────────

function createMockClient() {
  return {
    payments: {
      create: vi.fn(),
      get: vi.fn(),
    },
    refunds: {
      refundPayment: vi.fn(),
    },
  };
}

describe('PaymentsService', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let service: PaymentsService;

  const basePaymentInput = {
    sourceId: 'cnon:card-nonce-123',
    amountCents: 4500,
    idempotencyKey: 'idem-key-001',
    locationId: 'loc-001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PaymentsService(mockClient as any);
  });

  describe('createPayment', () => {
    it('creates a payment and returns the result', async () => {
      mockClient.payments.create.mockResolvedValue({
        payment: {
          id: 'pay-001',
          status: 'COMPLETED',
          receiptUrl: 'https://squareup.com/receipt/123',
          totalMoney: { amount: BigInt(4500), currency: 'USD' },
        },
      });

      const result = await service.createPayment(basePaymentInput);

      expect(result).toEqual({
        paymentId: 'pay-001',
        status: 'COMPLETED',
        receiptUrl: 'https://squareup.com/receipt/123',
        totalCents: 4500,
      });

      expect(mockClient.payments.create).toHaveBeenCalledWith({
        sourceId: 'cnon:card-nonce-123',
        idempotencyKey: 'idem-key-001',
        amountMoney: { amount: BigInt(4500), currency: 'USD' },
        locationId: 'loc-001',
        autocomplete: true,
        buyerEmailAddress: undefined,
        note: undefined,
        referenceId: undefined,
        orderId: undefined,
      });
    });

    it('passes optional fields through to Square API', async () => {
      mockClient.payments.create.mockResolvedValue({
        payment: {
          id: 'pay-002',
          status: 'COMPLETED',
          totalMoney: { amount: BigInt(4500) },
        },
      });

      await service.createPayment({
        ...basePaymentInput,
        buyerEmailAddress: 'test@example.com',
        note: 'Pottery class registration',
        referenceId: 'reg-abc',
        orderId: 'order-xyz',
      });

      expect(mockClient.payments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          buyerEmailAddress: 'test@example.com',
          note: 'Pottery class registration',
          referenceId: 'reg-abc',
          orderId: 'order-xyz',
        })
      );
    });

    it('throws PaymentError when Square SDK throws SquareError', async () => {
      const squareError = new SquareError('Card declined');
      Object.defineProperty(squareError, 'errors', {
        value: [{ code: 'CARD_DECLINED', detail: 'Card was declined' }],
        writable: true,
      });

      mockClient.payments.create.mockRejectedValue(squareError);

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).userMessage).toBe(
          'Your card was declined. Please try a different card.'
        );
        expect((error as PaymentError).squareErrorCode).toBe('CARD_DECLINED');
      }
    });

    it('throws PaymentError when Square SDK throws SquareError without errors array', async () => {
      const squareError = new SquareError('Server error');

      mockClient.payments.create.mockRejectedValue(squareError);

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        // SquareError without errors array falls back to message or generic
        const msg = (error as PaymentError).userMessage;
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });

    it('throws PaymentError when generic Error is thrown', async () => {
      mockClient.payments.create.mockRejectedValue(
        new Error('Network timeout')
      );

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).userMessage).toBe('Network timeout');
        expect((error as PaymentError).squareErrorCode).toBeUndefined();
      }
    });

    it('throws PaymentError when non-Error value is thrown', async () => {
      mockClient.payments.create.mockRejectedValue('string error');

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).userMessage).toBe(
          'Unable to process payment. Please try again.'
        );
      }
    });

    it('throws PaymentError when response contains errors', async () => {
      mockClient.payments.create.mockResolvedValue({
        errors: [
          { code: 'INSUFFICIENT_FUNDS', detail: 'Not enough money' },
        ],
        payment: { id: 'pay-fail' },
      });

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).userMessage).toBe(
          'Insufficient funds. Please try a different payment method.'
        );
        expect((error as PaymentError).squareErrorCode).toBe(
          'INSUFFICIENT_FUNDS'
        );
      }
    });

    it('throws PaymentError when response has no payment object', async () => {
      mockClient.payments.create.mockResolvedValue({});

      try {
        await service.createPayment(basePaymentInput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).userMessage).toBe(
          'Unable to process payment. Please try again.'
        );
      }
    });

    it('handles missing receiptUrl gracefully', async () => {
      mockClient.payments.create.mockResolvedValue({
        payment: {
          id: 'pay-no-receipt',
          status: 'APPROVED',
          totalMoney: { amount: BigInt(2500) },
        },
      });

      const result = await service.createPayment(basePaymentInput);
      expect(result.receiptUrl).toBeUndefined();
      expect(result.status).toBe('APPROVED');
    });

    it('handles missing totalMoney gracefully', async () => {
      mockClient.payments.create.mockResolvedValue({
        payment: {
          id: 'pay-no-money',
          status: 'COMPLETED',
        },
      });

      const result = await service.createPayment(basePaymentInput);
      expect(result.totalCents).toBe(0);
    });

    it('handles missing status gracefully', async () => {
      mockClient.payments.create.mockResolvedValue({
        payment: {
          id: 'pay-no-status',
          totalMoney: { amount: BigInt(4500) },
        },
      });

      const result = await service.createPayment(basePaymentInput);
      expect(result.status).toBe('UNKNOWN');
    });
  });

  describe('refundPayment', () => {
    const baseRefundInput = {
      paymentId: 'pay-001',
      amountCents: 4500,
      idempotencyKey: 'refund-idem-001',
    };

    it('creates a refund and returns the result', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        refund: {
          id: 'refund-001',
          status: 'PENDING',
          amountMoney: { amount: BigInt(4500), currency: 'USD' },
        },
      });

      const result = await service.refundPayment(baseRefundInput);

      expect(result).toEqual({
        refundId: 'refund-001',
        status: 'PENDING',
        amountCents: 4500,
      });

      expect(mockClient.refunds.refundPayment).toHaveBeenCalledWith({
        paymentId: 'pay-001',
        idempotencyKey: 'refund-idem-001',
        amountMoney: { amount: BigInt(4500), currency: 'USD' },
        reason: undefined,
      });
    });

    it('passes reason through to Square API', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        refund: {
          id: 'refund-002',
          status: 'COMPLETED',
          amountMoney: { amount: BigInt(2000) },
        },
      });

      await service.refundPayment({
        ...baseRefundInput,
        reason: 'Customer requested cancellation',
      });

      expect(mockClient.refunds.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Customer requested cancellation',
        })
      );
    });

    it('throws when response contains errors', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        errors: [
          { code: 'REFUND_ALREADY_PENDING', detail: 'Already pending' },
        ],
      });

      await expect(
        service.refundPayment(baseRefundInput)
      ).rejects.toThrow('Square refund error: Already pending');
    });

    it('falls back to code when error has no detail', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        errors: [{ code: 'SOME_CODE' }],
      });

      await expect(
        service.refundPayment(baseRefundInput)
      ).rejects.toThrow('Square refund error: SOME_CODE');
    });

    it('shows Unknown error when error has neither detail nor code', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        errors: [{}],
      });

      await expect(
        service.refundPayment(baseRefundInput)
      ).rejects.toThrow('Square refund error: Unknown error');
    });

    it('throws when response has no refund object', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({});

      await expect(
        service.refundPayment(baseRefundInput)
      ).rejects.toThrow('Square refund failed: no refund in response');
    });

    it('handles missing amountMoney gracefully', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        refund: {
          id: 'refund-003',
          status: 'COMPLETED',
        },
      });

      const result = await service.refundPayment(baseRefundInput);
      expect(result.amountCents).toBe(0);
    });

    it('handles missing status gracefully', async () => {
      mockClient.refunds.refundPayment.mockResolvedValue({
        refund: {
          id: 'refund-004',
          amountMoney: { amount: BigInt(4500) },
        },
      });

      const result = await service.refundPayment(baseRefundInput);
      expect(result.status).toBe('UNKNOWN');
    });
  });

  describe('getPayment', () => {
    it('returns payment details', async () => {
      mockClient.payments.get.mockResolvedValue({
        payment: {
          id: 'pay-001',
          status: 'COMPLETED',
          totalMoney: { amount: BigInt(4500), currency: 'USD' },
          refundedMoney: { amount: BigInt(0), currency: 'USD' },
          receiptUrl: 'https://squareup.com/receipt/123',
          createdAt: '2026-05-15T14:00:00Z',
        },
      });

      const result = await service.getPayment('pay-001');

      expect(result).toEqual({
        paymentId: 'pay-001',
        status: 'COMPLETED',
        amountCents: 4500,
        refundedCents: 0,
        receiptUrl: 'https://squareup.com/receipt/123',
        createdAt: '2026-05-15T14:00:00Z',
      });

      expect(mockClient.payments.get).toHaveBeenCalledWith({
        paymentId: 'pay-001',
      });
    });

    it('throws when response contains errors', async () => {
      mockClient.payments.get.mockResolvedValue({
        errors: [{ detail: 'Payment not found', code: 'NOT_FOUND' }],
      });

      await expect(service.getPayment('pay-nonexistent')).rejects.toThrow(
        'Square get payment error: Payment not found'
      );
    });

    it('falls back to code when error has no detail', async () => {
      mockClient.payments.get.mockResolvedValue({
        errors: [{ code: 'NOT_FOUND' }],
      });

      await expect(service.getPayment('pay-nonexistent')).rejects.toThrow(
        'Square get payment error: NOT_FOUND'
      );
    });

    it('throws when payment is not in response', async () => {
      mockClient.payments.get.mockResolvedValue({});

      await expect(service.getPayment('pay-missing')).rejects.toThrow(
        'Square payment not found: pay-missing'
      );
    });

    it('handles missing refundedMoney gracefully', async () => {
      mockClient.payments.get.mockResolvedValue({
        payment: {
          id: 'pay-002',
          status: 'COMPLETED',
          totalMoney: { amount: BigInt(2500) },
          createdAt: '2026-05-15T14:00:00Z',
        },
      });

      const result = await service.getPayment('pay-002');
      expect(result.refundedCents).toBe(0);
      expect(result.receiptUrl).toBeUndefined();
    });

    it('handles missing totalMoney gracefully', async () => {
      mockClient.payments.get.mockResolvedValue({
        payment: {
          id: 'pay-003',
          status: 'COMPLETED',
          createdAt: '2026-01-01T00:00:00Z',
        },
      });

      const result = await service.getPayment('pay-003');
      expect(result.amountCents).toBe(0);
    });

    it('defaults createdAt when not provided', async () => {
      mockClient.payments.get.mockResolvedValue({
        payment: {
          id: 'pay-004',
          status: 'COMPLETED',
          totalMoney: { amount: BigInt(1000) },
        },
      });

      const result = await service.getPayment('pay-004');
      expect(result.createdAt).toBeDefined();
      expect(new Date(result.createdAt).getTime()).not.toBeNaN();
    });

    it('handles missing status gracefully', async () => {
      mockClient.payments.get.mockResolvedValue({
        payment: {
          id: 'pay-005',
          totalMoney: { amount: BigInt(1000) },
          createdAt: '2026-01-01T00:00:00Z',
        },
      });

      const result = await service.getPayment('pay-005');
      expect(result.status).toBe('UNKNOWN');
    });
  });
});
