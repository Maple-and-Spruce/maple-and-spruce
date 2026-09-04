import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAllIds: vi.fn(),
  createIfAbsent: vi.fn(),
  fetchAllSubmissions: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  LessonInquiryRepository: {
    findAllIds: mocks.findAllIds,
    createIfAbsent: mocks.createIfAbsent,
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
      unmappable: 0,
      failedForms: [],
    });
  });

  it('does not read Firestore either', async () => {
    // The schedule runs every 15 minutes; a full read of the inquiry
    // collection to answer a question with no forms to ask is pure waste.
    await runSyncLessonInquiries(config);

    expect(mocks.findAllIds).not.toHaveBeenCalled();
  });

  it('still reads and ingests when a form IS configured', async () => {
    // The opt-out must not have disabled the feature for prod.
    mocks.findAllIds.mockResolvedValue(new Set<string>());
    mocks.fetchAllSubmissions.mockResolvedValue({
      questions: [],
      submissions: [],
    });

    await runSyncLessonInquiries({ ...config, formIds: ['QKQb6k'] });

    expect(mocks.findAllIds).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAllSubmissions).toHaveBeenCalledTimes(1);
  });
});
