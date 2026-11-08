import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  /** Mail docs written so far, by id: the store `create()` checks. */
  written: new Map<string, Record<string, unknown>>(),
  failCreate: undefined as Error | undefined,
}));

vi.mock('@maple/firebase/database', () => {
  return {
    // The gRPC shape is all this store throws; the real check has its own spec.
    isAlreadyExists: (err: unknown) => (err as { code?: number })?.code === 6,
    getDb: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({
          create: async (data: Record<string, unknown>) => {
            if (name !== 'mail') throw new Error(`unexpected ${name}`);
            if (mocks.failCreate) throw mocks.failCreate;
            if (mocks.written.has(id)) {
              // What the emulator (gRPC) reports for a create onto an id.
              throw Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 });
            }
            mocks.written.set(id, data);
          },
        }),
      }),
    }),
  };
});

import {
  queueRegistrationConfirmation,
  type RegistrationConfirmationInput,
} from './registration-confirmation.utility';

const CLASS = {
  name: 'Wheel Throwing',
  sessions: [
    { dateTime: new Date('2030-05-14T22:00:00.000Z') },
    { dateTime: new Date('2030-05-21T22:00:00.000Z') },
  ],
  durationMinutes: 90,
  location: 'Studio B',
  materialsIncluded: 'Clay and glazes',
  whatToBring: 'An apron',
};

function input(
  overrides: Partial<RegistrationConfirmationInput> = {}
): RegistrationConfirmationInput {
  return {
    idempotencyKey: 'reg-1',
    classEntity: CLASS,
    customerName: 'Robin Ashfield',
    customerEmail: 'robin@example.com',
    quantity: 1,
    confirmationNumber: 'MS-ABC234',
    subtotalCents: 4500,
    taxRatePercent: 6,
    taxAmountCents: 270,
    amountPaidCents: 4770,
    receiptUrl: 'https://squareup.com/receipt/1',
    ...overrides,
  };
}

type Mail = {
  to: string;
  message?: { attachments?: Array<Record<string, string>> };
  template: { name: string; data: Record<string, unknown> };
};
const mail = (id: string): Mail =>
  mocks.written.get(id) as unknown as Mail;

beforeEach(() => {
  mocks.written.clear();
  mocks.failCreate = undefined;
});

