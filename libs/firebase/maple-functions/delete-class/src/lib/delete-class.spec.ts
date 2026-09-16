import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for delete-class.ts
 *
 * FAILING (bug E): `deleteClass` hard-deletes a class with no regard for the
 * registrations pointing at it. The source says so itself:
 *
 *     // TODO: In Phase 3c, check for existing registrations before allowing deletion
 *
 * `ClassRepository.delete` is a bare `doc(id).delete()` — no cascade, no
 * archive collection, no soft-delete flag. So the registrations survive their
 * class and become unreachable: they reference a `classId` that resolves to
 * nothing, which means the roster, the spot count, and the refund path all
 * lose the thread. Production currently holds 9 such registrations across 3
 * deleted classes, 3 of them `confirmed` — people who paid for a class whose
 * record no longer exists.
 *
 * Deleting a class with paid registrations should be refused outright. The
 * operator's route for a class that is not happening is to cancel it, which
 * keeps the record, the roster and the refund path intact.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  deleteFn: vi.fn(),
  findByClassId: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  ClassRepository: {
    findById: mocks.findById,
    delete: mocks.deleteFn,
  },
  RegistrationRepository: {
    findByClassId: mocks.findByClassId,
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (handler: (data: unknown) => unknown) => handler,
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
  throwInvalidArgument: (message: string) => {
    throw new Error(message);
  },
}));

import { deleteClass } from './delete-class';

const handler = deleteClass as unknown as (data: {
  id: string;
}) => Promise<{ success: boolean }>;

const existingClass = { id: 'class-001', name: 'Pottery 101', capacity: 10 };

describe('deleteClass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByClassId.mockResolvedValue([]);
  });

  it('deletes a class with no registrations', async () => {
    mocks.findById.mockResolvedValue(existingClass);

    const result = await handler({ id: 'class-001' });

    expect(result.success).toBe(true);
    expect(mocks.deleteFn).toHaveBeenCalledWith('class-001');
  });

  it('throws if the class does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);

    await expect(handler({ id: 'nope' })).rejects.toThrow();
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  /**
   * The one that matters. A confirmed registration is someone who paid.
   */
  it('refuses to delete a class that has registrations', async () => {
    mocks.findById.mockResolvedValue(existingClass);
    mocks.findByClassId.mockResolvedValue([
      { id: 'reg-1', status: 'confirmed' },
      { id: 'reg-2', status: 'confirmed' },
      { id: 'reg-3', status: 'cancelled' },
    ]);

    await expect(
      handler({ id: 'class-001' }),
      'Deleting a class with registrations orphans them: they keep a classId ' +
        'that resolves to nothing, so the roster and refund path lose them. ' +
        'Cancel the class instead.'
    ).rejects.toThrow();
  });

  it('does not delete the document when registrations exist', async () => {
    mocks.findById.mockResolvedValue(existingClass);
    mocks.findByClassId.mockResolvedValue([
      { id: 'reg-1', status: 'cancelled' },
    ]);

    await handler({ id: 'class-001' }).catch(() => undefined);

    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});
