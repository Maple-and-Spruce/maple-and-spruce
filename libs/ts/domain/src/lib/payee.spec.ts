import { describe, it, expect } from 'vitest';
import { isPayeeActive } from './payee';
import type { Payee } from './payee';

const basePayee: Payee = {
  id: 'p-1',
  name: 'Test',
  email: 'test@example.com',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('isPayeeActive', () => {
  it('returns true for active payees', () => {
    expect(isPayeeActive(basePayee)).toBe(true);
  });

  it('returns false for inactive payees', () => {
    expect(isPayeeActive({ ...basePayee, status: 'inactive' })).toBe(false);
  });
});
