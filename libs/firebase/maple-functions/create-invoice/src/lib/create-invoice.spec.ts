import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the createInvoice cloud function handler.
 *
 * createAdminFunction is mocked to return the handler directly so we can
 * invoke it like a plain function. Repositories are mocked; the real
 * `invoiceValidation` suite is used so malformed input fails fast.
 */

const mocks = vi.hoisted(() => ({
  studentFindById: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceFindAll: vi.fn(),
  chargeFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.studentFindById },
  InvoiceRepository: {
    create: mocks.invoiceCreate,
    findAll: mocks.invoiceFindAll,
  },
  LessonScheduledChargeRepository: { findAll: mocks.chargeFindAll },
}));

import { createInvoice } from './create-invoice';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = createInvoice as unknown as Handler;

const privateStudent = {
  id: 'student-1',
  isHopeScholarship: false,
  name: 'Olive',
  primaryContactEmail: 'rita@x.com',
};

const hopeStudent = { ...privateStudent, id: 'hope-1', isHopeScholarship: true };

const validPayload = () => ({
  studentId: 'student-1',
  lineItems: [
    {
      id: 'line-1',
      description: 'April tuition',
      quantity: 4,
      unitAmountCents: 3250,
      subtotalCents: 13000,
    },
  ],
});

describe('createInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoiceFindAll.mockResolvedValue([]);
    mocks.chargeFindAll.mockResolvedValue([]);
  });

  it('creates an invoice for a private-pay student', async () => {
    mocks.studentFindById.mockResolvedValue(privateStudent);
    mocks.invoiceCreate.mockResolvedValue({
      id: 'inv-new',
      status: 'draft',
      totalCents: 13000,
    });

    const result = (await handler(validPayload())) as {
      invoice: { id: string };
    };

    expect(mocks.studentFindById).toHaveBeenCalledWith('student-1');
    expect(mocks.invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-1' }),
      expect.anything()
    );
    expect(result.invoice.id).toBe('inv-new');
  });

  it('rejects a Hope Scholarship student (defense-in-depth server guard)', async () => {
    mocks.studentFindById.mockResolvedValue(hopeStudent);

    await expect(
      handler({ ...validPayload(), studentId: 'hope-1' })
    ).rejects.toThrow(/Hope Scholarship/);

    expect(mocks.invoiceCreate).not.toHaveBeenCalled();
  });

  it('throws when the student does not exist', async () => {
    mocks.studentFindById.mockResolvedValue(undefined);

    await expect(
      handler({ ...validPayload(), studentId: 'missing' })
    ).rejects.toThrow(/Student not found/);

    expect(mocks.invoiceCreate).not.toHaveBeenCalled();
  });

  it('rejects an empty lineItems list via Vest validation', async () => {
    await expect(handler({ studentId: 'student-1', lineItems: [] })).rejects.toThrow(
      /Validation failed/
    );
    expect(mocks.studentFindById).not.toHaveBeenCalled();
  });

  it('rejects a line item with zero quantity via Vest validation', async () => {
    await expect(
      handler({
        studentId: 'student-1',
        lineItems: [
          {
            id: 'x',
            description: 'Test',
            quantity: 0,
            unitAmountCents: 1000,
            subtotalCents: 0,
          },
        ],
      })
    ).rejects.toThrow(/Validation failed/);
  });

  it('rejects a missing studentId via Vest validation', async () => {
    await expect(
      handler({ studentId: '', lineItems: validPayload().lineItems })
    ).rejects.toThrow(/Validation failed/);
  });

  describe('recording a payment already taken (cash, check, Venmo)', () => {
    const paidPayload = (over: Record<string, unknown> = {}) => ({
      studentId: 'student-1',
      status: 'paid',
      paidWith: 'venmo-manual',
      lineItems: [
        {
          id: 'line-1',
          description: 'Lesson',
          lessonId: 'lesson-1',
          quantity: 1,
          unitAmountCents: 4500,
          subtotalCents: 4500,
        },
      ],
      ...over,
    });

    beforeEach(() => {
      mocks.studentFindById.mockResolvedValue(privateStudent);
      mocks.invoiceCreate.mockResolvedValue({ id: 'inv-paid', status: 'paid' });
    });

    it('creates it paid, stamped with who recorded it', async () => {
      await handler(paidPayload(), { uid: 'katie-uid' });

      expect(mocks.invoiceCreate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid', paidWith: 'venmo-manual' }),
        { recordedByUid: 'katie-uid' }
      );
    });

    it('refuses a lesson a card charge already covers', async () => {
      mocks.chargeFindAll.mockResolvedValue([
        { id: 'chg-1', status: 'paid', lessonIds: ['lesson-1'] },
      ]);

      await expect(handler(paidPayload(), { uid: 'katie-uid' })).rejects.toThrow(
        /already charged or invoiced/
      );
      expect(mocks.invoiceCreate).not.toHaveBeenCalled();
    });

    it('refuses a lesson already on a live invoice', async () => {
      mocks.invoiceFindAll.mockResolvedValue([
        {
          id: 'inv-old',
          status: 'sent',
          lineItems: [{ id: 'l', lessonId: 'lesson-1' }],
        },
      ]);

      await expect(handler(paidPayload(), { uid: 'katie-uid' })).rejects.toThrow(
        /already charged or invoiced/
      );
    });

    it('does allow a lesson whose earlier invoice was voided', async () => {
      mocks.invoiceFindAll.mockResolvedValue([
        {
          id: 'inv-void',
          status: 'void',
          lineItems: [{ id: 'l', lessonId: 'lesson-1' }],
        },
      ]);

      await handler(paidPayload(), { uid: 'katie-uid' });
      expect(mocks.invoiceCreate).toHaveBeenCalled();
    });

    it('rejects paid-with on an invoice that is not being created paid', async () => {
      await expect(
        handler(paidPayload({ status: 'sent' }), { uid: 'katie-uid' })
      ).rejects.toThrow(/Validation failed/);
    });

    it('rejects a payment source a person cannot record by hand', async () => {
      await expect(
        handler(paidPayload({ paidWith: 'square-webhook' }), { uid: 'katie-uid' })
      ).rejects.toThrow(/Validation failed/);
    });
  });
});
