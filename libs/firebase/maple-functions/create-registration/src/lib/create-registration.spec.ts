import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The card checkout's confirmation email: createRegistration hands the
 * shared helper the same data shape the hosted-checkout and POS paths use,
 * keyed on the registration so it is sent once.
 */

type Handler = (
  data: Record<string, unknown>,
  context: Record<string, unknown>,
  secrets: Record<string, string>,
  strings: Record<string, string>
) => Promise<Record<string, unknown>>;

const mocks = vi.hoisted(() => ({
  handler: undefined as Handler | undefined,
  queueRegistrationConfirmation: vi.fn(),
  reserveClassRegistration: vi.fn(),
  releaseDiscountUsage: vi.fn(),
  processInlineAgreements: vi.fn(),
  regUpdate: vi.fn(),
  regFindById: vi.fn(),
  createOrder: vi.fn(),
  createPayment: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const chain: Record<string, unknown> = {};
  for (const step of ['withAppCheck', 'throttling', 'usingSecrets', 'usingStrings']) {
    chain[step] = () => chain;
  }
  chain['handle'] = (fn: Handler) => {
    mocks.handler = fn;
    return fn;
  };
  return {
    Functions: { endpoint: chain },
    paymentThrottles: () => [],
    queueRegistrationConfirmation: mocks.queueRegistrationConfirmation,
    reserveClassRegistration: mocks.reserveClassRegistration,
    releaseDiscountUsage: mocks.releaseDiscountUsage,
    processInlineAgreements: mocks.processInlineAgreements,
  };
});

vi.mock('@maple/firebase/database', () => ({
  DiscountRepository: { create: vi.fn() },
  RegistrationRepository: {
    getDocRef: (id: string) => ({ id, update: mocks.regUpdate }),
    findById: mocks.regFindById,
  },
  AgreementTemplateRepository: { findAutoAttachForCategory: vi.fn() },
  AgreementRequestRepository: { create: vi.fn() },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class {
    taxRatePercent = 6;
    locationId = 'LOC';
    ordersService = { createOrder: mocks.createOrder };
    paymentsService = { createPayment: mocks.createPayment };
  },
  SQUARE_SECRET_NAMES: [],
  SQUARE_STRING_NAMES: [],
  PaymentError: class extends Error {},
  // Every failure in this file is a plain refusal; card-payment.spec covers
  // the retry for an unknown outcome.
  isPaymentOutcomeUnknown: () => false,
}));

import './create-registration';

const CLASS = {
  id: 'class-1',
  name: 'Wheel Throwing',
  priceCents: 4500,
  sessions: [{ dateTime: new Date('2030-05-14T22:00:00.000Z') }],
  durationMinutes: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.regUpdate.mockReset();
  mocks.regUpdate.mockResolvedValue(undefined);
  mocks.reserveClassRegistration.mockResolvedValue({
    registrationId: 'reg-card-1',
    classEntity: CLASS,
    requiredTemplates: [],
    confirmationNumber: 'MS-CARD01',
    subtotalCents: 9000,
    taxAmountCents: 540,
    pricePaidCents: 9540,
    taxRatePercent: 6,
    discountCode: undefined,
    discountAmountCents: 0,
  });
  mocks.createOrder.mockResolvedValue({ orderId: 'ORDER-1', totalCents: 9540 });
  mocks.createPayment.mockResolvedValue({
    paymentId: 'PAY-1',
    receiptUrl: 'https://squareup.com/receipt/1',
  });
  mocks.processInlineAgreements.mockResolvedValue(false);
  mocks.regFindById.mockResolvedValue({ id: 'reg-card-1' });
  mocks.queueRegistrationConfirmation.mockResolvedValue({ queued: 2 });
});

