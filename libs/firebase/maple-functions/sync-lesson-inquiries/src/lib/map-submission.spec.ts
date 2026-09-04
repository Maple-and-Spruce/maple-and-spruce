/**
 * The fixtures here are the **real** shapes returned by the Tally submissions
 * API (captured from `dWPQOr` and `0QPRq9`, with contact details replaced).
 * That matters: the webhook body and the API response are different shapes, and
 * mapping this against the webhook's `{ key, label, type, value }` fields —
 * which is the obvious guess — produces a mapper that compiles, passes an
 * invented fixture, and captures nothing in production.
 */
import { describe, it, expect } from 'vitest';
import { formNameFor, mapSubmission } from './map-submission';
import type { TallyQuestion, TallySubmission } from './map-submission';

const NOW = new Date('2026-09-10T12:00:00Z');

/** `dWPQOr` — the general music form on /music and /music-lessons. */
const GENERAL_QUESTIONS: TallyQuestion[] = [
  { id: '0EKjV0', type: 'INPUT_TEXT', label: 'Parent or Student Name' },
  { id: 'zKkQE8', type: 'INPUT_EMAIL', label: 'Email' },
  { id: '5dJqXP', type: 'INPUT_PHONE_NUMBER', label: 'Phone Number' },
  { id: 'AJXEjl', type: 'HIDDEN_FIELDS', label: null },
  {
    id: 'dYO2by',
    type: 'MULTI_SELECT',
    label: 'Which instrument are you interested in?',
  },
  { id: 'YZ1zj6', type: 'MULTIPLE_CHOICE', label: 'Who is the student?' },
  { id: 'DVjvqj', type: 'MULTIPLE_CHOICE', label: 'Experience level' },
];

const GENERAL_SUBMISSION: TallySubmission = {
  id: '1W61AML',
  isCompleted: true,
  submittedAt: '2026-08-26T03:42:50.000Z',
  responses: [
    { questionId: 'dYO2by', answer: ['Old-Time Fiddle'] },
    { questionId: 'YZ1zj6', answer: ['My child (under 18)'] },
    { questionId: '0EKjV0', answer: 'Casey Rivers ' },
    { questionId: 'zKkQE8', answer: 'casey@example.com' },
    { questionId: '5dJqXP', answer: '+13015550142' },
    { questionId: 'DVjvqj', answer: ['Complete beginner'] },
  ],
};

/** `QKQb6k` — the Suzuki funnel from /suzuki. */
const SUZUKI_QUESTIONS: TallyQuestion[] = [
  { id: 'hid', type: 'HIDDEN_FIELDS', label: null },
  { id: 'q1', type: 'INPUT_TEXT', label: 'Your name' },
  { id: 'q2', type: 'INPUT_EMAIL', label: 'Email' },
  { id: 'q3', type: 'INPUT_PHONE_NUMBER', label: 'Phone' },
  { id: 'q4', type: 'INPUT_TEXT', label: "Student's first name" },
  { id: 'q5', type: 'INPUT_NUMBER', label: "Student's age" },
  {
    id: 'q6',
    type: 'MULTIPLE_CHOICE',
    label: 'Which would you like to start with?',
  },
  {
    id: 'q7',
    type: 'CHECKBOXES',
    label: 'When could you generally come in?',
  },
  {
    id: 'q8',
    type: 'MULTIPLE_CHOICE',
    label: 'Will you be using the West Virginia Hope Scholarship?',
  },
  { id: 'q9', type: 'TEXTAREA', label: 'Anything you would like us to know?' },
];

function suzukiSubmission(
  responses: Array<{ questionId: string; answer: unknown }>
): TallySubmission {
  return {
    id: 'sub-1',
    isCompleted: true,
    submittedAt: '2026-09-08T14:00:00.000Z',
    responses,
  };
}

const FULL_SUZUKI_RESPONSES = [
  { questionId: 'q1', answer: 'Dana Fields' },
  { questionId: 'q2', answer: 'dana@example.com' },
  { questionId: 'q3', answer: '+13045550101' },
  { questionId: 'q4', answer: 'Rowan' },
  { questionId: 'q5', answer: '6' },
  { questionId: 'q6', answer: ['Suzuki violin, with Katie'] },
  {
    questionId: 'q7',
    answer: ['Weekday afternoons, after school', 'Saturday morning'],
  },
  { questionId: 'q8', answer: ['Yes'] },
  { questionId: 'q9', answer: 'We already own a 1/8 violin.' },
];

