import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The customer's note stays as they wrote it; staff notes are their own
 * field (#326). All people are invented.
 */
const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  RegistrationRepository: { findById: mocks.findById, update: mocks.update },
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
      public details?: unknown
    ) {
      super(message);
    }
  }
  return {
    Role: { Admin: 'admin', Clerk: 'clerk' },
    // Hand back the handler so it can be called directly.
    createRoleFunction: (handler: unknown) => handler,
    throwInvalidArgument: (message: string) => {
      throw new HttpsError('invalid-argument', message);
    },
    throwNotFound: (entity: string, id: string) => {
      throw new HttpsError('not-found', `${entity} ${id} not found`);
    },
    throwValidationError: (errors: unknown) => {
      throw new HttpsError('invalid-argument', 'Validation failed', errors);
    },
  };
});

import { updateRegistration } from './update-registration';

type Handler = (data: Record<string, unknown>) => Promise<unknown>;
const call = updateRegistration as unknown as Handler;

const existing = {
  id: 'reg-1',
  classId: 'cls-1',
  customerName: 'Robin Ashfield',
  customerEmail: 'robin@example.com',
  quantity: 1,
  status: 'confirmed',
  notes: 'Left-handed',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(existing);
  mocks.update.mockImplementation(async (input: Record<string, unknown>) => ({
    ...existing,
    ...input,
  }));
});

describe('updateRegistration', () => {
  it("refuses to change the customer's note", async () => {
    await expect(call({ id: 'reg-1', notes: 'Rewritten by staff' })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringMatching(/customer's note can't be changed/),
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('saves staff notes and leaves the customer note alone', async () => {
    const result = (await call({ id: 'reg-1', staffNotes: 'Called, end seat saved' })) as {
      registration: typeof existing & { staffNotes?: string };
    };
    expect(mocks.update).toHaveBeenCalledWith({ id: 'reg-1', staffNotes: 'Called, end seat saved' });
    expect(result.registration).toMatchObject({
      notes: 'Left-handed',
      staffNotes: 'Called, end seat saved',
    });
  });

  it('rejects staff notes over 2000 characters', async () => {
    await expect(call({ id: 'reg-1', staffNotes: 'x'.repeat(2001) })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('clears staff notes with an empty string', async () => {
    await call({ id: 'reg-1', staffNotes: '' });
    expect(mocks.update).toHaveBeenCalledWith({ id: 'reg-1', staffNotes: '' });
  });
});
