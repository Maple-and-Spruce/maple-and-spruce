/**
 * Migrate Class Sessions Cloud Function
 *
 * One-off admin-only migration that converts legacy class documents with a
 * scalar `dateTime` field into the new multi-session shape:
 *
 *   { sessions: [{ dateTime: <Timestamp> }], firstSessionAt: <Timestamp> }
 *
 * Also backfills `firstSessionAt` for any class doc that already has a
 * `sessions` array but is missing the denormalized sort key.
 *
 * Safe to run multiple times — it only touches documents that actually need
 * updating. Intended to be invoked manually once per environment (dev, prod)
 * after deploying the multi-session schema, then deleted.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { getDb } from '@maple/firebase/database';

export interface MigrateClassSessionsRequest {
  /** If true, log what would change without writing. */
  dryRun?: boolean;
}

export interface MigrateClassSessionsResponse {
  scanned: number;
  migrated: number;
  alreadyMigrated: number;
  backfilledFirstSessionAt: number;
  skippedMissingDate: number;
  dryRun: boolean;
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
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
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export const migrateClassSessions = createAdminFunction<
  MigrateClassSessionsRequest,
  MigrateClassSessionsResponse
>(async (data) => {
  const dryRun = data.dryRun === true;
  const db = getDb();

  const snapshot = await db.collection('classes').get();

  let migrated = 0;
  let alreadyMigrated = 0;
  let backfilledFirstSessionAt = 0;
  let skippedMissingDate = 0;

  for (const doc of snapshot.docs) {
    const raw = doc.data();
    const hasSessionsArray =
      Array.isArray(raw.sessions) && raw.sessions.length > 0;
    const hasFirstSessionAt = !!raw.firstSessionAt;

    if (hasSessionsArray) {
      if (!hasFirstSessionAt) {
        // Backfill firstSessionAt from the earliest session
        const dates = raw.sessions
          .map((s: unknown) => {
            if (s && typeof s === 'object' && 'dateTime' in s) {
              return tsToDate((s as { dateTime: unknown }).dateTime);
            }
            return tsToDate(s);
          })
          .filter((d: Date | null): d is Date => d !== null);

        if (dates.length === 0) {
          skippedMissingDate++;
          console.warn(`Class ${doc.id}: has sessions but no parseable dates`);
          continue;
        }

        const earliest = new Date(Math.min(...dates.map((d: Date) => d.getTime())));

        if (!dryRun) {
          await doc.ref.update({ firstSessionAt: earliest });
        }
        backfilledFirstSessionAt++;
        console.log(
          `Class ${doc.id}: backfilled firstSessionAt=${earliest.toISOString()}${dryRun ? ' (dry run)' : ''}`
        );
      } else {
        alreadyMigrated++;
      }
      continue;
    }

    // Legacy class — convert scalar dateTime into sessions[]
    const legacyDate = tsToDate(raw.dateTime);
    if (!legacyDate) {
      skippedMissingDate++;
      console.warn(
        `Class ${doc.id}: no sessions[] and no parseable dateTime — skipping`
      );
      continue;
    }

    const update: Record<string, unknown> = {
      sessions: [{ dateTime: legacyDate }],
      firstSessionAt: legacyDate,
      dateTime: null, // clear legacy field
    };

    if (!dryRun) {
      await doc.ref.update(update);
    }
    migrated++;
    console.log(
      `Class ${doc.id}: migrated legacy dateTime=${legacyDate.toISOString()} to sessions[]${dryRun ? ' (dry run)' : ''}`
    );
  }

  const result: MigrateClassSessionsResponse = {
    scanned: snapshot.size,
    migrated,
    alreadyMigrated,
    backfilledFirstSessionAt,
    skippedMissingDate,
    dryRun,
  };

  console.log('migrateClassSessions complete:', result);
  return result;
});
