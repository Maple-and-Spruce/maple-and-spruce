import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Instructor } from '@maple/ts/domain';

type Handler = (data: unknown) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  handler: null as Handler | null,
  findById: vi.fn(),
  findByEmail: vi.fn(),
  findByUid: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    createAdminFunction: vi.fn((h: Handler) => {
      mocks.handler = h;
      return 'mock-fn';
    }),
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwFailedPrecondition: (msg: string) => {
      throw new HttpsError('failed-precondition', msg);
    },
    throwValidationError: (errs: Record<string, string[]>) => {
      throw new HttpsError('invalid-argument', `Validation failed: ${Object.keys(errs).join(',')}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  InstructorRepository: {
    findById: mocks.findById,
    findByEmail: mocks.findByEmail,
    findByUid: mocks.findByUid,
    update: mocks.update,
  },
}));

import './update-instructor';

const existing: Instructor = {
  id: 'instructor-1',
  name: 'Robin Ashfield',
  email: 'robin@example.com',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('updateInstructor readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(existing);
    mocks.update.mockImplementation(async (input: Partial<Instructor>) => ({
      ...existing,
      ...input,
    }));
  });

  it('records the contractor flag and readiness items', async () => {
    const readiness = {
      contractorAgreement: { signedOn: '2026-09-01' },
      backgroundCheck: { clearedOn: '2026-09-10' },
      paymentSetup: { completedOn: '2026-09-12', method: 'w9-on-file' as const },
    };

    const result = (await mocks.handler!({
      id: 'instructor-1',
      isContractor: true,
      readiness,
    })) as { instructor: Instructor };

    expect(mocks.update).toHaveBeenCalledWith({
      id: 'instructor-1',
      isContractor: true,
      readiness,
    });
    expect(result.instructor.readiness).toEqual(readiness);
  });

  it('rejects an invalid date as invalid-argument, before writing', async () => {
    await expect(
      mocks.handler!({
        id: 'instructor-1',
        isContractor: true,
        readiness: { backgroundCheck: { clearedOn: '09/10/2026' } },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a payment setup with no method', async () => {
    await expect(
      mocks.handler!({
        id: 'instructor-1',
        readiness: { paymentSetup: { completedOn: '2026-09-12' } },
      })
    ).rejects.toThrow(/paymentSetupMethod/);
  });

  it('throws not-found for an unknown instructor', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(
      mocks.handler!({ id: 'nope', isContractor: true })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
