/**
 * Sync Music Together Demo RSVP Count Cloud Function
 *
 * Firestore trigger that updates the Webflow CMS spots-remaining for a Music
 * Together demo class when an RSVP is created, updated, or deleted.
 *
 * The demo mirror of `syncMusicTogetherRegistrationCount` (sections) and
 * `syncRegistrationCount` (classes). The demo sync trigger only fires on
 * writes to the *demo* document, and RSVPs live in its `rsvps` subcollection,
 * so before this function existed a family RSVPing left the public card
 * advertising the count captured at the last demo edit.
 *
 * On any RSVP write:
 * 1. Skip writes that can't change the confirmed count
 * 2. Look up the demo (must be visible and upcoming)
 * 3. Count confirmed RSVPs for the demo
 * 4. Re-sync the demo to Webflow with the updated count
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
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';
import { reportSyncFailure } from '@maple/firebase/sync-alerts';

// Define secrets INLINE to avoid cold start delays
const webflowSecretParams = WEBFLOW_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const webflowStringParams = WEBFLOW_STRING_NAMES.map((name) =>
  defineString(name)
);

/**
 * Check whether an RSVP write can change the demo's confirmed count.
 *
 * - Create (no before) or delete (no after): always relevant.
 * - Update: relevant only when `status` changed (a re-RSVP that moves a
 *   family between `confirmed` and `waitlisted`). Name or email edits on an
 *   existing RSVP don't consume or free a spot.
 */
export function isCountRelevantChange(
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined
): boolean {
  const beforeExists = before?.exists ?? false;
  const afterExists = after?.exists ?? false;

  if (!beforeExists || !afterExists) {
    return true;
  }

  const beforeData = before!.data();
  const afterData = after!.data();

  // If either snapshot has no data, treat as relevant (defensive)
  if (!beforeData || !afterData) {
    return true;
  }

  return beforeData['status'] !== afterData['status'];
}

/**
 * Sync Music Together Demo RSVP Count to Webflow CMS
 *
 * Firestore trigger on `musicTogetherDemos/{demoId}/rsvps/{rsvpId}`. Re-syncs
 * the owning demo so spots-remaining (and the derived open/full status) is
 * accurate on the public site.
 */
export const syncMusicTogetherDemoRsvpCount = onDocumentWritten(
  {
    document: 'musicTogetherDemos/{demoId}/rsvps/{rsvpId}',
    region: 'us-east4',
    secrets: webflowSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;

    if (!isCountRelevantChange(change.before, change.after)) {
      console.log(
        'MT demo RSVP write did not change status, skipping Webflow sync'
      );
      return;
    }

    const demoId = event.params.demoId;
    console.log('Sync MT demo RSVP count triggered:', {
      demoId,
      rsvpId: event.params.rsvpId,
    });

    const demo = await MusicTogetherDemoRepository.findById(demoId);

    if (!demo) {
      console.log('MT demo not found, skipping Webflow sync:', { demoId });
      return;
    }

    // Hidden and past demos have no Webflow item — the demo trigger removes
    // them. Re-creating one here would resurrect a card an admin pulled.
    if (!demo.visible || demo.dateTime.getTime() < Date.now()) {
      console.log('MT demo is hidden or past, skipping Webflow sync:', {
        demoId,
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

      const confirmedCount =
        await MusicTogetherDemoRsvpRepository.countByDemoIdAndStatus(
          demoId,
          'confirmed'
        );

      console.log('Re-syncing MT demo to Webflow with updated count:', {
        demoId,
        confirmedCount,
        capacityFamilies: demo.capacityFamilies,
        autoPublish: shouldPublish,
      });

      const result = await webflow.demoService.syncDemo({
        demo,
        publish: shouldPublish,
        isDev,
        confirmedCount,
        existingWebflowItemId: demo.webflowItemId,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
      });

      // Store the Webflow item ID back in Firestore when the demo hadn't been
      // synced before. Bare update, only on a real change, so it can't loop.
      if (
        result.success &&
        result.webflowItemId &&
        demo.webflowItemId !== result.webflowItemId
      ) {
        await MusicTogetherDemoRepository.updateWebflowItemId(
          demoId,
          result.webflowItemId
        );
        console.log('Updated Firestore with Webflow item ID');
      }
    } catch (error) {
      console.error('Webflow sync error (MT demo RSVP count):', error);
      await reportSyncFailure({
        source: 'syncMusicTogetherDemoRsvpCount',
        destination: 'Webflow',
        entityType: 'Music Together demo spot count',
        entityId: demoId,
        entityLabel: demo.location,
        error,
      });
      // Don't throw — prevent retry loops for Webflow API errors
    }
  }
);
