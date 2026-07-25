/**
 * Calendar Event domain types
 *
 * Represents events displayed on the public calendar and managed via the admin UI.
 * Events can be manually created (jams, store hours, ad-hoc events) or
 * auto-generated from other entities (classes, music lessons).
 */
import type { Room } from './room';

/**
 * Type of calendar event, used for filtering and color-coding on the public calendar.
 */
export type CalendarEventType =
  | 'class'
  | 'lesson'
  | 'event'
  | 'jam'
  | 'hours'
  | 'musictogether';

/**
 * All valid calendar event types for validation
 */
export const CALENDAR_EVENT_TYPES: CalendarEventType[] = [
  'class',
  'lesson',
  'event',
  'jam',
  'hours',
  'musictogether',
];

/**
 * Default location for events at the shop
 */
export const DEFAULT_EVENT_LOCATION = '688 Beulah Road, Morgantown, WV 26508';

/**
 * Calendar Event entity
 */
export interface CalendarEvent {
  id: string;
  /** Event title */
  title: string;
  /** Event description */
  description: string;
  /** Event start date and time */
  startDateTime: Date;
  /** Event end date and time */
  endDateTime: Date;
  /** RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=FR" for Friday Jam. Null for one-time events. */
  recurrenceRule: string | null;
  /** Event location (defaults to shop address) */
  location: string;
  /** Event type for filtering and color-coding */
  type: CalendarEventType;
  /** Controls inclusion in public ICS feeds. Default true. */
  public: boolean;
  /**
   * Which bookable room this event occupies, if any. Drives room
   * availability displays and conflict checks. Null/absent for events that
   * don't claim a room (e.g. store hours, off-site classes).
   */
  room?: Room | null;
  /** Optional reference to originating doc, e.g. "classes/abc123". Null for ad-hoc events. */
  sourceRef: string | null;
  /**
   * Instructor id that "owns" this event — denormalized from the source so a
   * teacher's own schedule is a single query (My Week / #683). Set on
   * lesson-derived events (the lesson's `teacherId`) and class-derived events
   * (the class's `instructorId`). Null for shared/ad-hoc events with no single
   * owning teacher (jams, store hours, Music Together, manual bookings).
   */
  ownerInstructorId?: string | null;
  /** Firebase Auth UID of creator */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new calendar event (no id or timestamps)
 */
export type CreateCalendarEventInput = Omit<
  CalendarEvent,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Input for updating a calendar event (all fields optional except id)
 */
export type UpdateCalendarEventInput = Partial<
  Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Human-readable label for a calendar event type
 */
export function getCalendarEventTypeLabel(type: CalendarEventType): string {
  const labels: Record<CalendarEventType, string> = {
    class: 'Class',
    lesson: 'Music Lesson',
    event: 'Event',
    jam: 'Jam Session',
    hours: 'Store Hours',
    musictogether: 'Music Together',
  };
  return labels[type];
}
