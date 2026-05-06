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
import { asPublishable } from '@maple/ts/domain';
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
 * Fields on the registration document that affect the registration count.
 * If none of these changed, syncing would produce the same result and we
 * can skip the (expensive) Webflow call — preventing a trigger feedback
 * loop where an unrelated field update re-fires this function endlessly.
 */
const COUNT_RELEVANT_FIELDS = ['classId', 'status', 'quantity'] as const;

/**
 * Check whether a write event actually changes the registration count.
 *
 * - Create (no before) or delete (no after): always relevant.
 * - Update: relevant only when classId, status, or quantity changed.
 */
export function isCountRelevantChange(
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined
): boolean {
  const beforeExists = before?.exists ?? false;
  const afterExists = after?.exists ?? false;

  // Create or delete — always relevant
  if (!beforeExists || !afterExists) {
    return true;
  }

  const beforeData = before!.data();
  const afterData = after!.data();

  // If either snapshot has no data, treat as relevant (defensive)
  if (!beforeData || !afterData) {
    return true;
  }

  // Check if any count-relevant field changed
  return COUNT_RELEVANT_FIELDS.some(
    (field) => beforeData[field] !== afterData[field]
  );
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

    // Guard: skip if the write didn't change any count-relevant fields.
    // This prevents a trigger feedback loop where an unrelated update
    // (e.g. squarePaymentId, updatedAt) re-fires this function and
    // causes it to loop dozens of times in the emulator.
    if (!isCountRelevantChange(change.before, change.after)) {
      console.log(
        'Registration write did not change count-relevant fields, skipping sync'
      );
      return;
    }

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

    const publishable = asPublishable(classEntity);
    if (!publishable) {
      console.warn(
        'Published class has no sessions, skipping Webflow sync',
        { classId }
      );
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
        publishable.instructorId
          ? InstructorRepository.findById(publishable.instructorId)
          : Promise.resolve(null),
        publishable.categoryId
          ? ClassCategoryRepository.findById(publishable.categoryId)
          : Promise.resolve(null),
        RegistrationRepository.countByClassId(publishable.id),
      ]);

      console.log('Re-syncing class to Webflow with updated count:', {
        classId,
        className: publishable.name,
        registrationCount,
        capacity: publishable.capacity,
        spotsRemaining: publishable.capacity - registrationCount,
        autoPublish: shouldPublish,
      });

      const result = await webflow.classService.syncClass({
        classEntity: publishable,
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
