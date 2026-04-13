/**
 * Sync Class to Webflow Cloud Function
 *
 * Firestore trigger that syncs class changes to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Triggers on:
 * - Class created: Creates new item in Webflow CMS (if status = published)
 * - Class updated: Updates item in Webflow CMS (or creates/removes based on status)
 * - Class deleted: Removes item from Webflow CMS
 *
 * Enriches class data with instructor name and category name before syncing.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Class } from '@maple/ts/domain';
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
 * Extract class data from Firestore snapshot
 */
function extractClass(
  snapshot: DocumentSnapshot | undefined
): Class | null {
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
 * Sync Class to Webflow CMS
 *
 * Firestore trigger that runs when a class document is created, updated, or deleted.
 * Only syncs published classes to Webflow; draft/cancelled/completed classes are removed.
 */
export const syncClassToWebflow = onDocumentWritten(
  {
    document: 'classes/{classId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeClass = extractClass(change.before);
    const afterClass = extractClass(change.after);

    console.log('Sync class to Webflow triggered:', {
      classId: event.params.classId,
      before: beforeClass
        ? { name: beforeClass.name, status: beforeClass.status }
        : null,
      after: afterClass
        ? { name: afterClass.name, status: afterClass.status }
        : null,
    });

    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    try {
      // Case 1: Class deleted
      if (!afterClass) {
        console.log('Class deleted, removing from Webflow');
        const removed = await webflow.classService.removeClass(
          event.params.classId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Class not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Class became unpublished (was published, now draft/cancelled/completed)
      if (
        beforeClass?.status === 'published' &&
        afterClass.status !== 'published'
      ) {
        console.log('Class unpublished, removing from Webflow');
        const removed = await webflow.classService.removeClass(afterClass.id);
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Class not found in Webflow'
        );
        return;
      }

      // Case 3: Class is not published (skip sync)
      if (afterClass.status !== 'published') {
        console.log('Class is not published, skipping Webflow sync');
        return;
      }

      // Case 4: Class is published — enrich and sync to Webflow
      const isDev = FirebaseProject.isDev;
      const shouldPublish = !isDev;

      // Fetch enrichment data in parallel
      const [instructor, category, registrationCount] = await Promise.all([
        afterClass.instructorId
          ? InstructorRepository.findById(afterClass.instructorId)
          : Promise.resolve(null),
        afterClass.categoryId
          ? ClassCategoryRepository.findById(afterClass.categoryId)
          : Promise.resolve(null),
        RegistrationRepository.countByClassId(afterClass.id),
      ]);

      console.log('Syncing published class to Webflow:', {
        name: afterClass.name,
        isDev,
        autoPublish: shouldPublish,
        instructorName: instructor?.name,
        categoryName: category?.name,
        registrationCount,
      });

      const result = await webflow.classService.syncClass({
        classEntity: afterClass,
        publish: shouldPublish,
        isDev,
        instructorName: instructor?.name,
        instructorBio: instructor?.bio,
        instructorImage: instructor?.photoUrl,
        categoryName: category?.name,
        registrationCount,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
        isDev,
        published: shouldPublish,
      });

      // Store the Webflow item ID back in Firestore
      // Uses bare update (no updatedAt) to prevent re-triggering sync
      if (result.success && result.webflowItemId) {
        await ClassRepository.updateWebflowItemId(
          afterClass.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow sync error:', error);
      // Don't throw — prevent retry loops for Webflow API errors
    }
  }
);
