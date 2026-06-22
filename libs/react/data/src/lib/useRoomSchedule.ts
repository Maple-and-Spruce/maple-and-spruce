'use client';

import { useState, useCallback, useEffect } from 'react';
import { callDeduped } from './call-deduped';
import type { RequestState, Room, RoomBusyWindow } from '@maple/ts/domain';
import type {
  GetRoomScheduleRequest,
  GetRoomScheduleResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Hook for fetching a room's busy windows for the rest of today.
 *
 * Powers point-in-time status displays (the dashboard "right now" widget).
 * Windows are re-hydrated to Date objects and sorted by start time.
 */
export function useRoomSchedule(room: Room) {
  const [roomScheduleState, setRoomScheduleState] = useState<
    RequestState<RoomBusyWindow[]>
  >({
    status: 'idle',
  });

  const fetchRoomSchedule = useCallback(async () => {
    setRoomScheduleState({ status: 'loading' });

    try {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      // Dedupe by room only — `start`/`end` are derived from the current
      // instant, so they differ by milliseconds between remounts and would
      // otherwise defeat the in-flight dedupe.
      const result = await callDeduped<
        GetRoomScheduleRequest,
        GetRoomScheduleResponse
      >(
        'getRoomSchedule',
        {
          room,
          start: now.toISOString(),
          end: endOfDay.toISOString(),
        },
        `getRoomSchedule:${room}`
      );

      const windows: RoomBusyWindow[] = result.data.windows
        .map((w) => ({
          eventId: w.eventId,
          title: w.title,
          type: w.type,
          sourceRef: w.sourceRef,
          start: new Date(w.start),
          end: new Date(w.end),
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      setRoomScheduleState({ status: 'success', data: windows });
    } catch (error) {
      console.error('Failed to fetch room schedule:', error);
      setRoomScheduleState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch room schedule',
      });
    }
  }, [room]);

  // Fetch on mount and when the room changes
  useEffect(() => {
    fetchRoomSchedule();
  }, [fetchRoomSchedule]);

  return {
    roomScheduleState,
    fetchRoomSchedule,
  };
}
