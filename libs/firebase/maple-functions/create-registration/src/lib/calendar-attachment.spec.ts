import { describe, expect, it } from 'vitest';
import { confirmationCalendarAttachments } from './calendar-attachment';

const CLASS = {
  name: 'Wheel Throwing',
  sessions: [
    { dateTime: new Date('2030-05-21T22:00:00.000Z') },
    { dateTime: new Date('2030-05-14T22:00:00.000Z') },
  ],
  durationMinutes: 120,
  location: 'Maple & Spruce',
};

describe('confirmationCalendarAttachments', () => {
  it('attaches one class.ics holding every session', () => {
    const [attachment, ...rest] = confirmationCalendarAttachments(
      CLASS,
      'MS-TEST1'
    );
    expect(rest).toEqual([]);
    expect(attachment.filename).toBe('class.ics');
    expect(attachment.contentType).toContain('text/calendar');
    expect(attachment.content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(attachment.content).toContain('DTSTART:20300514T220000Z');
    expect(attachment.content).toContain('DTSTART:20300521T220000Z');
    expect(attachment.content).toContain('UID:MS-TEST1-1@');
  });

  it('uses just the booked hour for a private-hours class', () => {
    const [attachment] = confirmationCalendarAttachments(
      { ...CLASS, durationMinutes: 60, format: 'privateHours' },
      'MS-TEST2',
      '2030-05-21T23:00:00.000Z'
    );
    expect(attachment.content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(attachment.content).toContain('DTSTART:20300521T230000Z');
    expect(attachment.content).toContain('DTEND:20300522T000000Z');
  });

  it('ignores a slot on a class that is not private hours', () => {
    const [attachment] = confirmationCalendarAttachments(
      CLASS,
      'MS-TEST3',
      '2030-05-21T23:00:00.000Z'
    );
    expect(attachment.content.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('attaches nothing for a class with no sessions', () => {
    expect(
      confirmationCalendarAttachments({ ...CLASS, sessions: [] }, 'MS-TEST4')
    ).toEqual([]);
  });
});
