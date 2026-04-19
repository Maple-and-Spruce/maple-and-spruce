import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the updateInvoice cloud function handler.
 *
 * Mocks createAdminFunction + throwNotFound so the handler runs as a
 * plain function, and mocks InvoiceRepository so we can assert what the
 * handler forwards. Uses the real invoiceValidation + real
 * isInvoiceStatusTransitionAllowed so the transition rules aren't
 * re-implemented in the spec.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  InvoiceRepository: {
    findById: mocks.findById,
    update: mocks.update,
  },
}));

import { updateInvoice } from './update-invoice';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = updateInvoice as unknown as Handler;

const existingDraft = {
  id: 'inv-1',
  studentId: 'student-1',
  status: 'draft',
  lineItems: [
    {
      id: 'l1',
      description: 'April tuition',
      quantity: 4,
      unitAmountCents: 3250,
      subtotalCents: 13000,
    },
  ],
  totalCents: 13000,
  notes: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('updateInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the update to the repository on a valid status transition', async () => {
    mocks.findById.mockResolvedValue(existingDraft);
    mocks.update.mockResolvedValue({
      ...existingDraft,
      status: 'sent',
      issuedAt: new Date(),
    });

    const result = (await handler({ id: 'inv-1', status: 'sent' })) as {
      invoice: { status: string };
    };

    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'inv-1', status: 'sent' },
      existingDraft
    );
    expect(result.invoice.status).toBe('sent');
  });

  it('throws not-found when the invoice does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(handler({ id: 'missing', status: 'sent' })).rejects.toThrow(
      /Invoice not found/
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects an illegal status transition (paid → sent)', async () => {
    mocks.findById.mockResolvedValue({ ...existingDraft, status: 'paid' });

    await expect(handler({ id: 'inv-1', status: 'sent' })).rejects.toThrow(
      /Invalid status transition/
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects from terminal void back to anything', async () => {
    mocks.findById.mockResolvedValue({ ...existingDraft, status: 'void' });

    await expect(handler({ id: 'inv-1', status: 'draft' })).rejects.toThrow(
      /Invalid status transition/
    );
  });

  it('merges partial line-item updates and validates the merged shape', async () => {
    mocks.findById.mockResolvedValue(existingDraft);
    mocks.update.mockResolvedValue(existingDraft);

    await handler({
      id: 'inv-1',
      lineItems: [
        {
          id: 'l-new',
          description: 'Refined tuition',
          quantity: 2,
          unitAmountCents: 3250,
          subtotalCents: 6500,
        },
      ],
    });

    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a merged line-items update with a blank description', async () => {
    mocks.findById.mockResolvedValue(existingDraft);

    await expect(
      handler({
        id: 'inv-1',
        lineItems: [
          {
            id: 'l-bad',
            description: '',
            quantity: 1,
            unitAmountCents: 1000,
            subtotalCents: 1000,
          },
        ],
      })
    ).rejects.toThrow(/Validation failed/);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('passes through a notes-only update without touching status or line items', async () => {
    mocks.findById.mockResolvedValue(existingDraft);
    mocks.update.mockResolvedValue({ ...existingDraft, notes: 'Mailed 4/20' });

    await handler({ id: 'inv-1', notes: 'Mailed 4/20' });

    expect(mocks.update).toHaveBeenCalledWith(
      { id: 'inv-1', notes: 'Mailed 4/20' },
      existingDraft
    );
  });
});
