/**
 * onMusicTogetherSectionWrite Firestore Trigger
 *
 * Keeps the CalendarEvent collection in sync with the musicTogetherSections
 * collection, creating one `CalendarEvent` (type `musictogether`) per section
 * session — the same "one entity drives registration AND the calendar" pattern
 * as `onClassWrite` does for classes.
 *
 * - Create/Update: if the section is live (status `open` or `closed`), upserts
 *   one event per session at a stable ID and deletes events whose session no
 *   longer exists.
 * - Not live (`draft` / `completed`) or deleted: removes every CalendarEvent
 *   tied to this section.
 *
 * MT classes are always 45 minutes (`MT_CLASS_DURATION_MINUTES`), so sections
 * carry no per-session duration; the end time is derived here.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CalendarEventRepository } from '@maple/firebase/database';
import type { MusicTogetherSession, Room } from '@maple/ts/domain';
import {
  DEFAULT_EVENT_LOCATION,
  MT_CLASS_DURATION_MINUTES,
  ROOMS,
} from '@maple/ts/domain';

/** Minimal shape we read off the section snapshot. */
interface SectionData {
  name: string;
  description?: string;
  sessions: MusicTogetherSession[];
  status: string;
  location?: string;
  room?: string;
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

/** Parse and sort session start times off a raw section document. */
function extractSessions(raw: Record<string, unknown>): MusicTogetherSession[] {
  const rawSessions = raw['sessions'];
  if (!Array.isArray(rawSessions)) return [];
  return rawSessions
    .map((entry) => {
      const dateField =
        entry && typeof entry === 'object' && 'dateTime' in entry
          ? (entry as { dateTime: unknown }).dateTime
          : entry;
      return { dateTime: toDateLike(dateField) };
    })
    .filter((s): s is MusicTogetherSession => s.dateTime instanceof Date)
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

function extractSection(
  snapshot: DocumentSnapshot | undefined
): SectionData | null {
  if (!snapshot || !snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  return {
    name: typeof data['name'] === 'string' ? data['name'] : 'Music Together',
    description:
      typeof data['description'] === 'string' ? data['description'] : undefined,
    sessions: extractSessions(data),
    status: typeof data['status'] === 'string' ? data['status'] : 'draft',
    location:
      typeof data['location'] === 'string' ? data['location'] : undefined,
    room: typeof data['room'] === 'string' ? data['room'] : undefined,
  };
}

/**
 * Deterministic event ID keyed by the session's timestamp (not array index),
 * so reordering/inserting sessions doesn't rewrite every downstream event.
 */
function sessionEventId(
  sectionId: string,
  session: MusicTogetherSession
): string {
  return `mt-${sectionId}-${session.dateTime.getTime()}`;
}

/** Map a section's free-text room to a bookable Room, or null. */
function resolveRoom(room: string | undefined): Room | null {
  return room && (ROOMS as string[]).includes(room) ? (room as Room) : null;
}

/** A section shows on the public calendar once it's live (open or closed). */
function isLive(status: string): boolean {
  return status === 'open' || status === 'closed';
}

export const onMusicTogetherSectionWrite = onDocumentWritten(
  {
    document: 'musicTogetherSections/{sectionId}',
    region: 'us-east4',
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const after = extractSection(change.after);
    const sectionId = event.params.sectionId;
    const sourceRef = `musicTogetherSections/${sectionId}`;

    try {
      const existingEvents =
        await CalendarEventRepository.findAllBySourceRef(sourceRef);

      // Deleted, not-live, or no sessions → remove all its events.
      if (!after || !isLive(after.status) || after.sessions.length === 0) {
        await Promise.all(
          existingEvents.map((e) => CalendarEventRepository.delete(e.id))
        );
        if (existingEvents.length > 0) {
          console.log(
            `onMusicTogetherSectionWrite: removed ${existingEvents.length} event(s) for section ${sectionId}`
          );
        }
        return;
      }

      const room = resolveRoom(after.room);
      const desiredIds = new Set(
        after.sessions.map((s) => sessionEventId(sectionId, s))
      );

      // Upsert one event per session.
      await Promise.all(
        after.sessions.map((session) =>
          CalendarEventRepository.upsertWithId(
            sessionEventId(sectionId, session),
            {
              title: after.name,
              description: after.description || '',
              startDateTime: session.dateTime,
              endDateTime: new Date(
                session.dateTime.getTime() +
                  MT_CLASS_DURATION_MINUTES * 60 * 1000
              ),
              recurrenceRule: null,
              location: after.location || DEFAULT_EVENT_LOCATION,
              type: 'musictogether',
              public: true,
              room,
              sourceRef,
              createdBy: 'system',
            }
          )
        )
      );

      // Delete events for sessions that no longer exist.
      const staleIds = existingEvents
        .map((e) => e.id)
        .filter((id) => !desiredIds.has(id));
      await Promise.all(
        staleIds.map((id) => CalendarEventRepository.delete(id))
      );

      console.log('onMusicTogetherSectionWrite reconciled:', {
        sectionId,
        upserted: after.sessions.length,
        deleted: staleIds.length,
      });
    } catch (error) {
      console.error('Error in onMusicTogetherSectionWrite:', error);
    }
  }
);
