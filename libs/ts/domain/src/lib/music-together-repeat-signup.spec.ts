import { describe, expect, it } from 'vitest';
import {
  MT_ALREADY_ENROLLED_MESSAGE,
  MT_SIGNUP_IN_PROGRESS_MESSAGE,
  MT_SIGNUP_IN_PROGRESS_MS,
  findMtRepeatSignup,
  isMtAlreadyEnrolledMessage,
  isMtSignupInProgressMessage,
  type MtEarlierSignup,
} from './music-together-repeat-signup';

const NOW = new Date('2030-09-01T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000);

const confirmed = (
  overrides: Partial<MtEarlierSignup> = {}
): MtEarlierSignup => ({
  email: 'parent@example.com',
  status: 'confirmed',
  createdAt: minutesAgo(60 * 24),
  children: [{ name: 'Olive' }],
  ...overrides,
});

const request = (
  overrides: Partial<Parameters<typeof findMtRepeatSignup>[1]> = {}
) => ({
  email: 'parent@example.com',
  children: [{ name: 'Olive' }],
  ...overrides,
});

describe('findMtRepeatSignup', () => {
  it('lets a family with no earlier signup through', () => {
    expect(findMtRepeatSignup([], request(), NOW)).toBeNull();
  });

  it('ignores other families in the section', () => {
    expect(
      findMtRepeatSignup(
        [confirmed({ email: 'someone-else@example.com' })],
        request(),
        NOW
      )
    ).toBeNull();
  });

  it('refuses the same child again by the same email, case and spacing aside', () => {
    expect(
      findMtRepeatSignup(
        [confirmed({ children: [{ name: 'olive ' }] })],
        request({ email: ' Parent@Example.com', children: [{ name: 'Olive' }] }),
        NOW
      )
    ).toBe('already-enrolled');
  });

  it('refuses when any one child overlaps', () => {
    expect(
      findMtRepeatSignup(
        [confirmed()],
        request({ children: [{ name: 'Milo' }, { name: 'Olive' }] }),
        NOW
      )
    ).toBe('already-enrolled');
  });

  it('lets a sibling sign up later with the same email', () => {
    expect(
      findMtRepeatSignup([confirmed()], request({ children: [{ name: 'Milo' }] }), NOW)
    ).toBeNull();
  });

  it('lets the family register the same child again when they choose to', () => {
    expect(
      findMtRepeatSignup([confirmed()], request({ registerAgain: true }), NOW)
    ).toBeNull();
  });

  it('refuses anything by that email while a payment is still going through, even when asked to register again or for another child', () => {
    const pending = confirmed({ status: 'pending', createdAt: minutesAgo(1) });
    expect(findMtRepeatSignup([pending], request(), NOW)).toBe('in-progress');
    expect(
      findMtRepeatSignup(
        [pending],
        request({ registerAgain: true, children: [{ name: 'Milo' }] }),
        NOW
      )
    ).toBe('in-progress');
  });

  it('treats a pending signup with no timestamp as still going through', () => {
    expect(
      findMtRepeatSignup(
        [confirmed({ status: 'pending', createdAt: undefined })],
        request({ children: [{ name: 'Milo' }] }),
        NOW
      )
    ).toBe('in-progress');
  });

  it('treats a pending signup cut off long ago like a confirmed one', () => {
    const stale = confirmed({
      status: 'pending',
      createdAt: new Date(NOW.getTime() - MT_SIGNUP_IN_PROGRESS_MS),
    });
    expect(findMtRepeatSignup([stale], request(), NOW)).toBe('already-enrolled');
    expect(
      findMtRepeatSignup([stale], request({ children: [{ name: 'Milo' }] }), NOW)
    ).toBeNull();
    expect(
      findMtRepeatSignup([stale], request({ registerAgain: true }), NOW)
    ).toBeNull();
  });

  it('copes with an earlier signup missing its children', () => {
    expect(
      findMtRepeatSignup([confirmed({ children: null })], request(), NOW)
    ).toBeNull();
  });
});

describe('message recognisers', () => {
  it('recognise their own message, also with a status code appended', () => {
    expect(isMtAlreadyEnrolledMessage(MT_ALREADY_ENROLLED_MESSAGE)).toBe(true);
    expect(isMtSignupInProgressMessage(`${MT_SIGNUP_IN_PROGRESS_MESSAGE} (409)`)).toBe(
      true
    );
  });

  it('do not confuse the two, or another error', () => {
    expect(isMtAlreadyEnrolledMessage(MT_SIGNUP_IN_PROGRESS_MESSAGE)).toBe(false);
    expect(isMtSignupInProgressMessage(MT_ALREADY_ENROLLED_MESSAGE)).toBe(false);
    expect(isMtAlreadyEnrolledMessage('This section is full.')).toBe(false);
  });
});
