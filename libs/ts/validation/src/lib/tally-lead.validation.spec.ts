import { describe, it, expect } from 'vitest';
import { tallyLeadValidation } from './tally-lead.validation';

describe('tallyLeadValidation', () => {
  it('passes with just an email', () => {
    const result = tallyLeadValidation({ email: 'hello@example.com' });
    expect(result.isValid()).toBe(true);
  });

  it('passes with email plus full attribution context', () => {
    const result = tallyLeadValidation({
      email: 'hello@example.com',
      gaClientId: '1234567890.0987654321',
      fbp: 'fb.1.1700000000000.1234567890',
      fbc: 'fb.1.1700000000000.AbCdEfGhIj',
      utmSource: 'instagram',
      utmMedium: 'social',
      utmCampaign: 'spring-classes',
      referrer: 'https://www.instagram.com/',
      landingPage: 'https://mapleandsprucewv.com/classes',
    });
    expect(result.isValid()).toBe(true);
  });

  it('fails when email is missing', () => {
    const result = tallyLeadValidation({});
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('email')).toContain('Email is required');
  });

  it('fails when email is blank', () => {
    const result = tallyLeadValidation({ email: '   ' });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('email')).toContain('Email is required');
  });

  it('fails when email is malformed', () => {
    const result = tallyLeadValidation({ email: 'not-an-email' });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('email')).toContain('Email must be valid');
  });
});
