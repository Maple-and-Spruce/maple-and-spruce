/**
 * Sync Class to Square Cloud Function
 *
 * Firestore trigger that mirrors classes to Square as catalog items so they
 * can be rung up at in-person POS. The Square inventory quantity for the
 * class variation tracks remaining seats — POS will refuse to ring up a
 * sold-out class.
 *
 * Triggers on `classes/{classId}` writes:
 * - Class published (create or status flip → published): create catalog
 *   ITEM + ITEM_VARIATION + required selection MODIFIER_LIST, then seed
 *   inventory to (capacity - currentRegistrationCount).
 * - Class updated while still published: update name/description/price on
 *   the existing item; reset inventory if capacity changed.
 * - Class unpublished (published → draft/cancelled/completed) or deleted:
 *   delete the Square catalog item and clear the back-references.
 *
 * Feedback-loop guard: writes triggered by `updateSquareSyncIds` /
 * `clearSquareSyncIds` skip `updatedAt`, but the trigger fires anyway —
 * we early-return when nothing relevant changed.
 */
import {
  onDocumentWritten,
  type Change,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import type { Class } from '@maple/ts/domain';
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

function toDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function extractClass(snapshot: DocumentSnapshot | undefined): Class | null {
  if (!snapshot || !snapshot.exists) {
    return null;
  }
  const data = snapshot.data();
  if (!data) return null;

  return {
    id: snapshot.id,
    ...data,
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as Class;
}

/**
 * Did the write change anything that requires a Square sync?
 *
 * Without this guard the trigger feedback loops: every Square sync stamps
 * `squareCatalogItemId`/`squareVariationId`/`squareModifierListId` back onto
 * the class, which re-fires this trigger, which re-syncs, and so on.
 *
 * The Square sync IDs themselves are *not* in this list, so writes that
 * only touch them are no-ops here.
 */
const SQUARE_RELEVANT_FIELDS: ReadonlyArray<keyof Class> = [
  'name',
  'description',
  'priceCents',
  'capacity',
  'status',
];

function isSquareRelevantChange(
  before: Class | null,
  after: Class | null
): boolean {
  if (!before || !after) return true; // create or delete
  return SQUARE_RELEVANT_FIELDS.some(
    (field) => before[field] !== after[field]
  );
}

export const syncClassToSquare = onDocumentWritten(
  {
    document: 'classes/{classId}',
    region: 'us-east4',
    secrets: squareSecretParams,
  },
  async (event) => {
    const change: Change<DocumentSnapshot> = event.data!;
    const before = extractClass(change.before);
    const after = extractClass(change.after);

    if (!isSquareRelevantChange(before, after)) {
      console.log(
        'Class write did not change Square-relevant fields, skipping sync',
        { classId: event.params.classId }
      );
      return;
    }

    const secrets = Object.fromEntries(
      squareSecretParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_SECRET_NAMES)[number], string>;
    const strings = Object.fromEntries(
      squareStringParams.map((s) => [s.name, s.value()])
    ) as Record<(typeof SQUARE_STRING_NAMES)[number], string>;

    const square = new Square(secrets, strings);

    try {
      // Case 1: class deleted — remove from Square if it was there
      if (!after) {
        if (before?.squareCatalogItemId) {
          console.log('Class deleted, removing from Square', {
            classId: event.params.classId,
            squareItemId: before.squareCatalogItemId,
          });
          await square.catalogService.deleteItem(before.squareCatalogItemId);
        }
        return;
      }

      const becameUnpublished =
        before?.status === 'published' && after.status !== 'published';

      // Case 2: class is no longer published — tear down the Square mirror
      if (becameUnpublished || after.status !== 'published') {
        if (after.squareCatalogItemId) {
          console.log(
            'Class unpublished/non-publishable, removing Square catalog item',
            {
              classId: after.id,
              squareItemId: after.squareCatalogItemId,
              status: after.status,
            }
          );
          await square.catalogService.deleteItem(after.squareCatalogItemId);
          await ClassRepository.clearSquareSyncIds(after.id);
        } else {
          console.log('Class is not published and not in Square, skipping', {
            classId: after.id,
            status: after.status,
          });
        }
        return;
      }

      // Case 3: class is published — sync (create or update)
      const registrationCount = await RegistrationRepository.countByClassId(
        after.id
      );
      const remainingCapacity = Math.max(after.capacity - registrationCount, 0);

      if (!after.squareCatalogItemId || !after.squareVariationId) {
        // No Square mirror yet — create one
        console.log('Creating Square catalog item for published class', {
          classId: after.id,
          name: after.name,
          priceCents: after.priceCents,
          capacity: after.capacity,
          remainingCapacity,
        });

        const created = await square.catalogService.createClassCatalogItem({
          classId: after.id,
          name: after.name,
          description: after.description,
          priceCents: after.priceCents,
        });

        await ClassRepository.updateSquareSyncIds(after.id, {
          squareCatalogItemId: created.squareItemId,
          squareVariationId: created.squareVariationId,
          squareModifierListId: created.squareModifierListId,
          squareCatalogVersion: created.squareCatalogVersion,
        });

        // Seed inventory at remainingCapacity (capacity minus existing
        // registrations). For a brand-new class this is just `capacity`.
        if (remainingCapacity > 0) {
          await square.inventoryService.setQuantity({
            squareVariationId: created.squareVariationId,
            locationId: square.locationId,
            quantity: remainingCapacity,
          });
        }

        console.log('Square catalog item created', {
          classId: after.id,
          squareItemId: created.squareItemId,
          squareVariationId: created.squareVariationId,
          inventory: remainingCapacity,
        });
        return;
      }

      // Existing Square mirror — update name/description/price if changed,
      // and reset inventory if capacity changed.
      const nameChanged = before?.name !== after.name;
      const descriptionChanged = before?.description !== after.description;
      const priceChanged = before?.priceCents !== after.priceCents;
      const capacityChanged = before?.capacity !== after.capacity;

      if (nameChanged || descriptionChanged || priceChanged) {
        console.log('Updating Square catalog item for class', {
          classId: after.id,
          nameChanged,
          descriptionChanged,
          priceChanged,
        });
        const updated = await square.catalogService.updateItem({
          squareItemId: after.squareCatalogItemId,
          squareCatalogVersion: after.squareCatalogVersion ?? 0,
          name: nameChanged ? after.name : undefined,
          description: descriptionChanged ? after.description : undefined,
          variations: priceChanged
            ? [
                {
                  squareVariationId: after.squareVariationId,
                  priceCents: after.priceCents,
                },
              ]
            : undefined,
        });
        await ClassRepository.updateSquareSyncIds(after.id, {
          squareCatalogVersion: updated.squareCatalogVersion,
        });
      }

      if (capacityChanged) {
        console.log('Resetting Square inventory after capacity change', {
          classId: after.id,
          newCapacity: after.capacity,
          remainingCapacity,
        });
        await square.inventoryService.setQuantity({
          squareVariationId: after.squareVariationId,
          locationId: square.locationId,
          quantity: remainingCapacity,
        });
      }
    } catch (error) {
      // Don't throw — Cloud Functions retries triggers on uncaught errors,
      // and a flapping Square API call would fan out into a tight loop.
      console.error('Square sync error (class):', error);
    }
  }
);
