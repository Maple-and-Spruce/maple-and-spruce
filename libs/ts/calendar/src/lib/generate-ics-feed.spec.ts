import { describe, it, expect } from 'vitest';
import { generateIcsFeed } from './generate-ics-feed';
import type { CalendarEvent } from '@maple/ts/domain';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Friday Night Old-Time Jam',
    description: 'Weekly jam session for all skill levels.',
    startDateTime: new Date('2030-06-14T23:00:00Z'), // 7pm ET
    endDateTime: new Date('2030-06-15T01:00:00Z'), // 9pm ET
    recurrenceRule: null,
    location: '688 Beulah Road, Morgantown, WV 26508',
    type: 'jam',
    public: true,
    sourceRef: null,
    createdBy: 'admin-123',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('generateIcsFeed', () => {
  it('generates valid ICS with BEGIN:VCALENDAR and END:VCALENDAR', () => {
    const ics = generateIcsFeed([], 'Test Calendar');

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('X-WR-CALNAME:Test Calendar');
  });

  it('includes timezone info', () => {
    const ics = generateIcsFeed([], 'Test Calendar');

    expect(ics).toContain('X-WR-TIMEZONE:America/New_York');
    expect(ics).toContain('X-PUBLISHED-TTL:PT5M');
  });

  it('includes VTIMEZONE component for strict parsers', () => {
    const events = [makeEvent()];
    const ics = generateIcsFeed(events, 'Test Calendar');

    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('TZID:America/New_York');
    expect(ics).toContain('END:VTIMEZONE');
  });

  it('generates VEVENT for each event', () => {
    const events = [
      makeEvent({ id: 'evt-1', title: 'Event One' }),
      makeEvent({ id: 'evt-2', title: 'Event Two' }),
    ];

    const ics = generateIcsFeed(events, 'Test Calendar');

    // Count VEVENT blocks
    const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(veventCount).toBe(2);

    expect(ics).toContain('SUMMARY:Event One');
    expect(ics).toContain('SUMMARY:Event Two');
  });

  it('includes event details', () => {
    const event = makeEvent({
      title: 'Store Hours',
      description: 'We are open!',
      location: '688 Beulah Road',
    });

    const ics = generateIcsFeed([event], 'Test');

    expect(ics).toContain('SUMMARY:Store Hours');
    expect(ics).toContain('DESCRIPTION:We are open!');
    expect(ics).toContain('LOCATION:688 Beulah Road');
  });

  it('includes RRULE for recurring events', () => {
    const event = makeEvent({
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=FR',
    });

    const ics = generateIcsFeed([event], 'Test');

    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
  });

  it('does not include RRULE for one-time events', () => {
    const event = makeEvent({ recurrenceRule: null });

    const ics = generateIcsFeed([event], 'Test');

    // Check within the VEVENT block only (VTIMEZONE has its own RRULE for DST)
    const veventBlock = ics.split('BEGIN:VEVENT')[1]?.split('END:VEVENT')[0] ?? '';
    expect(veventBlock).not.toContain('RRULE:');
  });

  it('includes source reference as custom property', () => {
    const event = makeEvent({
      sourceRef: 'classes/abc123',
    });

    const ics = generateIcsFeed([event], 'Test');

    expect(ics).toContain('X-MAPLE-SOURCE-REF:classes/abc123');
  });

  it('handles events without description or location', () => {
    const event = makeEvent({
      description: '',
      location: '',
    });

    const ics = generateIcsFeed([event], 'Test');

    // Check within the VEVENT block only (VTIMEZONE may contain location-like fields)
    const veventBlock = ics.split('BEGIN:VEVENT')[1]?.split('END:VEVENT')[0] ?? '';
    expect(veventBlock).toContain('SUMMARY:');
    expect(veventBlock).not.toContain('DESCRIPTION:');
    expect(veventBlock).not.toContain('LOCATION:');
  });

  it('returns proper content type string', () => {
    const ics = generateIcsFeed([], 'Test');

    // ICS files must start with BEGIN:VCALENDAR
    expect(ics.trimStart().startsWith('BEGIN:VCALENDAR')).toBe(true);
  });

  it('handles empty events array', () => {
    const ics = generateIcsFeed([], 'Empty Calendar');

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('includes prodId with Maple & Spruce', () => {
    const ics = generateIcsFeed([], 'Test');

    expect(ics).toContain('PRODID:');
    expect(ics).toContain('Maple & Spruce');
  });
});