describe('mapSubmission — Suzuki form', () => {
  it('maps every question the Suzuki funnel asks', () => {
    const mapped = mapSubmission(
      suzukiSubmission(FULL_SUZUKI_RESPONSES),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );

    expect(mapped).toMatchObject({
      id: 'sub-1',
      formId: 'QKQb6k',
      formName: 'Suzuki interview request',
      contactName: 'Dana Fields',
      email: 'dana@example.com',
      phone: '+13045550101',
      studentFirstName: 'Rowan',
      studentAge: 6,
      interest: 'Suzuki violin, with Katie',
      availability: ['Weekday afternoons, after school', 'Saturday morning'],
      hopeScholarship: 'yes',
      message: 'We already own a 1/8 violin.',
    });
    expect(mapped?.submittedAt.toISOString()).toBe('2026-09-08T14:00:00.000Z');
  });

  it.each([
    [['Yes'], 'yes'],
    [['No'], 'no'],
    [['Not sure, tell me more'], 'unsure'],
  ] as const)('reads the Hope answer %s as %s', (answer, expected) => {
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q2', answer: 'dana@example.com' },
        { questionId: 'q8', answer: [...answer] },
      ]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );
    expect(mapped?.hopeScholarship).toBe(expected);
  });

  it('leaves Hope unset rather than guessing when the answer is unrecognised', () => {
    // Better a blank field than telling Katie a family is on Hope when they are not.
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q2', answer: 'dana@example.com' },
        { questionId: 'q8', answer: ['Maybe next year'] },
      ]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );
    expect(mapped?.hopeScholarship).toBeUndefined();
  });

  it('drops an implausible age instead of putting a typo on the card', () => {
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q2', answer: 'dana@example.com' },
        { questionId: 'q5', answer: '600' },
      ]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );
    expect(mapped?.studentAge).toBeUndefined();
  });
});

describe('mapSubmission — general music form', () => {
  it('captures the shared form, whose questions are labelled differently', () => {
    // dWPQOr asks none of the Suzuki questions and names the contact field
    // "Parent or Student Name". It must still produce a usable lead.
    const mapped = mapSubmission(
      GENERAL_SUBMISSION,
      GENERAL_QUESTIONS,
      'dWPQOr',
      NOW
    );

    expect(mapped).toMatchObject({
      id: '1W61AML',
      formName: 'Music lesson inquiry',
      contactName: 'Casey Rivers',
      email: 'casey@example.com',
      phone: '+13015550142',
      interest: 'Old-Time Fiddle',
      availability: [],
    });
    expect(mapped?.studentAge).toBeUndefined();
    expect(mapped?.hopeScholarship).toBeUndefined();
  });
});

describe('mapSubmission — hidden fields', () => {
  it('reads attribution from the HIDDEN_FIELDS answer object', () => {
    // Hidden fields arrive as ONE object under a question whose label is null,
    // so it can only be found by type. This is the shape the newsletter form
    // actually returns.
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q2', answer: 'dana@example.com' },
        {
          questionId: 'hid',
          answer: {
            _ga_client_id: '63622066.1784769097',
            _fbp: 'fb.1.1784769097865.578938659255002689',
            utm_source: 'fb',
            utm_medium: 'paid',
            utm_campaign: '52519195659843',
            utm_content: '52530536887843',
            utm_term: '52519195660043',
            // Facebook's mobile web referrer really is cleartext http, and this
            // is a verbatim captured value. It is inert data the mapper copies,
            // never a URL anything connects to, so the protocol rule does not
            // apply — and rewriting it to https would make the fixture a
            // fiction, which is the one thing these fixtures must not be.
            // eslint-disable-next-line sonarjs/no-clear-text-protocols
            referrer: 'http://m.facebook.com/',
            landing_page: 'https://mapleandsprucefolkarts.com/suzuki',
          },
        },
      ]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );

    expect(mapped?.attribution).toEqual({
      utmSource: 'fb',
      utmMedium: 'paid',
      utmCampaign: '52519195659843',
      utmContent: '52530536887843',
      utmTerm: '52519195660043',
      // eslint-disable-next-line sonarjs/no-clear-text-protocols -- asserting the captured value above passes through verbatim
      referrer: 'http://m.facebook.com/',
      landingPage: 'https://mapleandsprucefolkarts.com/suzuki',
    });
  });

  it('treats an empty hidden field as absent, not as an empty string', () => {
    // Tally posts every hidden field; unfilled ones arrive as ''.
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q2', answer: 'dana@example.com' },
        { questionId: 'hid', answer: { utm_source: '', referrer: 'direct' } },
      ]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );
    expect(mapped?.attribution.utmSource).toBeUndefined();
    expect(mapped?.attribution.referrer).toBe('direct');
  });

  it('survives a submission with no hidden fields at all', () => {
    const mapped = mapSubmission(
      GENERAL_SUBMISSION,
      GENERAL_QUESTIONS,
      'dWPQOr',
      NOW
    );
    expect(mapped?.attribution).toEqual({
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
      utmContent: undefined,
      utmTerm: undefined,
      referrer: undefined,
      landingPage: undefined,
    });
  });
});

