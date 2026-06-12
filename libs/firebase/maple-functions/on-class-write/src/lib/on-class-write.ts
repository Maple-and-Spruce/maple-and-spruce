/**
 * onClassWrite Firestore Trigger
 *
 * Keeps the CalendarEvent collection in sync with the classes collection,
 * creating one `CalendarEvent` per class session.
 *
 * - Create: if the class is `published`, creates one event per session.
 * - Update: reconciles — upserts events for current sessions at stable IDs,
 *   deletes events whose session index no longer exists, and flips `public`
 *   to `false` when the class is not published.
 * - Delete: removes every CalendarEvent tied to this class.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CalendarEventRepository } from '@maple/firebase/database';
import type { Class, ClassSession } from '@maple/ts/domain';
import {
  DEFAULT_EVENT_LOCATION,
  getSessionEndTime,
  getSortedSessions,
} from '@maple/ts/domain';

/**
 * Parse session entries from a Firestore document, tolerating legacy docs
 * that only have the old scalar `dateTime` field.
 */
function extractSessions(raw: Record<string, unknown>): ClassSession[] {
  const rawSessions = raw['sessions'];
  if (Array.isArray(rawSessions) && rawSessions.length > 0) {
    return rawSessions
      .map((entry) => {
        const dateField =
          entry && typeof entry === 'object' && 'dateTime' in entry
            ? (entry as { dateTime: unknown }).dateTime
            : entry;
        return { dateTime: toDateLike(dateField) };
      })
      .filter((s): s is ClassSession => s.dateTime instanceof Date)
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }

  const legacy = toDateLike(raw['dateTime']);
  return legacy instanceof Date ? [{ dateTime: legacy }] : [];
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

/**
 * Extract class data from Firestore snapshot.
 */
function extractClass(snapshot: DocumentSnapshot | undefined): Class | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  const sessions = extractSessions(data);

  return {
    id: snapshot.id,
    ...data,
    sessions,
    registrationClosesAt: toDateLike(data['registrationClosesAt']),
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as Class;
}

/**
 * Deterministic doc ID for a given class session.
 *
 * We key by the session's ISO timestamp rather than by its position in the
 * sessions array so that reordering or inserting sessions doesn't cause
 * every downstream event to rewrite (and doesn't break subscribers' stable
 * identifiers).
 */
function sessionEventId(classId: string, session: ClassSession): string {
  return `class-${classId}-${session.dateTime.getTime()}`;
}

export const onClassWrite = onDocumentWritten(
  {
    document: 'classes/{classId}',
    region: 'us-east4',
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeClass = extractClass(change.before);
    const afterClass = extractClass(change.after);
    const classId = event.params.classId;
    const sourceRef = `classes/${classId}`;

    console.log('onClassWrite triggered:', {
      classId,
      before: beforeClass
        ? { name: beforeClass.name, status: beforeClass.status, sessions: beforeClass.sessions.length }
        : null,
      after: afterClass
        ? { name: afterClass.name, status: afterClass.status, sessions: afterClass.sessions.length }
        : null,
    });

    try {
      const existingEvents = await CalendarEventRepository.findAllBySourceRef(sourceRef);
      const existingIds = new Set(existingEvents.map((e) => e.id));

      // Case 1: Class deleted — remove all its events
      if (!afterClass) {
        await Promise.all(
          existingEvents.map((e) => CalendarEventRepository.delete(e.id))
        );
        if (existingEvents.length > 0) {
          console.log(
            `Deleted ${existingEvents.length} CalendarEvent(s) for removed class:`,
            classId
          );
        }
        return;
      }

      const sessions = getSortedSessions(afterClass);
      const isPublished = afterClass.status === 'published';

      // Case 2: Class is not published — remove any existing events
      if (!isPublished) {
        if (existingEvents.length > 0) {
          await Promise.all(
            existingEvents.map((e) => CalendarEventRepository.delete(e.id))
          );
          console.log(
            `Removed ${existingEvents.length} CalendarEvent(s) for non-published class:`,
            classId
          );
        }
        return;
      }

      // Case 3: Class is published — upsert one event per session (parallel)
      const desiredIds = new Set(
        sessions.map((s) => sessionEventId(classId, s))
      );

      await Promise.all(
        sessions.map((session) => {
          const id = sessionEventId(classId, session);
          return CalendarEventRepository.upsertWithId(id, {
            title: afterClass.name,
            description: afterClass.description || '',
            startDateTime: session.dateTime,
            endDateTime: getSessionEndTime(session, afterClass.durationMinutes),
            recurrenceRule: null,
            location: afterClass.location || DEFAULT_EVENT_LOCATION,
            type: 'class',
            public: true,
            room: afterClass.room ?? null,
            sourceRef,
            createdBy: 'system',
          });
        })
      );

      // Case 4: Delete events for sessions that no longer exist
      const staleIds = [...existingIds].filter((id) => !desiredIds.has(id));
      await Promise.all(
        staleIds.map((id) => CalendarEventRepository.delete(id))
      );

      console.log('Reconciled CalendarEvents for class:', {
        classId,
        upserted: sessions.length,
        deleted: staleIds.length,
        public: isPublished,
      });
    } catch (error) {
      console.error('Error in onClassWrite:', error);
    }
  }
);
