/**
 * Unit tests for the pure helpers in tallyLeadWebhook.
 *
 * The fan-out itself (signature gate, GA4 + Meta beacons, partial failure) is
 * covered against real emulators in
 * apps/functions-integration-tests-tally-lead-webhook. What's tested here is
 * the routing logic that decides WHICH Meta dataset a lead belongs to and
 * WHETHER it deduplicates against the browser Pixel — get either wrong and the
 * failure is silent: leads land in the wrong ad account, or every signup is
 * counted twice.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FORM_ATTRIBUTION,
  extractLead,
  leadEventId,
  resolveFormAttribution,
} from './tally-lead-webhook';

describe('resolveFormAttribution', () => {
  it('routes the Maple & Spruce signup form to the Maple & Spruce dataset', () => {
    expect(resolveFormAttribution('0QPRq9')).toEqual({
      formName: 'email-signup',
      audience: 'maple-spruce',
    });
  });

  it('routes the Music Together signup form to the Music Together dataset', () => {
    expect(resolveFormAttribution('q4Qj8d')).toEqual({
      formName: 'music-together-updates',
      audience: 'music-together',
    });
  });

  it('falls back to Maple & Spruce for an unknown form rather than dropping the lead', () => {
    expect(resolveFormAttribution('someNewForm')).toEqual(
      DEFAULT_FORM_ATTRIBUTION
    );
    expect(DEFAULT_FORM_ATTRIBUTION.audience).toBe('maple-spruce');
  });

  it('falls back when Tally omits the form id', () => {
    expect(resolveFormAttribution(undefined)).toEqual(DEFAULT_FORM_ATTRIBUTION);
    expect(resolveFormAttribution('')).toEqual(DEFAULT_FORM_ATTRIBUTION);
  });

  it('does not resolve inherited Object properties as forms', () => {
    // A `Record` lookup keyed by attacker-influenced input would otherwise
    // return Object.prototype members for ids like "constructor".
    expect(resolveFormAttribution('constructor')).toEqual(
      DEFAULT_FORM_ATTRIBUTION
    );
    expect(resolveFormAttribution('toString')).toEqual(
      DEFAULT_FORM_ATTRIBUTION
    );
  });

  it('never reports a Music Together lead under the Maple & Spruce list name', () => {
    const mt = resolveFormAttribution('q4Qj8d');
    expect(mt.formName).not.toBe(DEFAULT_FORM_ATTRIBUTION.formName);
  });
});

describe('leadEventId', () => {
  it('prefixes the Tally submission id so both halves agree on one key', () => {
    // `Nqbzlrl` is a real submission: the browser postMessage reported it as
    // `payload.id` and the Tally API as the submission id.
    expect(leadEventId('Nqbzlrl')).toBe('tally-Nqbzlrl');
  });

  it('returns undefined when Tally omits the submission id', () => {
    // Meta then counts the server event on its own — a possible double-count,
    // which is better than dropping the conversion entirely.
    expect(leadEventId(undefined)).toBeUndefined();
    expect(leadEventId('')).toBeUndefined();
  });
});

describe('extractLead', () => {
  const hidden = (label: string, value: string) => ({
    label,
    type: 'HIDDEN_FIELDS',
    value,
  });

  it('pulls the email and full attribution context out of the hidden fields', () => {
    const lead = extractLead({
      data: {
        submissionId: 'sub-1',
        formId: 'q4Qj8d',
        fields: [
          {
            label: 'Share your email for Music Together news',
            type: 'INPUT_EMAIL',
            value: 'parent@example.com',
          },
          hidden('_ga_client_id', '734707527.1783299447'),
          hidden('_fbp', 'fb.2.1783299448705.66254947812422785'),
          hidden('utm_source', 'facebook'),
          hidden('utm_medium', 'paid'),
          hidden('landing_page', 'https://example.com/music-together'),
        ],
      },
    });

    expect(lead).toMatchObject({
      email: 'parent@example.com',
      gaClientId: '734707527.1783299447',
      fbp: 'fb.2.1783299448705.66254947812422785',
      utmSource: 'facebook',
      utmMedium: 'paid',
      landingPage: 'https://example.com/music-together',
    });
  });

  it('finds the email by field type, not by label', () => {
    // The MT form labels its email question differently from the M&S form, so
    // a label-only lookup would silently drop every MT lead at validation.
    const lead = extractLead({
      data: {
        fields: [
          {
            label: 'Share your email for Music Together news',
            type: 'INPUT_EMAIL',
            value: 'parent@example.com',
          },
        ],
      },
    });

    expect(lead.email).toBe('parent@example.com');
  });

  it('treats empty hidden fields as absent', () => {
    // Tally always posts every hidden field; unfilled ones arrive as ''.
    const lead = extractLead({
      data: {
        fields: [
          { label: 'Email', type: 'INPUT_EMAIL', value: 'a@example.com' },
          hidden('utm_source', ''),
          hidden('_fbc', ''),
        ],
      },
    });

    expect(lead.utmSource).toBeUndefined();
    expect(lead.fbc).toBeUndefined();
  });
});
