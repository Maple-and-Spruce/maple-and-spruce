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
});
