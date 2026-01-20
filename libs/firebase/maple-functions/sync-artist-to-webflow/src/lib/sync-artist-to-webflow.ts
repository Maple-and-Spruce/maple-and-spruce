/**
 * Sync Artist to Webflow Cloud Function
 *
 * Firestore trigger that syncs artist changes to Webflow CMS.
 * Follows one-way sync pattern: Firebase → Webflow (as per ADR-016).
 *
 * Triggers on:
 * - Artist created: Creates new item in Webflow CMS (if status = active)
 * - Artist updated: Updates item in Webflow CMS (or creates/removes based on status)
 * - Artist deleted: Removes item from Webflow CMS
 *
 * @see docs/decisions/ADR-016-webflow-integration-strategy.md
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Artist } from '@maple/ts/domain';
import {
  Webflow,
  WEBFLOW_SECRET_NAMES,
  WEBFLOW_STRING_NAMES,
} from '@maple/firebase/webflow';
import { ArtistRepository } from '@maple/firebase/database';

// Define secrets and strings for Webflow
const webflowSecrets = WEBFLOW_SECRET_NAMES.map((name) => defineSecret(name));
const webflowStrings = WEBFLOW_STRING_NAMES.map((name) => defineString(name));

/**
 * Extract artist data from Firestore snapshot
 */
function extractArtist(snapshot: DocumentSnapshot | undefined): Artist | null {
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
  } as Artist;
}

/**
 * Sync Artist to Webflow CMS
 *
 * Firestore trigger that runs when an artist document is created, updated, or deleted.
 * Only syncs active artists to Webflow; inactive/deleted artists are removed.
 */
export const syncArtistToWebflow = onDocumentWritten(
  {
    document: 'artists/{artistId}',
    region: 'us-east4',
    secrets: webflowSecrets,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const beforeArtist = extractArtist(change.before);
    const afterArtist = extractArtist(change.after);

    console.log('Sync artist to Webflow triggered:', {
      artistId: event.params.artistId,
      before: beforeArtist
        ? { name: beforeArtist.name, status: beforeArtist.status }
        : null,
      after: afterArtist
        ? { name: afterArtist.name, status: afterArtist.status }
        : null,
    });

    // Build Webflow client
    const secrets = Object.fromEntries(
      webflowSecrets.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_SECRET_NAMES)[number], string>;

    const strings = Object.fromEntries(
      webflowStrings.map((s) => [s.name, s.value()])
    ) as Record<(typeof WEBFLOW_STRING_NAMES)[number], string>;

    const webflow = new Webflow(secrets, strings);

    try {
      // Case 1: Artist deleted
      if (!afterArtist) {
        console.log('Artist deleted, removing from Webflow');
        const removed = await webflow.artistService.removeArtist(
          event.params.artistId
        );
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Artist not found in Webflow (already removed?)'
        );
        return;
      }

      // Case 2: Artist became inactive (was active, now inactive)
      if (
        beforeArtist?.status === 'active' &&
        afterArtist.status !== 'active'
      ) {
        console.log('Artist became inactive, removing from Webflow');
        const removed = await webflow.artistService.removeArtist(afterArtist.id);
        console.log(
          removed
            ? 'Successfully removed from Webflow'
            : 'Artist not found in Webflow'
        );
        return;
      }

      // Case 3: Artist is not active (skip sync)
      if (afterArtist.status !== 'active') {
        console.log('Artist is not active, skipping Webflow sync');
        return;
      }

      // Case 4: Artist is active - sync to Webflow
      console.log('Syncing active artist to Webflow:', afterArtist.name);
      const result = await webflow.artistService.syncArtist({
        artist: afterArtist,
      });

      console.log('Webflow sync result:', {
        success: result.success,
        webflowItemId: result.webflowItemId,
        isNew: result.isNew,
      });

      // Store the Webflow item ID back in Firestore for reference
      if (result.success && result.webflowItemId) {
        await ArtistRepository.updateWebflowItemId(
          afterArtist.id,
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
