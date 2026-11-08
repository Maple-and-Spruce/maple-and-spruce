import { describe, it, expect } from 'vitest';
import {
  giftCardPurchaseValidation,
  type GiftCardPurchaseValidationInput,
} from './gift-card-purchase.validation';

const valid: GiftCardPurchaseValidationInput = {
  kind: 'amount',
  amountCents: 5000,
  buyerName: 'Robin Ashfield',
  buyerEmail: 'robin@example.com',
  recipientName: 'Olive Thompson',
  recipientEmail: 'olive@example.com',
  message: 'Happy birthday!',
  deliverTo: 'recipient',
  sourceId: 'cnon:card-nonce-ok',
  idempotencyKey: 'a1b2c3d4-e5f6-7890',
};

function errorsFor(input: GiftCardPurchaseValidationInput): Record<string, string[]> {
  return giftCardPurchaseValidation(input).getErrors();
}

describe('giftCardPurchaseValidation', () => {
  it('passes a dollar card sent to the recipient', () => {
    expect(giftCardPurchaseValidation(valid).hasErrors()).toBe(false);
  });

  it('passes a class certificate sent to the buyer with no recipient', () => {
    const result = giftCardPurchaseValidation({
      ...valid,
      kind: 'class',
      amountCents: undefined,
      classId: 'class-1',
      deliverTo: 'buyer',
      recipientName: undefined,
      recipientEmail: undefined,
      message: undefined,
    });
    expect(result.hasErrors()).toBe(false);
  });

  it.each([900, 50100, 2550, undefined])('refuses amount %s', (amountCents) => {
    expect(errorsFor({ ...valid, amountCents })).toHaveProperty('amountCents');
  });

  it('ignores the amount for a class certificate', () => {
    const errors = errorsFor({ ...valid, kind: 'class', amountCents: 1, classId: 'c' });
    expect(errors).not.toHaveProperty('amountCents');
  });

  it('needs a class type (or an old class link) for a class certificate', () => {
    expect(errorsFor({ ...valid, kind: 'class', classId: '' })).toHaveProperty('classCategoryId');
    expect(errorsFor({ ...valid, kind: 'class', classCategoryId: 'cat-pottery' })).not.toHaveProperty(
      'classCategoryId'
    );
    expect(errorsFor({ ...valid, kind: 'class', classId: 'class-1' })).not.toHaveProperty(
      'classCategoryId'
    );
  });

  it('checks the amount against the limits from Settings (#309)', () => {
    const limits = { minCents: 500, maxCents: 100000 };
    const at = (amountCents: number) =>
      giftCardPurchaseValidation({ ...valid, amountCents }, undefined, limits).getErrors();
    expect(at(500)).not.toHaveProperty('amountCents');
    expect(at(75000)).not.toHaveProperty('amountCents');
    expect(at(100100)['amountCents']).toEqual([
      'Choose a whole-dollar amount from $5 to $1000',
    ]);
  });

  it('defaults to $10 to $500 without limits', () => {
    expect(errorsFor({ ...valid, amountCents: 900 })['amountCents']).toEqual([
      'Choose a whole-dollar amount from $10 to $500',
    ]);
  });

  it('refuses an unknown kind', () => {
    expect(errorsFor({ ...valid, kind: 'other' })).toHaveProperty('kind');
  });

  it('needs the buyer name and a valid buyer email', () => {
    const errors = errorsFor({ ...valid, buyerName: ' ', buyerEmail: 'nope' });
    expect(errors).toHaveProperty('buyerName');
    expect(errors).toHaveProperty('buyerEmail');
  });

  it('needs a recipient email to send it to them', () => {
    expect(errorsFor({ ...valid, recipientEmail: '' })).toHaveProperty('recipientEmail');
  });

  it('does not need a recipient email to send it to the buyer', () => {
    expect(
      errorsFor({ ...valid, deliverTo: 'buyer', recipientEmail: '' })
    ).not.toHaveProperty('recipientEmail');
  });

  it('checks a recipient email that was given', () => {
    expect(
      errorsFor({ ...valid, deliverTo: 'buyer', recipientEmail: 'nope' })
    ).toHaveProperty('recipientEmail');
  });

  it('refuses an unknown delivery choice', () => {
    expect(errorsFor({ ...valid, deliverTo: 'post' })).toHaveProperty('deliverTo');
  });

  it('caps the message at 300 characters', () => {
    expect(errorsFor({ ...valid, message: 'a'.repeat(300) })).not.toHaveProperty('message');
    expect(errorsFor({ ...valid, message: 'a'.repeat(301) })).toHaveProperty('message');
  });

  it('caps names at 100 characters', () => {
    const errors = errorsFor({
      ...valid,
      buyerName: 'a'.repeat(101),
      recipientName: 'a'.repeat(101),
    });
    expect(errors).toHaveProperty('buyerName');
    expect(errors).toHaveProperty('recipientName');
  });

  it('needs card details and a well-formed key', () => {
    const errors = errorsFor({ ...valid, sourceId: '', idempotencyKey: 'bad key!' });
    expect(errors).toHaveProperty('sourceId');
    expect(errors).toHaveProperty('idempotencyKey');
  });

  it('validates one field on its own', () => {
    const result = giftCardPurchaseValidation({ ...valid, buyerEmail: 'nope' }, 'buyerName');
    expect(result.hasErrors()).toBe(false);
  });
});
