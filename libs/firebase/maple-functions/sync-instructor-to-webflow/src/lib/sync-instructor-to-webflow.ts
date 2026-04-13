/**
 * Sync Instructor to Webflow Cloud Function
 *
 * Firestore trigger that syncs instructor changes to Webflow CMS.
 * Follows one-way sync pattern: Firebase -> Webflow (as per ADR-016).
 *
 * Triggers on:
 * - Instructor created: Creates new item in Webflow CMS (if status = active)
 * - Instructor updated: Updates item in Webflow CMS (or creates/removes based on status)
 * - Instructor deleted: Removes item from Webflow CMS
 *
 * IMPORTANT: This function uses inline secret definitions to avoid cold start delays.
 * Secrets are defined in the onDocumentWritten options, NOT at module level.
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Instructor } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { InstructorRepository } from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Define secrets INLINE - NOT at module level to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) => defineSecret(name));
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) => defineString(name));

/**
 * Extract instructor data from Firestore snapshot
 */
function extractInstructor(snapshot: DocumentSnapshot | undefined): Instructor | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  if (!data) return null;

  // Convert Firestore timestamps to Dates
  return {
    id: snapshot.id,
    ...data,
    createdAt: data['createdAt']?.toDate?.() ?? new Date(),
    updatedAt: data['updatedAt']?.toDate?.() ?? new Date(),
  } as Instructor;
}

/**
 * Sync Instructor to Webflow CMS
 *
 * Firestore trigger that runs when an instructor document is created, updated, or deleted.
 * Only syncs active instructors to Webflow; inactive/deleted instructors are removed.
 */
export const syncInstructorToWebflow = onDocumentWritten(
  {
    document: 'instructors/{instructorId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeInstructor = extractInstructor(change.before);
    const afterInstructor = extractInstructor(change.after);

    console.log('Sync instructor to Webflow triggered:', {
      instructorId: event.params.instructorId,
      before: beforeInstructor
        ? { name: beforeInstructor.name, status: beforeInstructor.status }
        : null,
      after: afterInstructor
        ? { name: afterInstructor.name, status: afterInstructor.status }
        : null,
    });

    // Build Webflow client - secrets accessed at runtime, not cold start
    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    try {
      // Case 1: Instructor deleted
      if (!afterInstructor) {
        console.log('Instructor deleted, removing from Webflow');
        const removed = await webflow.instructorService.removeInstructor(
          event.params.instructorId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Instructor not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Instructor became inactive (was active, now inactive)
      if (
        beforeInstructor?.status === 'active' &&
        afterInstructor.status !== 'active'
      ) {
        console.log('Instructor became inactive, removing from Webflow');
        const removed = await webflow.instructorService.removeInstructor(afterInstructor.id);
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Instructor not found in Webflow'
        );
        return;
      }

      // Case 3: Instructor is not active (skip sync)
      if (afterInstructor.status !== 'active') {
        console.log('Instructor is not active, skipping Webflow sync');
        return;
      }

      // Case 4: Instructor is active - sync to Webflow
      // Auto-publish only in prod
      // Dev items are never published - they stay as drafts with is-dev-environment=true
      const isDev = FirebaseProject.isDev;
      const shouldPublish = !isDev;
      console.log('Syncing active instructor to Webflow:', {
        name: afterInstructor.name,
        isDev,
        autoPublish: shouldPublish,
      });

      const result = await webflow.instructorService.syncInstructor({
        instructor: afterInstructor,
        publish: shouldPublish,
        isDev,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
        isDev,
        published: shouldPublish,
      });

      // Store the Webflow item ID back in Firestore for reference
      if (result.success && result.webflowItemId) {
        await InstructorRepository.updateWebflowItemId(
          afterInstructor.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow sync error:', error);
      // Don't throw - we don't want to trigger retries for Webflow API errors
      // In production, we'd want to send these to a dead letter queue
    }
  }
);