describe('mapSubmission — skips', () => {
  it('skips a submission with no email, because there is nothing to reply to', () => {
    expect(
      mapSubmission(
        suzukiSubmission([{ questionId: 'q1', answer: 'Dana Fields' }]),
        SUZUKI_QUESTIONS,
        'QKQb6k',
        NOW
      )
    ).toBeNull();
  });

  it('skips a submission with no id, because the id is what makes ingest idempotent', () => {
    expect(
      mapSubmission(
        { id: '', responses: [{ questionId: 'q2', answer: 'a@example.com' }] },
        SUZUKI_QUESTIONS,
        'QKQb6k',
        NOW
      )
    ).toBeNull();
  });

  it('skips a partial submission', () => {
    expect(
      mapSubmission(
        {
          ...suzukiSubmission([{ questionId: 'q2', answer: 'a@example.com' }]),
          isCompleted: false,
        },
        SUZUKI_QUESTIONS,
        'QKQb6k',
        NOW
      )
    ).toBeNull();
  });

  it('still captures the lead when only the email is answered', () => {
    // Detail is nice; existence is the point. A sparse lead still needs to
    // reach the queue so a human can chase it.
    const mapped = mapSubmission(
      suzukiSubmission([{ questionId: 'q2', answer: 'dana@example.com' }]),
      SUZUKI_QUESTIONS,
      'QKQb6k',
      NOW
    );
    expect(mapped).not.toBeNull();
    expect(mapped?.contactName).toBe('Unknown');
  });
});

describe('label matching', () => {
  it('tolerates capitalisation and punctuation drift in a question label', () => {
    // Labels are edited by a human in a web UI. "Your Name" must not silently
    // stop mapping.
    const questions: TallyQuestion[] = [
      { id: 'q1', type: 'INPUT_TEXT', label: 'Your  Name' },
      { id: 'q2', type: 'INPUT_EMAIL', label: 'Email' },
    ];
    const mapped = mapSubmission(
      suzukiSubmission([
        { questionId: 'q1', answer: 'Dana Fields' },
        { questionId: 'q2', answer: 'dana@example.com' },
      ]),
      questions,
      'QKQb6k',
      NOW
    );
    expect(mapped?.contactName).toBe('Dana Fields');
  });

  it('finds email by type even when the label is unrecognisable', () => {
    const questions: TallyQuestion[] = [
      {
        id: 'q2',
        type: 'INPUT_EMAIL',
        label: 'Share your email for Music Together news',
      },
    ];
    const mapped = mapSubmission(
      suzukiSubmission([{ questionId: 'q2', answer: 'dana@example.com' }]),
      questions,
      'QKQb6k',
      NOW
    );
    expect(mapped?.email).toBe('dana@example.com');
  });
});

describe('formNameFor', () => {
  it('names the forms we know', () => {
    expect(formNameFor('QKQb6k')).toBe('Suzuki interview request');
    expect(formNameFor('dWPQOr')).toBe('Music lesson inquiry');
  });

  it('falls back to the id for an unknown form rather than throwing', () => {
    expect(formNameFor('newForm')).toBe('newForm');
  });

  it('does not resolve inherited Object properties as form names', () => {
    expect(formNameFor('constructor')).toBe('constructor');
    expect(formNameFor('toString')).toBe('toString');
  });
});
