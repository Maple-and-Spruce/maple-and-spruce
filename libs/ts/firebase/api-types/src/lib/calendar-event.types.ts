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
// Delete Calendar Event
// ============================================================================

export interface DeleteCalendarEventRequest {
  id: string;
}

export interface DeleteCalendarEventResponse {
  success: boolean;
}
