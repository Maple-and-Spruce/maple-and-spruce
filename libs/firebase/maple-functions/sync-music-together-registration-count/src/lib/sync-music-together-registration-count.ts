/**
 * Sync Music Together Registration Count Cloud Function
 *
 * Firestore trigger that updates the Webflow CMS spots-remaining for a Music
 * Together section when a registration is created, updated, or deleted.
 *
 * The Music Together mirror of `syncRegistrationCount` (classes). The section
 * sync trigger only fires on writes to the *section* document, so before this
 * function existed a family registering left the public card advertising the
 * count captured at the last section edit.
 *
 * On any registration write:
 * 1. Skip writes that can't change the family count
 * 2. Extract sectionId from the registration document
 * 3. Look up the section (must be visible)
 * 4. Count enrolled families for the section
 * 5. Re-sync the section to Webflow with the updated count
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
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
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
 * Extract sectionId from a registration snapshot.
 * Returns null if the snapshot doesn't exist or has no sectionId.
 */
export function extractSectionId(
  snapshot: DocumentSnapshot | undefined
): string | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  return data?.['sectionId'] ?? null;
}

/**
 * Fields on the registration document that affect the family count.
 *
 * Capacity is counted per family, not per child, so `children` is deliberately
 * absent — adding a sibling doesn't consume another spot. If none of these
 * changed, syncing would produce the same result and we can skip the
 * (expensive) Webflow call — which also prevents a trigger feedback loop when
 * an unrelated field is updated (installment charges rewrite payment fields and
 * `updatedAt` on every cycle).
 */
const COUNT_RELEVANT_FIELDS = ['sectionId', 'status'] as const;

/**
 * Check whether a write event actually changes the family count.
 *
 * - Create (no before) or delete (no after): always relevant.
 * - Update: relevant only when sectionId or status changed.
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
 * Sync Music Together Registration Count to Webflow CMS
 *
 * Firestore trigger on the musicTogetherRegistrations collection. When a
 * registration is created, updated, or deleted, re-syncs the owning section to
 * Webflow so spots-remaining (and the derived open/full status) is accurate.
 */
export const syncMusicTogetherRegistrationCount = onDocumentWritten(
  {
    document: 'musicTogetherRegistrations/{registrationId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;

    // Guard: skip if the write didn't change any count-relevant fields, so an
    // unrelated update (e.g. an installment charge writing squarePaymentId and
    // updatedAt) doesn't re-fire a Webflow sync that would produce the same
    // field data.
    if (!isCountRelevantChange(change.before, change.after)) {
      console.log(
        'MT registration write did not change count-relevant fields, skipping sync'
      );
      return;
    }

    // Get sectionId from after or before snapshot (covers create, update, delete)
    const sectionId =
      extractSectionId(change.after) ?? extractSectionId(change.before);

    if (!sectionId) {
      console.log('No sectionId found on MT registration, skipping Webflow sync');
      return;
    }

    console.log('Sync MT registration count triggered:', {
      registrationId: event.params.registrationId,
      sectionId,
    });

    // Look up the section — only sync if it's on the public site
    const section = await MusicTogetherSectionRepository.findById(sectionId);

    if (!section) {
      console.log('MT section not found, skipping Webflow sync:', { sectionId });
      return;
    }

    // Hidden sections have no Webflow item — the section trigger removes it.
    // Re-creating one here would resurrect a card Katie deliberately pulled.
    if (!section.visible) {
      console.log('MT section is hidden, skipping Webflow sync:', { sectionId });
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

      const familyCount =
        await MusicTogetherRegistrationRepository.countBySectionId(sectionId);

      console.log('Re-syncing MT section to Webflow with updated count:', {
        sectionId,
        sectionName: section.name,
        familyCount,
        capacityFamilies: section.capacityFamilies,
        autoPublish: shouldPublish,
      });

      const result = await webflow.sectionService.syncSection({
        section,
        publish: shouldPublish,
        isDev,
        familyCount,
        existingWebflowItemId: section.webflowItemId,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
      });

      // Store the Webflow item ID back in Firestore when the section hadn't
      // been synced before. Uses a bare update (no updatedAt) and only writes
      // on a real change, so it can't loop back through the section trigger.
      if (
        result.success &&
        result.webflowItemId &&
        section.webflowItemId !== result.webflowItemId
      ) {
        await MusicTogetherSectionRepository.updateWebflowItemId(
          sectionId,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow sync error (MT registration count):', error);
      // Don't throw — prevent retry loops for Webflow API errors
    }
  }
);
