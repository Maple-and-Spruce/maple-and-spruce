/**
 * Sync Class Category to Webflow Cloud Function
 *
 * Firestore trigger that syncs class category changes to Webflow CMS.
 * Follows the one-way sync pattern: Firebase -> Webflow (ADR-016).
 *
 * Triggers on:
 * - Category created: Creates a new item in the Class Categories collection
 * - Category updated: Updates the existing item
 * - Category deleted: Removes the item from Webflow CMS
 *
 * Why this collection exists: the Classes collection carries a `category`
 * **Reference** field pointing here, and Webflow can only filter a Collection
 * List against the current item's field when that field is a reference. That
 * filter is what renders related classes natively on the class template page
 * instead of a Cloud Function round trip from the sold-out panel (#776).
 *
 * IMPORTANT: This function uses inline secret definitions to avoid cold start
 * delays. Secrets are defined in the onDocumentWritten options, NOT at module
 * level.
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { ClassCategory } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { ClassCategoryRepository } from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Define secrets INLINE - NOT at module level to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * Extract class category data from a Firestore snapshot
 */
function extractCategory(
  snapshot: DocumentSnapshot | undefined
): ClassCategory | null {
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
  } as ClassCategory;
}

/**
 * Sync Class Category to Webflow CMS
 */
export const syncClassCategoryToWebflow = onDocumentWritten(
  {
    document: 'classCategories/{categoryId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeCategory = extractCategory(change.before);
    const afterCategory = extractCategory(change.after);

    console.log('Sync class category to Webflow triggered:', {
      categoryId: event.params.categoryId,
      before: beforeCategory ? { name: beforeCategory.name } : null,
      after: afterCategory ? { name: afterCategory.name } : null,
    });

    // Build Webflow client - secrets accessed at runtime, not cold start
    const secrets = Object.fromEntries(
      webflowSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    const isDev = FirebaseProject.isDev;
    const shouldPublish = !isDev;

    try {
      // Case 1: Category deleted
      if (!afterCategory) {
        console.log('Class category deleted, removing from Webflow');
        const removed =
          await webflow.classCategoryService.removeClassCategory(
            event.params.categoryId,
            shouldPublish,
            beforeCategory?.webflowItemId
          );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Class category not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Category created or updated - sync to Webflow.
      // Auto-publish only in prod; dev items stay as drafts with
      // is-dev-environment=true so a full-site publish can't make them live.
      console.log('Syncing class category to Webflow:', {
        name: afterCategory.name,
        isDev,
        autoPublish: shouldPublish,
      });

      const result = await webflow.classCategoryService.syncClassCategory({
        category: afterCategory,
        publish: shouldPublish,
        isDev,
        existingWebflowItemId: afterCategory.webflowItemId,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
        isDev,
        published: shouldPublish,
      });

      // Store the Webflow item ID back in Firestore. The equality guard is
      // required: this write re-fires the trigger, and writing unconditionally
      // would loop forever (see the Firestore trigger feedback loop rule).
      if (
        result.success &&
        result.webflowItemId &&
        afterCategory.webflowItemId !== result.webflowItemId
      ) {
        await ClassCategoryRepository.updateWebflowItemId(
          afterCategory.id,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow sync error:', error);
      // Don't throw - we don't want to trigger retries for Webflow API errors
    }
  }
);
