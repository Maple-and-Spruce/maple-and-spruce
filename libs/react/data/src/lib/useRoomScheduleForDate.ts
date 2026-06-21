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
 * Fetch a room's busy windows for the whole calendar day containing `date`.
 *
 * Powers the day strip and conflict warnings in scheduling dialogs once a
 * date is picked. Unlike `useRoomSchedule` (which is hard-scoped to "now →
 * end of today" for the dashboard widget), this queries an arbitrary day.
 *
 * When `date` is null the hook stays idle and issues no request — so a form
 * can mount it before a date is chosen.
 */
export function useRoomScheduleForDate(room: Room, date: Date | null) {
  const [roomScheduleState, setRoomScheduleState] = useState<
    RequestState<RoomBusyWindow[]>
  >({ status: 'idle' });

  // Bucket on the calendar day so we don't refetch as the user nudges the
  // minute/second of the picked time.
  const dayKey = date
    ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    : null;

  const fetchRoomSchedule = useCallback(async () => {
    if (!date) {
      setRoomScheduleState({ status: 'idle' });
      return;
    }

    setRoomScheduleState({ status: 'loading' });

    try {
      const functions = getMapleFunctions();
      const getRoomSchedule = httpsCallable<
        GetRoomScheduleRequest,
        GetRoomScheduleResponse
      >(functions, 'getRoomSchedule');

      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

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
    // dayKey stands in for `date`; room is primitive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, dayKey]);

  useEffect(() => {
    fetchRoomSchedule();
  }, [fetchRoomSchedule]);

  return { roomScheduleState, refetch: fetchRoomSchedule };
}
