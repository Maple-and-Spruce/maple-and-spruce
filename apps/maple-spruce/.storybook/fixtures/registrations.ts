import type { Registration } from '@maple/ts/domain';

export const mockRegistrationConfirmed: Registration = {
  id: 'reg-001',
  classId: 'class-001',
  customerEmail: 'jane.doe@example.com',
  customerName: 'Jane Doe',
  customerPhone: '304-555-1234',
  quantity: 1,
  pricePaidCents: 7500,
  squarePaymentId: 'sq-pay-abc123',
  status: 'confirmed',
  notes: 'Please let me know about parking.',
  createdAt: new Date('2024-08-01T14:30:00Z'),
  updatedAt: new Date('2024-08-01T14:30:00Z'),
};

export const mockRegistrationPending: Registration = {
  id: 'reg-002',
  classId: 'class-001',
  customerEmail: 'john.smith@example.com',
  customerName: 'John Smith',
  quantity: 2,
  pricePaidCents: 13500,
  discountCode: 'SAVE10',
  discountAmountCents: 1500,
  status: 'pending',
  createdAt: new Date('2024-08-02T10:00:00Z'),
  updatedAt: new Date('2024-08-02T10:00:00Z'),
};

export const mockRegistrationCancelled: Registration = {
  id: 'reg-003',
  classId: 'class-002',
  customerEmail: 'alice.johnson@example.com',
  customerName: 'Alice Johnson',
  quantity: 1,
  pricePaidCents: 4500,
  squarePaymentId: 'sq-pay-def456',
  status: 'cancelled',
  notes: 'Cancelled due to scheduling conflict.',
  createdAt: new Date('2024-07-15T09:00:00Z'),
  updatedAt: new Date('2024-07-20T11:00:00Z'),
};

export const mockRegistrationRefunded: Registration = {
  id: 'reg-004',
  classId: 'class-002',
  customerEmail: 'bob.wilson@example.com',
  customerName: 'Bob Wilson',
  quantity: 1,
  pricePaidCents: 4500,
  squarePaymentId: 'sq-pay-ghi789',
  status: 'refunded',
  createdAt: new Date('2024-07-10T16:00:00Z'),
  updatedAt: new Date('2024-07-22T08:00:00Z'),
};

export const mockRegistrations: Registration[] = [
  mockRegistrationConfirmed,
  mockRegistrationPending,
  mockRegistrationCancelled,
  mockRegistrationRefunded,
];
