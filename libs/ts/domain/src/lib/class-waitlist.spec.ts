import { describe, it, expect } from 'vitest';
import { waitlistEntriesForHour, type ClassWaitlistEntry } from './class-waitlist';

const HOUR_A = new Date('2030-12-07T18:00:00Z');
const HOUR_B = new Date('2030-12-07T19:00:00Z');

function entry(
  id: string,
  email: string,
  slotStart?: Date | string
): ClassWaitlistEntry {
  return {
    id,
    classId: 'class-1',
    email,
    slotStart: slotStart as Date | undefined,
    createdAt: new Date('2030-11-01T00:00:00Z'),
  };
}

describe('waitlistEntriesForHour', () => {
  it('returns entries for that hour and entries for any hour', () => {
    const forA = entry('a', 'robin@example.com', HOUR_A);
    const any = entry('b', 'sam@example.com');
    const result = waitlistEntriesForHour([forA, any], HOUR_A);
    expect(result).toEqual([forA, any]);
  });

  it('leaves out entries waiting on a different hour', () => {
    const forB = entry('b', 'sam@example.com', HOUR_B);
    expect(waitlistEntriesForHour([forB], HOUR_A)).toEqual([]);
  });

  it('matches the hour by instant, not by object identity', () => {
    const forA = entry('a', 'robin@example.com', new Date(HOUR_A.getTime()));
    expect(waitlistEntriesForHour([forA], new Date(HOUR_A.getTime()))).toEqual([
      forA,
    ]);
  });

  it('accepts a slotStart that arrives as an ISO string', () => {
    const forA = entry('a', 'robin@example.com', HOUR_A.toISOString());
    expect(waitlistEntriesForHour([forA], HOUR_A)).toEqual([forA]);
  });

  it('keeps one entry per address, ignoring case and whitespace', () => {
    const forA = entry('a', 'Robin@Example.com', HOUR_A);
    const any = entry('b', '  robin@example.com ');
    const result = waitlistEntriesForHour([forA, any], HOUR_A);
    expect(result).toEqual([forA]);
  });

  it('does not let a different-hour entry hide the same address', () => {
    const forB = entry('b', 'robin@example.com', HOUR_B);
    const any = entry('c', 'robin@example.com');
    expect(waitlistEntriesForHour([forB, any], HOUR_A)).toEqual([any]);
  });

  it('returns an empty list for no entries', () => {
    expect(waitlistEntriesForHour([], HOUR_A)).toEqual([]);
  });
});
