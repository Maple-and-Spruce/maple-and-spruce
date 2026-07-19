import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for resolvePosLessonAttribution — mocks createAdminFunction + the
 * throw helpers so the handler runs as a plain fn, and mocks the repositories.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  attribute: vi.fn(),
  dismiss: vi.fn(),
  settleOrCreate: vi.fn(),
  studentFindById: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwInvalidArgument: (m: string) => {
    throw new Error(`invalid-argument: ${m}`);
  },
  throwFailedPrecondition: (m: string) => {
    throw new Error(`failed-precondition: ${m}`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  PosLessonAttributionRepository: {
    findById: mocks.findById,
    attribute: mocks.attribute,
    dismiss: mocks.dismiss,
  },
  InvoiceRepository: { settleOrCreatePosLessonInvoice: mocks.settleOrCreate },
  StudentRepository: { findById: mocks.studentFindById },
}));

import { resolvePosLessonAttribution } from './resolve-pos-lesson-attribution';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = resolvePosLessonAttribution as unknown as Handler;

const pending = {
  id: 'PAY-1__VAR_LESSON',
  squarePaymentId: 'PAY-1',
  squareOrderId: 'ORDER-1',
  itemName: 'Guitar Lesson',
  subtotalCents: 4000,
  status: 'pending',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(pending);
  mocks.studentFindById.mockResolvedValue({ id: 'student-1', name: 'Juniper' });
  mocks.settleOrCreate.mockResolvedValue({
    invoice: { id: 'inv-9' },
    settledExisting: true,
  });
  mocks.attribute.mockResolvedValue({ ...pending, status: 'attributed' });
  mocks.dismiss.mockResolvedValue({ ...pending, status: 'dismissed' });
});

describe('resolvePosLessonAttribution', () => {
  it('attributes: settles/creates the invoice then marks attributed with caller uid', async () => {
    const res = (await handler(
      { attributionId: pending.id, action: 'attribute', studentId: 'student-1' },
      { uid: 'uid-katie' }
    )) as { attribution: { status: string } };

    expect(mocks.settleOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-1',
        subtotalCents: 4000,
        squarePaymentId: 'PAY-1',
        squareOrderId: 'ORDER-1',
        recordedByUid: 'uid-katie',
      })
    );
    expect(mocks.attribute).toHaveBeenCalledWith({
      id: pending.id,
      studentId: 'student-1',
      invoiceId: 'inv-9',
      attributedBy: 'uid-katie',
    });
    expect(res.attribution.status).toBe('attributed');
  });

  it('dismisses with the caller uid + notes', async () => {
    await handler(
      { attributionId: pending.id, action: 'dismiss', notes: 'refunded' },
      { uid: 'uid-nathan' }
    );
    expect(mocks.dismiss).toHaveBeenCalledWith({
      id: pending.id,
      dismissedBy: 'uid-nathan',
      notes: 'refunded',
    });
    expect(mocks.settleOrCreate).not.toHaveBeenCalled();
  });

  it('requires a studentId to attribute', async () => {
    await expect(
      handler({ attributionId: pending.id, action: 'attribute' }, { uid: 'u' })
    ).rejects.toThrow(/invalid-argument/);
    expect(mocks.settleOrCreate).not.toHaveBeenCalled();
  });

  it('404s when the student does not exist', async () => {
    mocks.studentFindById.mockResolvedValue(undefined);
    await expect(
      handler(
        { attributionId: pending.id, action: 'attribute', studentId: 'ghost' },
        { uid: 'u' }
      )
    ).rejects.toThrow(/Student not found/);
    expect(mocks.settleOrCreate).not.toHaveBeenCalled();
  });

  it('404s when the attribution does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(
      handler({ attributionId: 'nope', action: 'dismiss' }, { uid: 'u' })
    ).rejects.toThrow(/POS lesson attribution not found/);
  });

  it('rejects resolving an already-resolved attribution', async () => {
    mocks.findById.mockResolvedValue({ ...pending, status: 'attributed' });
    await expect(
      handler(
        { attributionId: pending.id, action: 'dismiss' },
        { uid: 'u' }
      )
    ).rejects.toThrow(/failed-precondition/);
  });

  it('rejects an unknown action', async () => {
    await expect(
      handler({ attributionId: pending.id, action: 'frobnicate' }, { uid: 'u' })
    ).rejects.toThrow(/invalid-argument/);
  });
});
