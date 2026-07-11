import { describe, it, expect } from 'vitest';
import {
  musicTogetherRegistrationValidation,
  type MusicTogetherRegistrationValidationInput,
} from './music-together-registration.validation';

const valid: MusicTogetherRegistrationValidationInput = {
  sectionId: 'sec-1',
  adultFirstName: 'Jamie',
  adultLastName: 'Rivera',
  parentNames: ['Jamie Rivera'],
  children: [{ name: 'Sky', dob: new Date('2023-04-01') }],
  email: 'jamie@example.com',
  phone: '304-555-1212',
  address: '123 Spruce St, Morgantown, WV',
  paymentPlan: 'full',
  policiesAccepted: true,
  privacyConsent: true,
};

describe('musicTogetherRegistrationValidation', () => {
  it('passes a complete full-pay registration', () => {
    expect(musicTogetherRegistrationValidation(valid).hasErrors()).toBe(false);
  });

  it('requires a section', () => {
    const r = musicTogetherRegistrationValidation({ ...valid, sectionId: '' });
    expect(r.hasErrors('sectionId')).toBe(true);
  });

  it('requires at least one parent name', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      parentNames: ['  '],
    });
    expect(r.hasErrors('parentNames')).toBe(true);
  });

  it("requires the adult's first and last name", () => {
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        adultFirstName: '',
      }).hasErrors('adultFirstName')
    ).toBe(true);
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        adultLastName: '  ',
      }).hasErrors('adultLastName')
    ).toBe(true);
  });

  it('requires at least one child', () => {
    const r = musicTogetherRegistrationValidation({ ...valid, children: [] });
    expect(r.hasErrors('children')).toBe(true);
  });

  it('rejects more than three children', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      children: [
        { name: 'A', dob: '2020-01-01' },
        { name: 'B', dob: '2021-01-01' },
        { name: 'C', dob: '2022-01-01' },
        { name: 'D', dob: '2023-01-01' },
      ],
    });
    expect(r.hasErrors('children')).toBe(true);
  });

  it('accepts exactly three children', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      children: [
        { name: 'A', dob: '2020-01-01' },
        { name: 'B', dob: '2021-01-01' },
        { name: 'C', dob: '2022-01-01' },
      ],
    });
    expect(r.hasErrors('children')).toBe(false);
  });

  it('requires privacy-notice consent', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      privacyConsent: false,
    });
    expect(r.hasErrors('privacyConsent')).toBe(true);
  });

  it('requires each child to have a name and valid DOB', () => {
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        children: [{ name: '', dob: new Date('2023-04-01') }],
      }).hasErrors('children')
    ).toBe(true);
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        children: [{ name: 'Sky', dob: 'not-a-date' }],
      }).hasErrors('children')
    ).toBe(true);
  });

  it('rejects a future date of birth', () => {
    const future = new Date(Date.now() + 86_400_000);
    const r = musicTogetherRegistrationValidation({
      ...valid,
      children: [{ name: 'Sky', dob: future }],
    });
    expect(r.hasErrors('children')).toBe(true);
  });

  it('accepts an ISO-string DOB', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      children: [{ name: 'Sky', dob: '2023-04-01' }],
    });
    expect(r.hasErrors('children')).toBe(false);
  });

  it('validates email and phone format', () => {
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        email: 'nope',
      }).hasErrors('email')
    ).toBe(true);
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        phone: 'abc',
      }).hasErrors('phone')
    ).toBe(true);
  });

  it('requires policies acceptance', () => {
    const r = musicTogetherRegistrationValidation({
      ...valid,
      policiesAccepted: false,
    });
    expect(r.hasErrors('policiesAccepted')).toBe(true);
  });

  it('requires card-on-file auth only for installments', () => {
    // installments without auth → error
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        paymentPlan: 'installments',
        cardOnFileAuth: false,
      }).hasErrors('cardOnFileAuth')
    ).toBe(true);
    // installments with auth → ok
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        paymentPlan: 'installments',
        cardOnFileAuth: true,
      }).hasErrors('cardOnFileAuth')
    ).toBe(false);
    // full pay doesn't require it
    expect(
      musicTogetherRegistrationValidation({
        ...valid,
        paymentPlan: 'full',
        cardOnFileAuth: false,
      }).hasErrors('cardOnFileAuth')
    ).toBe(false);
  });

  it('supports partial single-field validation', () => {
    // Only validating email: a blank section must not register an error.
    const r = musicTogetherRegistrationValidation(
      { email: 'jamie@example.com' },
      'email'
    );
    expect(r.hasErrors('email')).toBe(false);
    expect(r.hasErrors('sectionId')).toBe(false);
  });
});
