import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAllBySubmissionId: vi.fn(),
  createIfAbsent: vi.fn(),
  refreshIngestedFields: vi.fn(),
  fetchAllSubmissions: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  LessonInquiryRepository: {
    findAllBySubmissionId: mocks.findAllBySubmissionId,
    createIfAbsent: mocks.createIfAbsent,
    refreshIngestedFields: mocks.refreshIngestedFields,
  },
}));

vi.mock('./tally-client', () => ({
  fetchAllSubmissions: mocks.fetchAllSubmissions,
}));

// The module defines an admin-callable twin at import time; stub the builder
// so importing it here doesn't need the real functions runtime.
vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    usingSecrets: () => endpoint,
    usingStrings: () => endpoint,
    requiringRole: () => endpoint,
    handle: () => 'mock-fn',
  };
  return { Functions: { endpoint }, Role: { Admin: 'admin' } };
});

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: () => 'mock-schedule',
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => 'tly-test' }),
  defineString: (name: string, opts?: { default?: string }) => ({
    name,
    value: () => opts?.default ?? '',
  }),
}));

import {
  parseFormIds,
  runSyncLessonInquiries,
} from './sync-lesson-inquiries';

describe('parseFormIds', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseFormIds('QKQb6k, dWPQOr')).toEqual(['QKQb6k', 'dWPQOr']);
  });

  it('is empty for an empty value — how dev opts out', () => {
    expect(parseFormIds('')).toEqual([]);
    expect(parseFormIds('   ')).toEqual([]);
  });

  it('drops stray separators rather than yielding blank form ids', () => {
    expect(parseFormIds(',,QKQb6k,,')).toEqual(['QKQb6k']);
  });
});

describe('runSyncLessonInquiries — no forms configured', () => {
  beforeEach(() => vi.clearAllMocks());

  const config = { baseUrl: 'https://api.tally.so', apiKey: 'tly-test', formIds: [] };

  it('THE POINT: ingests nothing, so dev never copies production PII', async () => {
    // There is one Tally workspace, so any real form id is a production form.
    // Dev sets TALLY_LESSON_INQUIRY_FORM_IDS empty; this asserts that actually
    // means "call Tally zero times".
    const result = await runSyncLessonInquiries(config);

    expect(mocks.fetchAllSubmissions).not.toHaveBeenCalled();
    expect(mocks.createIfAbsent).not.toHaveBeenCalled();
    expect(result).toEqual({
      seen: 0,
      created: 0,
      skipped: 0,
      repaired: 0,
      unmappable: 0,
      failedForms: [],
    });
  });

  it('does not read Firestore either', async () => {
    // The schedule runs every 15 minutes; a full read of the inquiry
    // collection to answer a question with no forms to ask is pure waste.
    await runSyncLessonInquiries(config);

    expect(mocks.findAllBySubmissionId).not.toHaveBeenCalled();
  });

  it('still reads and ingests when a form IS configured', async () => {
    // The opt-out must not have disabled the feature for prod.
    mocks.findAllBySubmissionId.mockResolvedValue(new Map());
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: [],
      submissions: [],
    });

    await runSyncLessonInquiries({ ...config, formIds: ['QKQb6k'] });

    expect(mocks.findAllBySubmissionId).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllSubmissions).toHaveBeenCalledTimes(1);
  });
});

/**
 * REPAIRING ROWS THAT ARE ALREADY STORED (#816)
 *
 * `createIfAbsent` made "already stored" mean "never written again", which is
 * what protected Katie's statuses — and what froze 14 leads at
 * `contactName: "Unknown"` where no mapper fix could reach them.
 *
 * The document is now split by writer: Tally owns the answers, the portal owns
 * the workflow. These tests pin both halves of that, because getting either
 * wrong is worse than the bug — never writing leaves the queue broken, and
 * writing too much silently resets leads Katie has already worked.
 */
