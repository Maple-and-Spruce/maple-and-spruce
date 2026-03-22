/**
 * onClassWrite Firestore Trigger
 *
 * Auto-generates CalendarEvents when classes are created, updated, or deleted.
 * Ensures the calendar automatically reflects anything managed via the class admin UI.
 *
 * - Create: If class status is 'published', creates a corresponding CalendarEvent
 * - Update: Updates the corresponding CalendarEvent; sets public=false if not published
 * - Delete: Removes the corresponding CalendarEvent
 *
 * IMPORTANT: Firebase Admin must be initialized before the repository's db proxy
 * is accessed. We use the getDb() function directly and initialize admin in the
 * handler to ensure correct ordering.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import admin from 'firebase-admin';
import type { Class } from '@maple/ts/domain';
import { DEFAULT_EVENT_LOCATION } from '@maple/ts/domain';

/**
 * Ensure Firebase Admin is initialized.
 * Must be called before any Firestore operations.
 */
function ensureInitialized(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
}

/**
 * Get the CalendarEventRepository lazily, after admin is initialized.
 */
async function getRepo() {
  ensureInitialized();
  const { CalendarEventRepository } = await import('@maple/firebase/database');
  return CalendarEventRepository;
}

/**
 * Extract class data from Firestore snapshot
 */
function extractClass(snapshot: DocumentSnapshot | undefined): Class | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  return {
    id: snapshot.id,
    ...data,
    dateTime: data['dateTime']?.toDate?.() ?? new Date(),
    createdAt: data['createdAt']?.toDate?.() ?? new Date(),
    updatedAt: data['updatedAt']?.toDate?.() ?? new Date(),
  } as Class;
}

/**
 * Compute end time from class dateTime + durationMinutes
 */
function getEndTime(classData: Class): Date {
  return new Date(
    classData.dateTime.getTime() + classData.durationMinutes * 60 * 1000
  );
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
        ? { name: beforeClass.name, status: beforeClass.status }
        : null,
      after: afterClass
        ? { name: afterClass.name, status: afterClass.status }
        : null,
    });

    try {
      const repo = await getRepo();

      // Case 1: Class deleted
      if (!afterClass) {
        const existing = await repo.findBySourceRef(sourceRef);
        if (existing) {
          await repo.delete(existing.id);
          console.log('Deleted CalendarEvent for removed class:', classId);
        }
        return;
      }

      // Case 2: Class created
      if (!beforeClass) {
        if (afterClass.status === 'published') {
          await repo.create({
            title: afterClass.name,
            description: afterClass.description || '',
            startDateTime: afterClass.dateTime,
            endDateTime: getEndTime(afterClass),
            recurrenceRule: null,
            location: afterClass.location || DEFAULT_EVENT_LOCATION,
            type: 'class',
            public: true,
            sourceRef,
            createdBy: 'system',
          });
          console.log('Created CalendarEvent for new published class:', classId);
        }
        return;
      }

      // Case 3: Class updated
      const existing = await repo.findBySourceRef(sourceRef);

      if (existing) {
        // Update the existing calendar event
        await repo.update({
          id: existing.id,
          title: afterClass.name,
          description: afterClass.description || '',
          startDateTime: afterClass.dateTime,
          endDateTime: getEndTime(afterClass),
          location: afterClass.location || DEFAULT_EVENT_LOCATION,
          public: afterClass.status === 'published',
        });
        console.log('Updated CalendarEvent for class:', classId);
      } else if (afterClass.status === 'published') {
        // Class was updated to published status but has no CalendarEvent yet
        await repo.create({
          title: afterClass.name,
          description: afterClass.description || '',
          startDateTime: afterClass.dateTime,
          endDateTime: getEndTime(afterClass),
          recurrenceRule: null,
          location: afterClass.location || DEFAULT_EVENT_LOCATION,
          type: 'class',
          public: true,
          sourceRef,
          createdBy: 'system',
        });
        console.log('Created CalendarEvent for newly published class:', classId);
      }
    } catch (error) {
      console.error('Error in onClassWrite:', error);
    }
  }
);
