/**
 * onLessonWrite Firestore Trigger
 *
 * Keeps the CalendarEvent collection in sync with the lessons collection so
 * scheduled music lessons block the Spruce Room's availability.
 *
 * - Scheduled or rendered lesson: upserts one CalendarEvent at the stable ID
 *   `lesson-{lessonId}` ('rendered' means the lesson was actually taught, so
 *   it stays on the room schedule as history).
 * - Cancelled or deleted lesson: removes the CalendarEvent.
 *
 * Derived events are `public: false` with a generic title — student names
 * must never reach the public ICS feeds. The room schedule only needs to
 * know the slot is taken.
 *
 * No feedback-loop guard is needed: this trigger watches `lessons` and only
 * writes to `calendarEvents`, which has no trigger of its own.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CalendarEventRepository } from '@maple/firebase/database';
import type { Lesson } from '@maple/ts/domain';
import { DEFAULT_EVENT_LOCATION } from '@maple/ts/domain';

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
 * Extract lesson data from a Firestore snapshot.
 */
function extractLesson(snapshot: DocumentSnapshot | undefined): Lesson | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  const scheduledAt = toDateLike(data['scheduledAt']);
  if (!scheduledAt) return null;

  return {
    id: snapshot.id,
    ...data,
    scheduledAt,
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as Lesson;
}

/**
 * Deterministic doc ID for a lesson's calendar event. One event per lesson —
 * recurring series are already modeled as N independent lesson docs.
 */
function lessonEventId(lessonId: string): string {
  return `lesson-${lessonId}`;
}

export const onLessonWrite = onDocumentWritten(
  {
    document: 'lessons/{lessonId}',
    region: 'us-east4',
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const afterLesson = extractLesson(change.after);
    const lessonId = event.params.lessonId;
    const eventDocId = lessonEventId(lessonId);

    try {
      // Lesson deleted, cancelled, or unreadable — remove its event.
      // Firestore deletes are no-ops when the doc doesn't exist.
      if (!afterLesson || afterLesson.status === 'cancelled') {
        await CalendarEventRepository.delete(eventDocId);
        console.log('Removed CalendarEvent for lesson:', {
          lessonId,
          reason: afterLesson ? 'cancelled' : 'deleted',
        });
        return;
      }

      // Scheduled or rendered — the slot is (or was) genuinely occupied.
      await CalendarEventRepository.upsertWithId(eventDocId, {
        title: 'Music Lesson',
        description: '',
        startDateTime: afterLesson.scheduledAt,
        endDateTime: new Date(
          afterLesson.scheduledAt.getTime() +
            afterLesson.durationMinutes * 60 * 1000
        ),
        recurrenceRule: null,
        location: DEFAULT_EVENT_LOCATION,
        type: 'lesson',
        public: false,
        room: 'spruce',
        sourceRef: `lessons/${lessonId}`,
        createdBy: 'system',
      });

      console.log('Upserted CalendarEvent for lesson:', {
        lessonId,
        startDateTime: afterLesson.scheduledAt.toISOString(),
        status: afterLesson.status,
      });
    } catch (error) {
      console.error('Error in onLessonWrite:', error);
    }
  }
);