describe('runSyncLessonInquiries — repairing stored inquiries', () => {
  beforeEach(() => vi.clearAllMocks());

  const config = {
    baseUrl: 'https://api.tally.so',
    apiKey: 'tly-test',
    formIds: ['dWPQOr'],
  };

  const QUESTIONS = [
    { id: 'q-name', type: 'INPUT_TEXT', title: 'Parent or Student Name' },
    { id: 'q-email', type: 'INPUT_EMAIL', title: 'Email' },
    {
      id: 'q-instrument',
      type: 'MULTI_SELECT',
      title: 'Which instrument are you interested in?',
    },
  ];

  const SUBMISSION = {
    id: 'sub-1',
    isCompleted: true,
    submittedAt: '2026-08-26T03:42:50.000Z',
    responses: [
      { questionId: 'q-name', answer: 'Lace Haggerty' },
      { questionId: 'q-email', answer: 'lace@example.com' },
      { questionId: 'q-instrument', answer: ['Old-Time Fiddle'] },
    ],
  };

  /** A row as the broken ingest left it: contactable, but nameless. */
  const brokenStoredRow = () => ({
    id: 'sub-1',
    formId: 'dWPQOr',
    formName: 'Music lesson inquiry',
    submittedAt: new Date('2026-08-26T03:42:50.000Z'),
    contactName: 'Unknown',
    email: 'lace@example.com',
    interest: undefined,
    availability: [],
    attribution: {},
    status: 'contacted' as const,
    followUpNote: 'Called her Tuesday',
    createdAt: new Date('2026-09-04T19:45:01.892Z'),
    updatedAt: new Date('2026-09-04T19:45:01.892Z'),
  });

  it('THE POINT: rewrites a stored lead whose name never mapped', async () => {
    mocks.findAllBySubmissionId.mockResolvedValue(
      new Map([['sub-1', brokenStoredRow()]])
    );
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: QUESTIONS,
      submissions: [SUBMISSION],
    });
    mocks.refreshIngestedFields.mockResolvedValue({
      ...brokenStoredRow(),
      contactName: 'Lace Haggerty',
    });

    const result = await runSyncLessonInquiries(config);

    expect(mocks.refreshIngestedFields).toHaveBeenCalledTimes(1);
    expect(mocks.refreshIngestedFields.mock.calls[0][0]).toMatchObject({
      id: 'sub-1',
      contactName: 'Lace Haggerty',
      interest: 'Old-Time Fiddle',
    });
    expect(result.repaired).toBe(1);
    expect(result.created).toBe(0);
  });

  it('NEVER hands the repair a status, studentId or followUpNote', async () => {
    // The whole reason ingestion used create() was to keep a run from resetting
    // an enrolled lead. Repair must not reopen that hole: the payload it writes
    // has to carry answers only, so the portal's fields cannot be touched even
    // by accident.
    mocks.findAllBySubmissionId.mockResolvedValue(
      new Map([['sub-1', brokenStoredRow()]])
    );
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: QUESTIONS,
      submissions: [SUBMISSION],
    });
    mocks.refreshIngestedFields.mockResolvedValue(brokenStoredRow());

    await runSyncLessonInquiries(config);

    const payload = mocks.refreshIngestedFields.mock.calls[0][0];
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('studentId');
    expect(payload).not.toHaveProperty('followUpNote');
  });

  it('writes nothing at all when the stored row already matches', async () => {
    // Steady state. Without this guard the schedule would rewrite every lead
    // every 15 minutes and fight the portal for the row.
    mocks.findAllBySubmissionId.mockResolvedValue(
      new Map([
        [
          'sub-1',
          {
            ...brokenStoredRow(),
            contactName: 'Lace Haggerty',
            interest: 'Old-Time Fiddle',
          },
        ],
      ])
    );
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: QUESTIONS,
      submissions: [SUBMISSION],
    });

    const result = await runSyncLessonInquiries(config);

    expect(mocks.refreshIngestedFields).not.toHaveBeenCalled();
    expect(mocks.createIfAbsent).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.repaired).toBe(0);
  });

  it('keeps walking pages while stale rows remain, then stops', async () => {
    // The stop condition is what decides whether repair can reach anything
    // older than the newest page. "Known" is not enough — it has to be
    // "known and already correct", or the 14 broken rows stay broken.
    mocks.findAllBySubmissionId.mockResolvedValue(
      new Map([['sub-1', brokenStoredRow()]])
    );
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: QUESTIONS,
      submissions: [],
    });

    await runSyncLessonInquiries(config);

    const shouldStop = mocks.fetchAllSubmissions.mock.calls[0][2];
    expect(shouldStop({ submissions: [SUBMISSION] })).toBe(false);
  });
});
