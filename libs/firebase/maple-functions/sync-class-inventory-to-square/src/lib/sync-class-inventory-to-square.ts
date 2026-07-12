/**
 * Sync Class Inventory to Square Cloud Function
 *
 * Firestore trigger on `registrations/{registrationId}` that mirrors
 * remaining-seat counts to Square inventory so POS staff see the right
 * stock when ringing up a class. Firestore is the source of truth for
 * class capacity; Square inventory is a write-through projection.
 *
 * Strategy: on every count-relevant write (create / delete / status or
 * quantity change), recompute the registration count and PHYSICAL_COUNT
 * the Square variation to `(capacity - count)`. PHYSICAL_COUNT is
 * idempotent — preferred over delta-based ADJUSTMENT because two near-
 * simultaneous registration writes can't double-decrement.
 *
 * Skips:
 * - Writes that don't change classId/status/quantity (mirror of the
 *   `sync-registration-count` guard — prevents trigger churn).
 * - Classes with no `squareVariationId` (not yet synced to Square; the
 *   `syncClassToSquare` trigger will set inventory when it runs).
 *
 * Note on Square's echo: setting inventory here makes Square emit an
 * `inventory.count.updated` webhook for this catalog_object_id. The
 * squareWebhook handler (`handleInventoryUpdate`) only matches variations
 * tracked in ProductRepository; class variations live on the Class doc, so
 * the echo falls through as "untracked" and is ignored. No echo guard is
 * needed (unlike the store-product inventory path).
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import {
  ClassRepository,
  RegistrationRepository,
} from '@maple/firebase/database';

const squareSecretParams = SQUARE_SECRET_NAMES.map((name) =>
  defineSecret(name)
);
const squareStringParams = SQUARE_STRING_NAMES.map((name) =>
  defineString(name)
);

function extractClassId(snapshot: DocumentSnapshot | undefined): string | null {
  if (!snapshot || !snapshot.exists) return null;
  const data = snapshot.data();
  return (data?.['classId'] as string | undefined) ?? null;
}

const COUNT_RELEVANT_FIELDS = ['classId', 'status', 'quantity'] as const;

function isCountRelevantChange(
  before: DocumentSnapshot | undefined,
  after: DocumentSnapshot | undefined
): boolean {
  const beforeExists = before?.exists ?? false;
  const afterExists = after?.exists ?? false;
  if (!beforeExists || !afterExists) return true;

  const beforeData = before!.data();
  const afterData = after!.data();
  if (!beforeData || !afterData) return true;

  return COUNT_RELEVANT_FIELDS.some(
    (field) => beforeData[field] !== afterData[field]
  );
}

export const syncClassInventoryToSquare = onDocumentWritten(
  {
    document: 'registrations/{registrationId}',
    region: 'us-east4',
    secrets: squareSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;

    if (!isCountRelevantChange(change.before, change.after)) {
      return;
    }

    const classId =
      extractClassId(change.after) ?? extractClassId(change.before);
    if (!classId) {
      console.log('Registration write has no classId, skipping Square inventory sync');
      return;
    }

    const classEntity = await ClassRepository.findById(classId);
    if (!classEntity) {
      console.log('Class not found, skipping Square inventory sync', { classId });
      return;
    }

    if (!classEntity.squareVariationId) {
      return;
    }

    const registrationCount = await RegistrationRepository.countByClassId(classId);
    const remaining = Math.max(classEntity.capacity - registrationCount, 0);

    const secrets = Object.fromEntries(
      squareSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;
    const strings = Object.fromEntries(
      squareStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

    const square = new Square(secrets, strings);

    try {
      console.log('Syncing class inventory to Square', {
        classId,
        squareVariationId: classEntity.squareVariationId,
        capacity: classEntity.capacity,
        registrationCount,
        remaining,
      });
      await square.inventoryService.setQuantity({
        squareVariationId: classEntity.squareVariationId,
        locationId: square.locationId,
        quantity: remaining,
      });
    } catch (error) {
      console.error('Square inventory sync error (class):', error);
    }
  }
);
