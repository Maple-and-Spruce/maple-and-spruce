import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
  toDate: (value: unknown): Date =>
    value instanceof Date ? value : new Date('2026-01-01T00:00:00Z'),
}));

import { InstructorRepository } from './instructor.repository';
import { db } from './utilities/database.config';

const readiness = {
  contractorAgreement: { signedOn: '2026-09-01', reference: 'Office binder' },
  backgroundCheck: { clearedOn: '2026-09-10' },
  paymentSetup: { completedOn: '2026-09-12', method: 'square-payroll' },
};

function instructorDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Robin Ashfield',
    email: 'robin@example.com',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

/** A document ref that stores what is written and reads it back. */
function setupDocRef(initial: Record<string, unknown> | null) {
  let stored = initial;
  const docRef = {
    id: 'instructor-1',
    set: vi.fn(async (data: Record<string, unknown>) => {
      stored = data;
    }),
    update: vi.fn(async (data: Record<string, unknown>) => {
      // Firestore `update` replaces each top-level key it is given.
      stored = { ...(stored ?? {}), ...data };
    }),
    get: vi.fn(async () => ({
      id: 'instructor-1',
      exists: stored !== null,
      data: () => stored ?? undefined,
    })),
  };
  vi.mocked(db.collection).mockReturnValue({
    doc: vi.fn().mockReturnValue(docRef),
  } as never);
  return docRef;
}

describe('InstructorRepository readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the contractor flag and every readiness item back', async () => {
    setupDocRef(instructorDoc({ isContractor: true, readiness }));

    const instructor = await InstructorRepository.findById('instructor-1');

    expect(instructor?.isContractor).toBe(true);
    expect(instructor?.readiness).toEqual(readiness);
  });

  it('leaves both unset for an instructor that predates them', async () => {
    setupDocRef(instructorDoc());

    const instructor = await InstructorRepository.findById('instructor-1');

    expect(instructor?.isContractor).toBeUndefined();
    expect(instructor?.readiness).toBeUndefined();
  });

  it('drops a malformed item rather than reading it as done', async () => {
    setupDocRef(
      instructorDoc({
        isContractor: true,
        readiness: {
          contractorAgreement: { reference: 'no date' },
          backgroundCheck: { clearedOn: '2026-09-10' },
          paymentSetup: { completedOn: '2026-09-12', method: 'cash' },
        },
      })
    );

    const instructor = await InstructorRepository.findById('instructor-1');

    expect(instructor?.readiness).toEqual({
      backgroundCheck: { clearedOn: '2026-09-10' },
    });
  });

  it('writes readiness on create', async () => {
    const docRef = setupDocRef(null);

    await InstructorRepository.create({
      name: 'Robin Ashfield',
      email: 'robin@example.com',
      status: 'active',
      isContractor: true,
      readiness: {
        backgroundCheck: { clearedOn: '2026-09-10' },
      },
    });

    expect(docRef.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isContractor: true,
        readiness: { backgroundCheck: { clearedOn: '2026-09-10' } },
      })
    );
  });

  it('round-trips readiness through update, replacing the whole record', async () => {
    const docRef = setupDocRef(instructorDoc({ isContractor: true, readiness }));

    const updated = await InstructorRepository.update({
      id: 'instructor-1',
      readiness: { backgroundCheck: { clearedOn: '2026-09-20' } },
    });

    expect(docRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        readiness: { backgroundCheck: { clearedOn: '2026-09-20' } },
      })
    );
    // The agreement and payment items were left out, so they are cleared.
    expect(updated.readiness).toEqual({
      backgroundCheck: { clearedOn: '2026-09-20' },
    });
    expect(updated.isContractor).toBe(true);
  });
});
