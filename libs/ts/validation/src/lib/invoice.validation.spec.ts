import { describe, it, expect } from 'vitest';
import { invoiceValidation } from './invoice.validation';
import type { CreateInvoiceInput, InvoiceLineItem } from '@maple/ts/domain';

const validLine = (overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: 'line-1',
  description: 'April tuition',
  quantity: 1,
  unitAmountCents: 13000,
  subtotalCents: 13000,
  ...overrides,
});

const validInvoice: CreateInvoiceInput = {
  studentId: 'student-1',
  status: 'draft',
  lineItems: [validLine()],
};

describe('invoiceValidation', () => {
  describe('valid data', () => {
    it('passes with required fields + one line', () => {
      const result = invoiceValidation(validInvoice);
      expect(result.isValid()).toBe(true);
    });

    it('passes with multiple lines', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [
          validLine({ id: 'a' }),
          validLine({ id: 'b', quantity: 2 }),
          validLine({ id: 'c', description: 'Lesson makeup' }),
        ],
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes when status is omitted (server defaults to draft)', () => {
      const result = invoiceValidation({
        ...validInvoice,
        status: undefined,
      });
      expect(result.isValid()).toBe(true);
    });

    it('passes with a notes field under the cap', () => {
      const result = invoiceValidation({
        ...validInvoice,
        notes: 'Mailed receipt on 4/20',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('studentId', () => {
    it('fails when missing', () => {
      const result = invoiceValidation({ ...validInvoice, studentId: '' });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('studentId')).toContain('Student is required');
    });
  });

  describe('status', () => {
    it('rejects unknown status values', () => {
      const result = invoiceValidation({
        ...validInvoice,
        status: 'pending' as 'draft',
      });
      expect(result.isValid()).toBe(false);
    });

    it.each(['draft', 'sent', 'paid', 'void'] as const)(
      'accepts %s',
      (status) => {
        const result = invoiceValidation({ ...validInvoice, status });
        expect(result.hasErrors('status')).toBe(false);
      }
    );
  });

  describe('lineItems', () => {
    it('fails when empty', () => {
      const result = invoiceValidation({ ...validInvoice, lineItems: [] });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('lineItems')).toContain(
        'At least one line item is required'
      );
    });

    it('fails when a line has a blank description', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [validLine({ description: '' })],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('lineItems')).toContain(
        'Each line item must have a description'
      );
    });

    it('fails when a line has zero quantity', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [validLine({ quantity: 0 })],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('lineItems')).toContain(
        'Line item quantity must be > 0'
      );
    });

    it('fails when a line has negative unit amount', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [validLine({ unitAmountCents: -100 })],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('lineItems')).toContain(
        'Line item unit amount must be >= 0 (in cents)'
      );
    });

    it('allows zero unit amount (e.g., makeup lesson)', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [validLine({ unitAmountCents: 0 })],
      });
      expect(result.isValid()).toBe(true);
    });

    it('fails when a line has a blank id', () => {
      const result = invoiceValidation({
        ...validInvoice,
        lineItems: [validLine({ id: '' })],
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('lineItems')).toContain(
        'Line item id must be set'
      );
    });
  });

  describe('notes', () => {
    it('fails when > 2000 characters', () => {
      const result = invoiceValidation({
        ...validInvoice,
        notes: 'a'.repeat(2001),
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('notes')).toContain(
        'Notes must be less than 2000 characters'
      );
    });
  });
});
