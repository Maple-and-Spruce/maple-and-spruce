/**
 * Calendar Event API request/response types
 *
 * Types for Firebase Cloud Function calls related to calendar events.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  CalendarEvent,
  CalendarEventType,
  CreateCalendarEventInput,
  Room,
  UpdateCalendarEventInput,
} from '@maple/ts/domain';

// ============================================================================
// Get Calendar Events (Admin)
// ============================================================================

export interface GetCalendarEventsRequest {
  /** Optional type filter */
  type?: CalendarEventType;
  /** Only return public events */
  publicOnly?: boolean;
}

export interface GetCalendarEventsResponse {
  calendarEvents: CalendarEvent[];
}

// ============================================================================
// Get Calendar Event by ID
// ============================================================================

export interface GetCalendarEventRequest {
  id: string;
}

export interface GetCalendarEventResponse {
  calendarEvent: CalendarEvent;
}

// ============================================================================
// Create Calendar Event
// ============================================================================

export interface CreateCalendarEventRequest extends CreateCalendarEventInput {}

export interface CreateCalendarEventResponse {
  calendarEvent: CalendarEvent;
}

// ============================================================================
// Update Calendar Event
// ============================================================================

export interface UpdateCalendarEventRequest extends UpdateCalendarEventInput {}

export interface UpdateCalendarEventResponse {
  calendarEvent: CalendarEvent;
}

// ============================================================================
// Get Room Schedule
// ============================================================================

export interface GetRoomScheduleRequest {
  room: Room;
  /** ISO date string — start of the range (inclusive) */
  start: string;
  /** ISO date string — end of the range (exclusive) */
  end: string;
}

/**
 * Serialized busy window. Mirrors `RoomBusyWindow` from @maple/ts/domain
 * with ISO-string dates for the wire; clients re-hydrate with `new Date()`.
 */
export interface RoomScheduleWindow {
  eventId: string;
  title: string;
  type: CalendarEventType;
  sourceRef: string | null;
  /** ISO date string */
  start: string;
  /** ISO date string */
  end: string;
}

export interface GetRoomScheduleResponse {
  windows: RoomScheduleWindow[];
}

// ============================================================================
// Delete Calendar Event
// ============================================================================

export interface DeleteCalendarEventRequest {
  id: string;
}

export interface DeleteCalendarEventResponse {
  success: boolean;
}
