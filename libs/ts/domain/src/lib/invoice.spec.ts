import { describe, it, expect } from 'vitest';
import {
  computeInvoiceTotalCents,
  computeLineSubtotal,
  isInvoiceDeletable,
  isInvoiceStatusTransitionAllowed,
  type Invoice,
  type InvoiceLineItem,
  type InvoiceStatus,
} from './invoice';

describe('Invoice domain helpers', () => {
  describe('computeLineSubtotal', () => {
    it('multiplies quantity by unit amount', () => {
      expect(
        computeLineSubtotal({ quantity: 4, unitAmountCents: 3250 })
      ).toBe(13000);
    });

    it('rounds fractional cents to nearest', () => {
      // 1.5 × 333 = 499.5 → 500
      expect(
        computeLineSubtotal({ quantity: 1.5, unitAmountCents: 333 })
      ).toBe(500);
    });

    it('handles zero quantity and zero unit amount', () => {
      expect(
        computeLineSubtotal({ quantity: 0, unitAmountCents: 5000 })
      ).toBe(0);
      expect(
        computeLineSubtotal({ quantity: 3, unitAmountCents: 0 })
      ).toBe(0);
    });
  });

  describe('computeInvoiceTotalCents', () => {
    it('returns 0 for an empty line list', () => {
      expect(computeInvoiceTotalCents([])).toBe(0);
    });

    it('sums subtotals across lines', () => {
      const lines = [
        { quantity: 4, unitAmountCents: 3250 }, // 13000
        { quantity: 1, unitAmountCents: 500 }, // 500
        { quantity: 2, unitAmountCents: 5875 }, // 11750
      ];
      expect(computeInvoiceTotalCents(lines)).toBe(25250);
    });
  });

  describe('isInvoiceStatusTransitionAllowed', () => {
    type Case = { from: InvoiceStatus; to: InvoiceStatus; allowed: boolean };
    const cases: Case[] = [
      // Same status is a no-op
      { from: 'draft', to: 'draft', allowed: true },
      { from: 'sent', to: 'sent', allowed: true },
      { from: 'paid', to: 'paid', allowed: true },
      { from: 'void', to: 'void', allowed: true },
      // From draft
      { from: 'draft', to: 'sent', allowed: true },
      { from: 'draft', to: 'void', allowed: true },
      { from: 'draft', to: 'paid', allowed: false },
      // From sent
      { from: 'sent', to: 'paid', allowed: true },
      { from: 'sent', to: 'void', allowed: true },
      { from: 'sent', to: 'draft', allowed: true }, // clawback before paid
      // From paid (refund = void)
      { from: 'paid', to: 'void', allowed: true },
      { from: 'paid', to: 'draft', allowed: false },
      { from: 'paid', to: 'sent', allowed: false },
      // Void is terminal
      { from: 'void', to: 'draft', allowed: false },
      { from: 'void', to: 'sent', allowed: false },
      { from: 'void', to: 'paid', allowed: false },
    ];

    it.each(cases)(
      '$from → $to is $allowed',
      ({ from, to, allowed }) => {
        expect(isInvoiceStatusTransitionAllowed(from, to)).toBe(allowed);
      }
    );
  });

  describe('isInvoiceDeletable', () => {
    const base: Pick<Invoice, 'status'> = { status: 'draft' };
    it('returns true for a draft invoice', () => {
      expect(isInvoiceDeletable(base)).toBe(true);
    });

    it.each(['sent', 'paid', 'void'] as const)(
      'returns false for %s',
      (status) => {
        expect(isInvoiceDeletable({ status })).toBe(false);
      }
    );
  });

  describe('type shape sanity', () => {
    it('accepts an invoice with line items and computed total', () => {
      const line: InvoiceLineItem = {
        id: 'line-1',
        description: 'April tuition',
        quantity: 1,
        unitAmountCents: 13000,
        subtotalCents: 13000,
      };
      const invoice: Invoice = {
        id: 'inv-1',
        studentId: 'student-1',
        status: 'draft',
        lineItems: [line],
        totalCents: 13000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(invoice.lineItems[0].subtotalCents).toBe(13000);
    });
  });
});
