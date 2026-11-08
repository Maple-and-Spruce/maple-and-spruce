import { describe, expect, it } from 'vitest';
import {
  issueGiftCardValidation,
  markClassCertificateValidation,
} from './gift-card-admin.validation';

const validIssue = {
  kind: 'amount',
  amountCents: 2500,
  reason: 'Raffle prize',
  idempotencyKey: 'issue-abc12345',
};

describe('issueGiftCardValidation', () => {
  it('passes a dollar amount with a reason', () => {
    expect(issueGiftCardValidation(validIssue).hasErrors()).toBe(false);
  });

  it('passes a class type with a value', () => {
    const result = issueGiftCardValidation({
      kind: 'class',
      classCategoryId: 'cat-pottery',
      valueCents: 6500,
      reason: 'Instructor thank-you',
      recipientName: 'Olive Thompson',
      fromName: 'Maple & Spruce',
      message: 'Thank you!',
      idempotencyKey: 'issue-abc12345',
    });
    expect(result.hasErrors()).toBe(false);
  });

  it.each([400, 50100, 2550, undefined])('refuses an amount of %s', (amountCents) => {
    const result = issueGiftCardValidation({ ...validIssue, amountCents });
    expect(result.getErrors('amountCents')).toEqual([
      'Enter whole dollars from $5 to $500',
    ]);
  });

  it('needs a class type and a value for a class certificate', () => {
    const result = issueGiftCardValidation({ ...validIssue, kind: 'class', amountCents: undefined });
    expect(result.getErrors('classCategoryId')).toEqual(['Choose a class type']);
    expect(result.getErrors('valueCents')).toHaveLength(1);
    expect(result.hasErrors('amountCents')).toBe(false);
  });

  it('refuses an unknown kind', () => {
    expect(issueGiftCardValidation({ ...validIssue, kind: 'cash' }).hasErrors('kind')).toBe(true);
  });

  it('needs a reason of 3 to 200 characters', () => {
    expect(issueGiftCardValidation({ ...validIssue, reason: '' }).getErrors('reason')).toContain(
      'Say why the studio is giving this card'
    );
    expect(issueGiftCardValidation({ ...validIssue, reason: '  ab  ' }).getErrors('reason')).toEqual([
      'Use at least 3 characters',
    ]);
    expect(
      issueGiftCardValidation({ ...validIssue, reason: 'x'.repeat(201) }).getErrors('reason')
    ).toEqual(['Keep the reason to 200 characters']);
    expect(issueGiftCardValidation({ ...validIssue, reason: 'x'.repeat(200) }).hasErrors()).toBe(
      false
    );
  });

  it('limits names and the note', () => {
    const result = issueGiftCardValidation({
      ...validIssue,
      recipientName: 'x'.repeat(101),
      fromName: 'x'.repeat(101),
      message: 'x'.repeat(301),
    });
    expect(result.hasErrors('recipientName')).toBe(true);
    expect(result.hasErrors('fromName')).toBe(true);
    expect(result.hasErrors('message')).toBe(true);
  });

  it('needs a well-formed idempotency key', () => {
    expect(
      issueGiftCardValidation({ ...validIssue, idempotencyKey: 'short' }).hasErrors('idempotencyKey')
    ).toBe(true);
    expect(
      issueGiftCardValidation({ ...validIssue, idempotencyKey: undefined }).hasErrors('idempotencyKey')
    ).toBe(true);
  });

  it('checks only the named field when asked', () => {
    const result = issueGiftCardValidation({ reason: '' }, 'reason');
    expect(result.hasErrors('reason')).toBe(true);
    expect(result.hasErrors('kind')).toBe(false);
  });
});

describe('markClassCertificateValidation', () => {
  it('passes a card and a class type', () => {
    expect(
      markClassCertificateValidation({ giftCardId: 'gc-1', classCategoryId: 'cat-1' }).hasErrors()
    ).toBe(false);
  });

  it('needs both', () => {
    const result = markClassCertificateValidation({});
    expect(result.getErrors('giftCardId')).toEqual(['Gift card id is required']);
    expect(result.getErrors('classCategoryId')).toEqual(['Choose a class type']);
  });

  it('limits the note', () => {
    expect(
      markClassCertificateValidation({
        giftCardId: 'gc-1',
        classCategoryId: 'cat-1',
        message: 'x'.repeat(301),
      }).getErrors('message')
    ).toEqual(['Keep the note to 300 characters']);
  });
});
