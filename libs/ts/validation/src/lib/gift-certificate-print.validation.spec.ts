import { describe, expect, it } from 'vitest';
import { printGiftCertificatesValidation } from './gift-certificate-print.validation';

const amount = {
  kind: 'amount',
  amountCents: 2500,
  quantity: 10,
  design: 'stained-glass',
  idempotencyKey: 'print-1234abcd',
};

describe('printGiftCertificatesValidation', () => {
  it('accepts a batch of dollar certificates', () => {
    expect(printGiftCertificatesValidation(amount).hasErrors()).toBe(false);
  });

  it('accepts a batch of class certificates without an amount', () => {
    const result = printGiftCertificatesValidation({
      kind: 'class',
      classCategoryId: 'cat-glass',
      quantity: 1,
      design: 'stained-glass',
      idempotencyKey: 'print-1234abcd',
    });
    expect(result.hasErrors()).toBe(false);
  });

  it.each([
    ['kind', { kind: 'other' }],
    ['amountCents', { amountCents: 2550 }],
    ['amountCents', { amountCents: 400 }],
    ['amountCents', { amountCents: 50100 }],
    ['quantity', { quantity: 0 }],
    ['quantity', { quantity: 51 }],
    ['quantity', { quantity: 1.5 }],
    ['design', { design: 'pottery' }],
    ['idempotencyKey', { idempotencyKey: 'short' }],
  ])('refuses a bad %s', (field, over) => {
    const result = printGiftCertificatesValidation({ ...amount, ...over });
    expect(result.getErrors()[field]?.length).toBeGreaterThan(0);
  });

  it('needs a class type for a class batch', () => {
    const result = printGiftCertificatesValidation({
      ...amount,
      kind: 'class',
      classCategoryId: '',
    });
    expect(result.getErrors()['classCategoryId']).toEqual(['Choose a class type']);
    expect(result.getErrors()['amountCents']).toBeUndefined();
  });

  it('does not carry errors from one run into the next', () => {
    printGiftCertificatesValidation({ ...amount, quantity: 0 });
    expect(printGiftCertificatesValidation(amount).hasErrors()).toBe(false);
  });
});
