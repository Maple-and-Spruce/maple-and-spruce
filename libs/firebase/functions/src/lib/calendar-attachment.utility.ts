/**
 * The .ics attached to a class confirmation email.
 *
 * Mail clients turn it into an "Add to Calendar" option (Apple Mail and Gmail
 * show it on the message), which works however the buyer checked out, including
 * from Chrome on an iPhone, where the confirmation page's .ics download can't
 * reach Apple Calendar.
 */
import {
  buildClassIcs,
  classCalendarEntries,
  isPrivateHoursClass,
  type Class,
} from '@maple/ts/domain';

/** Nodemailer attachment, as the Trigger Email extension passes it through. */
export interface MailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export function confirmationCalendarAttachments(
  classEntity: Pick<
    Class,
    'name' | 'sessions' | 'durationMinutes' | 'location' | 'format'
  >,
  confirmationNumber: string,
  slotStart?: string
): MailAttachment[] {
  const entries = classCalendarEntries({
    name: classEntity.name,
    sessions: classEntity.sessions ?? [],
    durationMinutes: classEntity.durationMinutes,
    location: classEntity.location,
    confirmationNumber,
    // A private hour is the one hour booked, not every open hour.
    slotStart:
      slotStart && isPrivateHoursClass(classEntity) ? slotStart : undefined,
  });
  if (entries.length === 0) return [];
  return [
    {
      filename: 'class.ics',
      content: buildClassIcs(entries),
      contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
    },
  ];
}
