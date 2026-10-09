'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type {
  CalendarEvent,
  CalendarEventType,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  RequestState,
} from '@maple/ts/domain';
import type {
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
  CreateCalendarEventRequest,
  CreateCalendarEventResponse,
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse,
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Filters for fetching calendar events
 */
export interface UseCalendarEventsFilters {
  type?: CalendarEventType;
  publicOnly?: boolean;
}

/**
 * Hook for managing calendar event CRUD operations
 */
export function useCalendarEvents(filters?: UseCalendarEventsFilters) {
  const [calendarEventsState, setCalendarEventsState] = useState<
    RequestState<CalendarEvent[]>
  >({
    status: 'idle',
  });

  const fetchCalendarEvents = useCallback(async () => {
    setCalendarEventsState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getCalendarEvents = httpsCallableFromURL<
        GetCalendarEventsRequest,
        GetCalendarEventsResponse
      >(functions, routerCallableUrl('calendar', 'getCalendarEvents'));

      const result = await getCalendarEvents({
        type: filters?.type,
        publicOnly: filters?.publicOnly,
      });
      setCalendarEventsState({
        status: 'success',
        data: result.data.calendarEvents,
      });
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
      setCalendarEventsState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch calendar events',
      });
    }
  }, [filters?.type, filters?.publicOnly]);

  const createCalendarEvent = useCallback(
    async (input: CreateCalendarEventInput): Promise<CalendarEvent> => {
      const functions = getMapleFunctions();
      const create = httpsCallableFromURL<
        CreateCalendarEventRequest,
        CreateCalendarEventResponse
      >(functions, routerCallableUrl('calendar', 'createCalendarEvent'));

      const result = await create(input);

      // Add the new event to state
      setCalendarEventsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = [...prev.data, result.data.calendarEvent].sort(
          (a, b) =>
            new Date(a.startDateTime).getTime() -
            new Date(b.startDateTime).getTime()
        );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.calendarEvent;
    },
    []
  );

  const updateCalendarEvent = useCallback(
    async (input: UpdateCalendarEventInput): Promise<CalendarEvent> => {
      const functions = getMapleFunctions();
      const update = httpsCallableFromURL<
        UpdateCalendarEventRequest,
        UpdateCalendarEventResponse
      >(functions, routerCallableUrl('calendar', 'updateCalendarEvent'));

      const result = await update(input);

      // Update the event in state and re-sort
      setCalendarEventsState((prev) => {
        if (prev.status !== 'success') return prev;
        const newData = prev.data
          .map((e) =>
            e.id === result.data.calendarEvent.id
              ? result.data.calendarEvent
              : e
          )
          .sort(
            (a, b) =>
              new Date(a.startDateTime).getTime() -
              new Date(b.startDateTime).getTime()
          );
        return {
          ...prev,
          data: newData,
        };
      });

      return result.data.calendarEvent;
    },
    []
  );

  const deleteCalendarEvent = useCallback(async (id: string): Promise<void> => {
    const functions = getMapleFunctions();
    const del = httpsCallableFromURL<
      DeleteCalendarEventRequest,
      DeleteCalendarEventResponse
    >(functions, routerCallableUrl('calendar', 'deleteCalendarEvent'));

    await del({ id });

    // Remove the event from state
    setCalendarEventsState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        ...prev,
        data: prev.data.filter((e) => e.id !== id),
      };
    });
  }, []);

  // Fetch calendar events on mount and when filters change
  useEffect(() => {
    fetchCalendarEvents();
  }, [fetchCalendarEvents]);

  return {
    calendarEventsState,
    fetchCalendarEvents,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
  };
}
