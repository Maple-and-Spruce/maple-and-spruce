/**
 * onMusicTogetherDemoWrite Firestore Trigger
 *
 * Keeps the CalendarEvent collection in sync with the musicTogetherDemos
 * collection — the same "one entity drives RSVP AND the calendar" pattern as
 * `onMusicTogetherSectionWrite` does for sections. Each visible demo becomes
 * ONE public CalendarEvent (type `musictogether`) that flows through the
 * existing `calendarMusicTogetherFeed` → `/calendar/musictogether.ics`.
 *
 * - Create/Update: if the demo is `visible`, upsert one event at a stable ID
 *   (`mt-demo-{demoId}`) for the demo's date + duration.
 * - Not visible or deleted: remove every CalendarEvent tied to this demo.
 *
 * Demos are often held OFFSITE, so the event `location` is the demo's free-text
 * location verbatim (no default). The demo's optional `durationMinutes` falls
 * back to the MT class default. The trigger never writes back to the demo doc,
 * so there's no re-trigger loop to guard against.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CalendarEventRepository } from '@maple/firebase/database';
import {
  MT_CLASS_DURATION_MINUTES,
  MT_DEMO_TITLE,
  DEFAULT_EVENT_LOCATION,
} from '@maple/ts/domain';

/** Minimal shape we read off the demo snapshot. */
interface DemoData {
  dateTime: Date | undefined;
  location: string;
  durationMinutes: number;
  notes?: string;
  visible: boolean;
}

function toDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function extractDemo(snapshot: DocumentSnapshot | undefined): DemoData | null {
  if (!snapshot || !snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  const rawDuration = data['durationMinutes'];
  return {
    dateTime: toDateLike(data['dateTime']),
    location: typeof data['location'] === 'string' ? data['location'] : '',
    durationMinutes:
      typeof rawDuration === 'number' && rawDuration > 0
        ? rawDuration
        : MT_CLASS_DURATION_MINUTES,
    notes: typeof data['notes'] === 'string' ? data['notes'] : undefined,
    visible: data['visible'] === true,
  };
}

/** Deterministic, stable event ID for a demo (one event per demo). */
function demoEventId(demoId: string): string {
  return `mt-demo-${demoId}`;
}

export const onMusicTogetherDemoWrite = onDocumentWritten(
  {
    document: 'musicTogetherDemos/{demoId}',
    region: 'us-east4',
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const after = extractDemo(change.after);
    const demoId = event.params.demoId;
    const sourceRef = `musicTogetherDemos/${demoId}`;

    try {
      const existingEvents =
        await CalendarEventRepository.findAllBySourceRef(sourceRef);

      // Deleted, not visible, or missing a date → remove all its events.
      if (!after || !after.visible || !after.dateTime) {
        await Promise.all(
          existingEvents.map((e) => CalendarEventRepository.delete(e.id))
        );
        if (existingEvents.length > 0) {
          console.log(
            `onMusicTogetherDemoWrite: removed ${existingEvents.length} event(s) for demo ${demoId}`
          );
        }
        return;
      }

      const eventId = demoEventId(demoId);
      await CalendarEventRepository.upsertWithId(eventId, {
        title: MT_DEMO_TITLE,
        description: after.notes || '',
        startDateTime: after.dateTime,
        endDateTime: new Date(
          after.dateTime.getTime() + after.durationMinutes * 60 * 1000
        ),
        recurrenceRule: null,
        // Demos are often offsite — use the free-text location verbatim, only
        // falling back to the studio address when it's blank.
        location: after.location || DEFAULT_EVENT_LOCATION,
        type: 'musictogether',
        public: true,
        room: null,
        sourceRef,
        createdBy: 'system',
      });

      // Remove any stale events (e.g. a legacy extra event) that aren't the one
      // we just upserted.
      const staleIds = existingEvents
        .map((e) => e.id)
        .filter((id) => id !== eventId);
      await Promise.all(
        staleIds.map((id) => CalendarEventRepository.delete(id))
      );

      console.log('onMusicTogetherDemoWrite reconciled:', {
        demoId,
        upserted: 1,
        deleted: staleIds.length,
      });
    } catch (error) {
      console.error('Error in onMusicTogetherDemoWrite:', error);
    }
  }
);