describe('createRegistration — confirmation email', () => {
  it('queues the shared confirmation for the paid registration', async () => {
    const attendees = [{ name: 'Olive Thompson', email: 'olive@example.com' }];
    await mocks.handler?.(
      {
        classId: 'class-1',
        customerName: 'Robin Ashfield',
        customerEmail: 'robin@example.com',
        quantity: 2,
        additionalAttendees: attendees,
        paymentNonce: 'cnon:ok',
      },
      {},
      {},
      { ALLOWED_ORIGINS: 'https://example.com' }
    );

    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'reg-card-1',
        classEntity: CLASS,
        customerName: 'Robin Ashfield',
        customerEmail: 'robin@example.com',
        quantity: 2,
        confirmationNumber: 'MS-CARD01',
        additionalAttendees: attendees,
        subtotalCents: 9000,
        taxRatePercent: 6,
        taxAmountCents: 540,
        amountPaidCents: 9540,
        receiptUrl: 'https://squareup.com/receipt/1',
        giftCard: undefined,
        agreementsSigned: false,
        referral: undefined,
      })
    );
  });

  it('sends nothing when the payment fails', async () => {
    mocks.createPayment.mockRejectedValue(new Error('declined'));

    await expect(
      mocks.handler?.(
        {
          classId: 'class-1',
          customerName: 'Robin Ashfield',
          customerEmail: 'robin@example.com',
          quantity: 1,
          paymentNonce: 'cnon:declined',
        },
        {},
        {},
        { ALLOWED_ORIGINS: 'https://example.com' }
      )
    ).rejects.toThrow();
    expect(mocks.queueRegistrationConfirmation).not.toHaveBeenCalled();
  });

  const REQUEST = {
    classId: 'class-1',
    customerName: 'Robin Ashfield',
    customerEmail: 'robin@example.com',
    quantity: 1,
    paymentNonce: 'cnon:card',
    discountCode: 'FR-ABC234',
  };
  const STRINGS = { ALLOWED_ORIGINS: 'https://example.com' };

  it('gives a discount use back when the payment fails', async () => {
    mocks.reserveClassRegistration.mockResolvedValue({
      ...(await mocks.reserveClassRegistration()),
      discountCode: 'FR-ABC234',
      discountAmountCents: 900,
      redeemedDiscountId: 'disc-referral',
    });
    mocks.createPayment.mockRejectedValue(new Error('declined'));

    await expect(mocks.handler?.(REQUEST, {}, {}, STRINGS)).rejects.toThrow();

    expect(mocks.releaseDiscountUsage).toHaveBeenCalledWith(
      'disc-referral',
      'reg-card-1'
    );
    expect(mocks.regUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
  });

  it('uses one Square key per registration, so a repeat cannot charge twice', async () => {
    await mocks.handler?.(REQUEST, {}, {}, STRINGS);

    expect(mocks.createOrder.mock.calls[0][0].idempotencyKey).toBe(
      'order-reg-card-1'
    );
    expect(mocks.createPayment.mock.calls[0][0].idempotencyKey).toBe(
      'reg-reg-card-1'
    );
  });

  it('tries again when saving the paid registration fails once', async () => {
    mocks.regUpdate.mockRejectedValueOnce(new Error('unavailable'));

    await mocks.handler?.(REQUEST, {}, {}, STRINGS);

    expect(mocks.regUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.regUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'confirmed', squarePaymentId: 'PAY-1' })
    );
    expect(mocks.queueRegistrationConfirmation).toHaveBeenCalled();
  });

  it('never calls a taken payment failed: no cancel, no discount handed back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.reserveClassRegistration.mockResolvedValue({
      ...(await mocks.reserveClassRegistration()),
      redeemedDiscountId: 'disc-referral',
    });
    mocks.regUpdate.mockRejectedValue(new Error('unavailable'));

    await expect(mocks.handler?.(REQUEST, {}, {}, STRINGS)).rejects.toThrow(
      /Your payment went through.*do not pay again/
    );

    expect(mocks.createPayment).toHaveBeenCalledTimes(1);
    expect(mocks.regUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(mocks.releaseDiscountUsage).not.toHaveBeenCalled();
    expect(mocks.queueRegistrationConfirmation).not.toHaveBeenCalled();
  });

  it('keeps the discount use when the payment goes through', async () => {
    mocks.reserveClassRegistration.mockResolvedValue({
      ...(await mocks.reserveClassRegistration()),
      redeemedDiscountId: 'disc-referral',
    });

    await mocks.handler?.(REQUEST, {}, {}, STRINGS);

    expect(mocks.releaseDiscountUsage).not.toHaveBeenCalled();
  });
});
