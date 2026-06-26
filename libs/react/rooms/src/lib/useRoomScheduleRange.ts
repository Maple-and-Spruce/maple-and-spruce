'use client';

import { useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getMapleFunctions } from '@maple/ts/firebase/firebase-config';
import type { RequestState, Room, RoomBusyWindow } from '@maple/ts/domain';
import type {
  GetRoomScheduleRequest,
  GetRoomScheduleResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Fetch a room's busy windows across an arbitrary date range.
 *
 * Powers the upcoming-schedule agenda (now → several weeks out). Unlike
 * `useRoomScheduleForDate` (one calendar day) and `useRoomSchedule` (rest of
 * today), this queries any span. Windows are re-hydrated to Date objects and
 * sorted by start time.
 *
 * Refetch is bucketed on the calendar day of `start` and `end` so a `start`
 * derived from `new Date()` doesn't re-trigger on every render as the clock
 * ticks — change the horizon (the `end` day) to fetch a wider range.
 */
export function useRoomScheduleRange(room: Room, start: Date, end: Date) {
  const [roomScheduleState, setRoomScheduleState] = useState<
    RequestState<RoomBusyWindow[]>
  >({ status: 'idle' });

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const startKey = dayKey(start);
  const endKey = dayKey(end);

  const fetchRoomSchedule = useCallback(async () => {
    setRoomScheduleState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getRoomSchedule = httpsCallable<
        GetRoomScheduleRequest,
        GetRoomScheduleResponse
      >(functions, 'getRoomSchedule');

      const result = await getRoomSchedule({
        room,
        start: start.toISOString(),
        end: end.toISOString(),
      });

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
    // startKey/endKey stand in for the Date objects; room is primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, startKey, endKey]);

  useEffect(() => {
    fetchRoomSchedule();
  }, [fetchRoomSchedule]);

  return { roomScheduleState, refetch: fetchRoomSchedule };
}
