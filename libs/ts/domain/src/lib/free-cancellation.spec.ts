import { describe, it, expect } from 'vitest';
import {
  CANCEL_PAGE_URL,
  cancelPageUrl,
  cancellationAnchor,
  formatFreeCancellationDeadline,
  freeCancellationDeadline,
  freeCancellationUntil,
  hasOpenCancellationRequest,
  normalizeConfirmationNumber,
} from './free-cancellation';

describe('cancellationAnchor', () => {
  it('is the earliest session, whatever the order', () => {
    expect(
      cancellationAnchor([
        { dateTime: '2026-12-12T15:00:00.000Z' },
        { dateTime: new Date('2026-12-05T15:00:00.000Z') },
      ])
    ).toEqual(new Date('2026-12-05T15:00:00.000Z'));
  });

  it('is the booked hour for a private group', () => {
    expect(
      cancellationAnchor(
        [{ dateTime: '2026-12-05T15:00:00.000Z' }],
        '2026-12-06T18:00:00.000Z'
      )
    ).toEqual(new Date('2026-12-06T18:00:00.000Z'));
  });

  it('is undefined with no usable session', () => {
    expect(cancellationAnchor([])).toBeUndefined();
    expect(cancellationAnchor([{ dateTime: 'not a date' }])).toBeUndefined();
  });
});

describe('freeCancellationDeadline', () => {
  it('is two weeks before, at the same time of day', () => {
    // Sat Dec 5 2026, 10:00 AM Eastern.
    expect(freeCancellationDeadline(new Date('2026-12-05T15:00:00.000Z'))).toEqual(
      new Date('2026-11-21T15:00:00.000Z')
    );
  });

  it('keeps the clock time across the Nov 1 clock change', () => {
    // Sat Nov 7 2026, 10:00 AM EST (UTC-5) → Sat Oct 24, 10:00 AM EDT (UTC-4).
    expect(freeCancellationDeadline(new Date('2026-11-07T15:00:00.000Z'))).toEqual(
      new Date('2026-10-24T14:00:00.000Z')
    );
  });

  it('keeps the clock time across the Mar 14 2027 clock change', () => {
    // Sat Mar 20 2027, 2:00 PM EDT → Sat Mar 6, 2:00 PM EST.
    expect(freeCancellationDeadline(new Date('2027-03-20T18:00:00.000Z'))).toEqual(
      new Date('2027-03-06T19:00:00.000Z')
    );
  });
});

describe('freeCancellationUntil', () => {
  const sessions = [{ dateTime: '2026-12-05T15:00:00.000Z' }];

  it('is the deadline while it is ahead', () => {
    expect(
      freeCancellationUntil({ sessions }, new Date('2026-11-21T14:59:00.000Z'))
    ).toEqual(new Date('2026-11-21T15:00:00.000Z'));
  });

  it('is undefined from the deadline on', () => {
    expect(
      freeCancellationUntil({ sessions }, new Date('2026-11-21T15:00:00.000Z'))
    ).toBeUndefined();
    expect(
      freeCancellationUntil({ sessions }, new Date('2026-12-01T00:00:00.000Z'))
    ).toBeUndefined();
  });

  it('counts from the booked hour, not the first hour', () => {
    expect(
      freeCancellationUntil(
        { sessions, slotStart: '2026-12-19T15:00:00.000Z' },
        new Date('2026-11-25T00:00:00.000Z')
      )
    ).toEqual(new Date('2026-12-05T15:00:00.000Z'));
  });

  it('is undefined for a class with no sessions', () => {
    expect(freeCancellationUntil({ sessions: [] }, new Date())).toBeUndefined();
  });
});

describe('formatFreeCancellationDeadline', () => {
  it('reads like Airbnb, in Eastern time', () => {
    expect(formatFreeCancellationDeadline(new Date('2026-11-21T15:00:00.000Z'))).toBe(
      'Sat, Nov 21 at 10:00 AM'
    );
    expect(formatFreeCancellationDeadline(new Date('2026-10-24T22:30:00.000Z'))).toBe(
      'Sat, Oct 24 at 6:30 PM'
    );
  });
});

describe('hasOpenCancellationRequest', () => {
  const at = new Date('2026-11-01T12:00:00.000Z');
  it('is open while asked and still confirmed', () => {
    expect(hasOpenCancellationRequest({ status: 'confirmed', cancellationRequestedAt: at })).toBe(true);
  });
  it('is closed once cancelled or refunded, or never asked', () => {
    expect(hasOpenCancellationRequest({ status: 'cancelled', cancellationRequestedAt: at })).toBe(false);
    expect(hasOpenCancellationRequest({ status: 'refunded', cancellationRequestedAt: at })).toBe(false);
    expect(hasOpenCancellationRequest({ status: 'confirmed' })).toBe(false);
  });
});

describe('normalizeConfirmationNumber', () => {
  it('ignores case and spaces', () => {
    expect(normalizeConfirmationNumber(' ms-ab c234 ')).toBe('MS-ABC234');
  });
  it('adds the MS- a customer left off', () => {
    expect(normalizeConfirmationNumber('abc234')).toBe('MS-ABC234');
  });
  it('leaves anything else as typed (uppercased)', () => {
    expect(normalizeConfirmationNumber('abc')).toBe('ABC');
    expect(normalizeConfirmationNumber('')).toBe('');
  });
});

describe('cancelPageUrl', () => {
  it('fills in the confirmation number', () => {
    expect(cancelPageUrl('MS-ABC234')).toBe(`${CANCEL_PAGE_URL}?confirmation=MS-ABC234`);
    expect(cancelPageUrl()).toBe(CANCEL_PAGE_URL);
  });
});