describe('queueRegistrationConfirmation', () => {
  it('writes the registrant confirmation under a fixed id, with the class .ics', async () => {
    const result = await queueRegistrationConfirmation(input());

    expect(result).toEqual({ queued: 1 });
    const doc = mail('registration-confirmation-reg-1');
    expect(doc.to).toBe('robin@example.com');
    expect(doc.template.name).toBe('registration-confirmation');
    expect(doc.template.data).toMatchObject({
      customerName: 'Robin Ashfield',
      className: 'Wheel Throwing',
      classDuration: '1 hour 30 min',
      classLocation: 'Studio B',
      confirmationNumber: 'MS-ABC234',
      subtotal: '$45.00',
      taxRate: 6,
      taxAmount: '$2.70',
      amountPaid: '$47.70',
      quantity: 1,
      receiptUrl: 'https://squareup.com/receipt/1',
      materialsIncluded: 'Clay and glazes',
      whatToBring: 'An apron',
      attendees: [{ name: 'Robin Ashfield', email: 'robin@example.com' }],
    });
    const [ics] = doc.message?.attachments ?? [];
    expect(ics.filename).toBe('class.ics');
    expect(ics.content).toContain('UID:MS-ABC234-1@');
    expect(ics.content).toContain('UID:MS-ABC234-2@');
  });

  it('sends nothing the second time for the same key', async () => {
    await queueRegistrationConfirmation(input());
    const again = await queueRegistrationConfirmation(input());

    expect(again).toEqual({ queued: 0 });
    expect(mocks.written.size).toBe(1);
  });

  it('emails each additional attendee who gave an address, once', async () => {
    const attendees = [
      { name: 'Olive Thompson', email: 'olive@example.com' },
      { name: 'No Email Friend' },
    ];
    const result = await queueRegistrationConfirmation(
      input({ quantity: 3, additionalAttendees: attendees })
    );

    expect(result).toEqual({ queued: 2 });
    const registrant = mail('registration-confirmation-reg-1');
    expect(registrant.template.data).toMatchObject({
      extrasWithoutEmailCount: 1,
      extrasWithoutEmailNoun: 'friend',
    });
    const attendee = mail('registration-confirmation-reg-1-attendee-0');
    expect(attendee.to).toBe('olive@example.com');
    expect(attendee.template.name).toBe('registration-confirmation-attendee');
    expect(attendee.template.data).toMatchObject({
      attendeeName: 'Olive Thompson',
      registrantName: 'Robin Ashfield',
    });
    expect(attendee.template.data['amountPaid']).toBeUndefined();
    expect(attendee.message?.attachments?.[0]?.filename).toBe('class.ics');
  });

  it('greets "there" and leaves the roster nameless when the sale had no name', async () => {
    await queueRegistrationConfirmation(input({ customerName: undefined }));

    const { data } = mail('registration-confirmation-reg-1').template;
    expect(data['customerName']).toBe('there');
    expect(data['attendees']).toEqual([
      { name: undefined, email: 'robin@example.com' },
    ]);
  });

  it('carries gift card, waiver and referral details when given', async () => {
    await queueRegistrationConfirmation(
      input({
        giftCard: {
          last4: '4242',
          paidCents: 3000,
          cardPaidCents: 1770,
          classCertificateCoverCents: null,
        },
        agreementsSigned: true,
        waiverUrl: 'https://example.com/sign/abc',
        referral: { code: 'FR-ABC234', expires: 'June 1, 2030', percent: 15 },
      })
    );

    expect(mail('registration-confirmation-reg-1').template.data).toMatchObject({
      giftCardLast4: '4242',
      giftCardPaid: '$30.00',
      cardPaid: '$17.70',
      classCertificateCover: undefined,
      agreementsSigned: true,
      waiverUrl: 'https://example.com/sign/abc',
      referralCode: 'FR-ABC234',
      referralExpires: 'June 1, 2030',
      referralPercent: 15,
    });
  });

  it('drops a sandbox receipt link', async () => {
    await queueRegistrationConfirmation(
      input({ receiptUrl: 'https://squareupsandbox.com/receipt/1' })
    );
    expect(
      mail('registration-confirmation-reg-1').template.data['receiptUrl']
    ).toBeUndefined();
  });

  it('skips E2E test recipients and blank emails', async () => {
    expect(
      await queueRegistrationConfirmation(
        input({ customerEmail: 'e2e+pay@maplespruce.test' })
      )
    ).toEqual({ queued: 0 });
    expect(
      await queueRegistrationConfirmation(input({ customerEmail: '  ' }))
    ).toEqual({ queued: 0 });
    expect(mocks.written.size).toBe(0);
  });

  it('shows only the booked hour for a private-hours class', async () => {
    await queueRegistrationConfirmation(
      input({
        classEntity: { ...CLASS, format: 'privateHours' as const },
        slotStart: new Date('2030-05-21T22:00:00.000Z'),
      })
    );
    const doc = mail('registration-confirmation-reg-1');
    const ics = doc.message?.attachments?.[0]?.content ?? '';
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('names the free cancellation date and the cancel page for a web checkout', async () => {
    // First session Tue May 14 2030, 6:00 PM Eastern → free until Tue Apr 30.
    await queueRegistrationConfirmation(input({ offerFreeCancellation: true }));
    const { data } = mail('registration-confirmation-reg-1').template;
    expect(data['freeCancellationUntil']).toBe('Tue, Apr 30 at 6:00 PM');
    expect(data['cancelUrl']).toBe(
      'https://mapleandsprucefolkarts.com/cancel?confirmation=MS-ABC234'
    );
  });

  it('says nothing about cancelling for a register sale, or once the date has passed', async () => {
    await queueRegistrationConfirmation(input());
    const pos = mail('registration-confirmation-reg-1').template.data;
    expect(pos['freeCancellationUntil']).toBeUndefined();
    expect(pos['cancelUrl']).toBeUndefined();

    // Five days out: inside the two weeks.
    // eslint-disable-next-line no-restricted-syntax -- a duration, not a calendar day
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await queueRegistrationConfirmation(
      input({
        idempotencyKey: 'reg-soon',
        offerFreeCancellation: true,
        classEntity: { ...CLASS, sessions: [{ dateTime: soon }] },
      })
    );
    const late = mail('registration-confirmation-reg-soon').template.data;
    expect(late['freeCancellationUntil']).toBeUndefined();
    expect(late['cancelUrl']).toBeUndefined();
  });

  it('never throws when the write fails', async () => {
    mocks.failCreate = new Error('firestore down');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(queueRegistrationConfirmation(input())).resolves.toEqual({
      queued: 0,
    });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});
