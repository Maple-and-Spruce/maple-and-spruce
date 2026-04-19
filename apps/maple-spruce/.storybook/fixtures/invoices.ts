import type { Invoice, InvoiceLineItem } from '@maple/ts/domain';

const NOW = new Date('2026-05-01T10:00:00Z');

const aprilTuition: InvoiceLineItem = {
  id: 'line-april-tuition',
  description: 'April tuition',
  quantity: 4,
  unitAmountCents: 3250,
  subtotalCents: 13000,
};

export const mockInvoiceDraft: Invoice = {
  id: 'inv-001',
  studentId: 'student-001',
  status: 'draft',
  lineItems: [aprilTuition],
  totalCents: 13000,
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockInvoiceSent: Invoice = {
  id: 'inv-002',
  studentId: 'student-001',
  status: 'sent',
  lineItems: [aprilTuition],
  totalCents: 13000,
  issuedAt: new Date('2026-04-21T09:00:00Z'),
  createdAt: new Date('2026-04-20T09:00:00Z'),
  updatedAt: new Date('2026-04-21T09:00:00Z'),
};

export const mockInvoicePaid: Invoice = {
  id: 'inv-003',
  studentId: 'student-001',
  status: 'paid',
  lineItems: [aprilTuition],
  totalCents: 13000,
  issuedAt: new Date('2026-03-21T09:00:00Z'),
  paidAt: new Date('2026-03-25T09:00:00Z'),
  createdAt: new Date('2026-03-20T09:00:00Z'),
  updatedAt: new Date('2026-03-25T09:00:00Z'),
};

export const mockInvoiceVoid: Invoice = {
  id: 'inv-004',
  studentId: 'student-001',
  status: 'void',
  lineItems: [aprilTuition],
  totalCents: 13000,
  issuedAt: new Date('2026-02-21T09:00:00Z'),
  createdAt: new Date('2026-02-20T09:00:00Z'),
  updatedAt: new Date('2026-02-28T09:00:00Z'),
};

export const mockInvoiceMultiLine: Invoice = {
  id: 'inv-005',
  studentId: 'student-001',
  status: 'draft',
  lineItems: [
    {
      id: 'line-a',
      description: 'April tuition',
      quantity: 4,
      unitAmountCents: 3250,
      subtotalCents: 13000,
    },
    {
      id: 'line-b',
      description: 'Makeup lesson — April 26',
      quantity: 1,
      unitAmountCents: 3250,
      subtotalCents: 3250,
    },
    {
      id: 'line-c',
      description: 'Recital fee',
      quantity: 1,
      unitAmountCents: 2500,
      subtotalCents: 2500,
    },
  ],
  totalCents: 18750,
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockInvoices: Invoice[] = [
  mockInvoiceDraft,
  mockInvoiceSent,
  mockInvoicePaid,
  mockInvoiceVoid,
  mockInvoiceMultiLine,
];
