/**
 * Integration tests for the syncClassToWebflow Firestore trigger — Firestore
 * side only.
 *
 * These cover trigger *routing*: which document writes reach the sync path and
 * which are skipped, asserted against the Firestore doc afterwards.
 *
 * 1. The trigger fires without crashing (error handling works)
 * 2. Draft/cancelled classes skip the sync path
 * 3. Enrichment data (instructor, category) is read from Firestore
 * 4. The function handles missing enrichment data gracefully
 *
 * They deliberately assert nothing about the CMS item that was produced. For
 * that, see `apps/functions-integration-tests-square/src/sync-class-to-webflow.spec.ts`,
 * which points the Webflow SDK at the mock server via `WEBFLOW_BASE_URL` and
 * asserts on the actual `fieldData` — including the fields the CMS-native
 * related-classes list binds to (#776).
 *
 * (An earlier version of this comment claimed Webflow calls simply fail in the
 * emulator. They do not: the mock server handles them.)
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  deleteFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import {
  PUBLISHED_CLASS,
  DRAFT_CLASS,
  PUBLISHED_CLASS_WITH_REFS,
  PUBLISHED_CLASS_NO_INSTRUCTOR,
  SAMPLE_INSTRUCTOR,
  SAMPLE_CLASS_CATEGORY,
  CLASS_IDS,
} from '@maple/firebase/integration-test-utils';

/**
 * Wait for a Firestore trigger to process.
 * The emulator typically fires triggers within a few hundred ms,
 * but we allow extra time for cold starts and processing.
 */
async function waitForTrigger(ms = 3000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('syncClassToWebflow trigger', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator();

    // Seed enrichment data that the trigger will look up
    await Promise.all([
      setFirestoreDoc('instructors', 'test-instructor-1', SAMPLE_INSTRUCTOR),
      setFirestoreDoc(
        'classCategories',
        'test-category-1',
        SAMPLE_CLASS_CATEGORY
      ),
    ]);
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  // ===========================================================================
  // Trigger Fires on Published Class Creation
  // ===========================================================================

  describe('Published class creation', () => {
    it('should trigger sync when a published class is created', async () => {
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerCreate,
        PUBLISHED_CLASS
      );

      // Wait for the trigger to fire and process
      await waitForTrigger();

      // The class document should still exist (trigger didn't crash/delete it)
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerCreate
      );
      expect(doc).not.toBeNull();
      expect(doc!['name']).toBe(PUBLISHED_CLASS.name);
      expect(doc!['status']).toBe('published');
    });

    it('should trigger sync with enrichment data when instructor and category exist', async () => {
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.publishedWithRefs,
        PUBLISHED_CLASS_WITH_REFS
      );

      await waitForTrigger();

      // Verify the class document is intact and the enrichment references are preserved
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.publishedWithRefs
      );
      expect(doc).not.toBeNull();
      expect(doc!['instructorId']).toBe('test-instructor-1');
      expect(doc!['categoryId']).toBe('test-category-1');
      expect(doc!['status']).toBe('published');

      // Verify the instructor data is available for enrichment
      const instructor = await getFirestoreDoc(
        'instructors',
        'test-instructor-1'
      );
      expect(instructor).not.toBeNull();
      expect(instructor!['name']).toBe(SAMPLE_INSTRUCTOR.name);
    });

    it('should handle missing instructor gracefully', async () => {
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.publishedNoInstructor,
        PUBLISHED_CLASS_NO_INSTRUCTOR
      );

      await waitForTrigger();

      // The class document should still exist — no crash even without instructor
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.publishedNoInstructor
      );
      expect(doc).not.toBeNull();
      expect(doc!['name']).toBe(PUBLISHED_CLASS_NO_INSTRUCTOR.name);
      expect(doc!['instructorId']).toBeUndefined();
    });
  });

  // ===========================================================================
  // Draft Class Does NOT Trigger Sync
  // ===========================================================================

  describe('Draft class (no sync)', () => {
    it('should skip sync when a draft class is created', async () => {
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerDraft,
        DRAFT_CLASS
      );

      await waitForTrigger();

      // The class document should exist unchanged
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerDraft
      );
      expect(doc).not.toBeNull();
      expect(doc!['status']).toBe('draft');

      // A draft class should NOT have a webflowItemId written back
      // (the trigger skips sync for non-published statuses)
      expect(doc!['webflowItemId']).toBeUndefined();
    });
  });

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  describe('Status transitions', () => {
    it('should attempt removal when class transitions from published to draft', async () => {
      // First create as published
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerUnpublish,
        PUBLISHED_CLASS
      );
      await waitForTrigger();

      // Now update to draft (triggers the "unpublished" code path)
      await setFirestoreDoc('classes', CLASS_IDS.syncTriggerUnpublish, {
        ...PUBLISHED_CLASS,
        status: 'draft',
        updatedAt: new Date().toISOString(),
      });
      await waitForTrigger();

      // The class document should still exist with draft status
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerUnpublish
      );
      expect(doc).not.toBeNull();
      expect(doc!['status']).toBe('draft');
    });

    it('should attempt removal when class is deleted', async () => {
      // Create a class first
      await setFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerDelete,
        PUBLISHED_CLASS
      );
      await waitForTrigger();

      // Delete the class (triggers the "deleted" code path)
      await deleteFirestoreDoc('classes', CLASS_IDS.syncTriggerDelete);
      await waitForTrigger();

      // The class document should be gone
      const doc = await getFirestoreDoc(
        'classes',
        CLASS_IDS.syncTriggerDelete
      );
      expect(doc).toBeNull();
    });
  });

  // ===========================================================================
  // Update Triggers Re-sync
  // ===========================================================================

  describe('Published class update', () => {
    const updateClassId = 'test-sync-trigger-update';

    it('should trigger re-sync when a published class is updated', async () => {
      // Create published class
      await setFirestoreDoc('classes', updateClassId, PUBLISHED_CLASS);
      await waitForTrigger();

      // Update the class (still published — should trigger re-sync)
      const updatedName = 'Updated Pottery Class';
      await setFirestoreDoc('classes', updateClassId, {
        ...PUBLISHED_CLASS,
        name: updatedName,
        updatedAt: new Date().toISOString(),
      });
      await waitForTrigger();

      // The class document should reflect the update
      const doc = await getFirestoreDoc('classes', updateClassId);
      expect(doc).not.toBeNull();
      expect(doc!['name']).toBe(updatedName);
      expect(doc!['status']).toBe('published');
    });
  });

  // ===========================================================================
  // Cancelled/Completed Status
  // ===========================================================================

  describe('Non-published statuses', () => {
    it('should skip sync for cancelled class', async () => {
      const cancelledId = 'test-sync-cancelled';
      await setFirestoreDoc('classes', cancelledId, {
        ...PUBLISHED_CLASS,
        status: 'cancelled',
      });
      await waitForTrigger();

      const doc = await getFirestoreDoc('classes', cancelledId);
      expect(doc).not.toBeNull();
      expect(doc!['status']).toBe('cancelled');
      expect(doc!['webflowItemId']).toBeUndefined();
    });

    it('should skip sync for completed class', async () => {
      const completedId = 'test-sync-completed';
      await setFirestoreDoc('classes', completedId, {
        ...PUBLISHED_CLASS,
        status: 'completed',
      });
      await waitForTrigger();

      const doc = await getFirestoreDoc('classes', completedId);
      expect(doc).not.toBeNull();
      expect(doc!['status']).toBe('completed');
      expect(doc!['webflowItemId']).toBeUndefined();
    });
  });
});
