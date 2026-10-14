import { describe, it, expect } from 'vitest';
import {
  INBOX_ROW_CAP,
  inboxAgeText,
  inboxAgo,
  inboxDoneLabel,
  inboxFooterText,
  inboxKindLabel,
  inboxSummarySuffix,
  inboxTone,
  inboxUntil,
  visibleInboxItems,
} from './inbox-view';
import { FIXTURE_NOW, fixtureInboxItems } from './dashboard-fixtures';

const NOW = FIXTURE_NOW;
const minus = (ms: number) => new Date(NOW.getTime() - ms);
const plus = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('inboxAgo', () => {
  it.each([
    [10_000, 'Just now'],
    [MIN, '1 minute ago'],
    [12 * MIN, '12 minutes ago'],
    [HOUR, '1 hour ago'],
    [2 * HOUR, '2 hours ago'],
    [30 * HOUR, 'Yesterday'],
    [3 * DAY, '3 days ago'],
    [20 * DAY, '2 weeks ago'],
  ])('%i ms ago reads "%s"', (ms, text) => {
    expect(inboxAgo(minus(ms), NOW)).toBe(text);
  });
});

describe('inboxUntil', () => {
  it.each([
    [-MIN, 'Class now'],
    [20 * MIN, 'Class in 20 minutes'],
    [HOUR, 'Class in 1 hour'],
    [8 * HOUR, 'Class in 8 hours'],
    [30 * HOUR, 'Class tomorrow'],
    [3 * DAY, 'Class in 3 days'],
  ])('%i ms ahead reads "%s"', (ms, text) => {
    expect(inboxUntil(plus(ms), NOW)).toBe(text);
  });
});

describe('row text', () => {
  it('uses the deadline when there is one, else the age', () => {
    const [charge, agreement] = fixtureInboxItems;
    expect(inboxAgeText(charge, NOW)).toBe('Yesterday');
    expect(inboxAgeText(agreement, NOW)).toBe('Class in 3 hours');
  });

  it('labels kinds and names the check button for a screen reader', () => {
    expect(inboxKindLabel('agreement-unsigned')).toBe('Agreement unsigned');
    expect(inboxDoneLabel(fixtureInboxItems[0])).toBe(
      'Mark done: Charge failed, Iris Calloway · $35'
    );
  });

  it('colours by family', () => {
    expect(inboxTone('lesson-inquiry')).toBe('inquiry');
    expect(inboxTone('lesson-inquiries-older')).toBe('inquiry');
    expect(inboxTone('charge-failed')).toBe('failure');
    expect(inboxTone('invoice-sync-failed')).toBe('failure');
    expect(inboxTone('craft-club-past-due')).toBe('failure');
    expect(inboxTone('agreement-unsigned')).toBe('deadline');
    expect(inboxTone('craft-club-requested')).toBe('quiet');
    expect(inboxTone('sync-conflicts')).toBe('quiet');
  });
});

describe('capping and counts', () => {
  it(`shows ${INBOX_ROW_CAP} rows and counts the rest`, () => {
    const { rows, hidden } = visibleInboxItems(fixtureInboxItems);
    expect(rows).toHaveLength(4);
    expect(hidden).toBe(3);
    expect(visibleInboxItems(fixtureInboxItems.slice(0, 2)).hidden).toBe(0);
  });

  it('says how many more, or nothing', () => {
    expect(inboxFooterText(3)).toBe('3 more in the inbox');
    expect(inboxFooterText(0)).toBe('');
  });

  it('adds the inbox to the header line only when there is something in it', () => {
    expect(inboxSummarySuffix(7)).toBe(' · 7 in the inbox');
    expect(inboxSummarySuffix(0)).toBe('');
  });
});
