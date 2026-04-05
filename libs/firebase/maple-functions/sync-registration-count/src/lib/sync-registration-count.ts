/**
 * Sync Registration Count Cloud Function
 *
 * Firestore trigger that updates Webflow CMS spots-remaining when
 * a registration is created, updated, or deleted.
 *
 * On any registration write:
 * 1. Extract classId from the registration document
 * 2. Look up the class (must be published)
 * 3. Count active registrations for the class
 * 4. Re-sync the class to Webflow with the updated count
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import {
  ClassRepository,
  InstructorRepository,
  ClassCategoryRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * Extract classId from a registration snapshot.
 * Returns null if the snapshot doesn't exist or has no classId.
 */
export function extractClassId(
  snapshot: DocumentSnapshot | undefined
): string | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  return data?.['classId'] ?? null;
}

/**
 * Sync Registration Count to Webflow CMS
 *
 * Firestore trigger on the registrations collection.
 * When a registration is created, updated, or deleted, re-syncs
 * the associated class to Webflow so spots-remaining is accurate.
 */
export const syncRegistrationCount = onDocumentWritten(
  {
    document: 'registrations/{registrationId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;

    // Get classId from before or after snapshot (covers create, update, delete)
    const classId =
      extractClassId(change.after) ?? extractClassId(change.before);

    if (!classId) {
      console.log(
        'No classId found on registration, skipping Webflow sync'
      );
      return;
    }

    console.log('Sync registration count triggered:', {
      registrationId: event.params.registrationId,
      classId,
    });

    // Look up the class — only sync if published
    const classEntity = await ClassRepository.findById(classId);

    if (!classEntity) {
      console.log('Class not found, skipping Webflow sync:', { classId });
      return;
    }

    if (classEntity.status !== 'published') {
      console.log('Class is not published, skipping Webflow sync:', {
        classId,
        status: classEntity.status,
      });
      return;
    }

    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    try {
      const isDev = FirebaseProject.isDev;
      const shouldPublish = !isDev;

      // Fetch enrichment data in parallel
      const [instructor, category, registrationCount] = await Promise.all([
        classEntity.instructorId
          ? InstructorRepository.findById(classEntity.instructorId)
          : Promise.resolve(null),
        classEntity.categoryId
          ? ClassCategoryRepository.findById(classEntity.categoryId)
          : Promise.resolve(null),
        RegistrationRepository.countByClassId(classEntity.id),
      ]);

      console.log('Re-syncing class to Webflow with updated count:', {
        classId,
        className: classEntity.name,
        registrationCount,
        capacity: classEntity.capacity,
        spotsRemaining: classEntity.capacity - registrationCount,
        autoPublish: shouldPublish,
      });

      const result = await webflow.classService.syncClass({
        classEntity,
        publish: shouldPublish,
        isDev,
        instructorName: instructor?.name,
        categoryName: category?.name,
        registrationCount,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
      });
    } catch (error) {
      console.error('Webflow sync error (registration count):', error);
      // Don't throw — prevent retry loops for Webflow API errors
    }
  }
);
