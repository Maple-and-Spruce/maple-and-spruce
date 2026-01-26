/**
 * Firebase Admin and Firestore configuration
 *
 * IMPORTANT: This module uses lazy initialization to avoid cold start delays.
 * Firebase Admin SDK is NOT initialized at module load time.
 * Instead, getDb() initializes on first call and caches the instance.
 *
 * Migration note: Changed from eager `export const db = ...` to lazy `getDb()`.
 * All repositories should use getDb() instead of importing db directly.
 */
import admin from 'firebase-admin';

let dbInstance: FirebaseFirestore.Firestore | undefined;
let settingsApplied = false;

/**
 * Lazily initialize Firebase Admin SDK
 * Called only when needed, not at module load time
 */
function ensureAdminInitialized(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
}

/**
 * Get the Firestore database instance
 *
 * Lazily initializes Firebase Admin and Firestore on first call.
 * Subsequent calls return the cached instance.
 *
 * @returns Firestore database instance
 *
 * @example
 * const db = getDb();
 * const doc = await db.collection('artists').doc(id).get();
 */
export function getDb(): FirebaseFirestore.Firestore {
  if (!dbInstance) {
    ensureAdminInitialized();
    dbInstance = admin.firestore();

    // Apply settings only once, and only if no operations have been performed yet.
    // Wrap in try-catch because settings() throws if called after any Firestore operation.
    if (!settingsApplied) {
      try {
        dbInstance.settings({ ignoreUndefinedProperties: true, preferRest: true });
      } catch {
        // Settings already applied or Firestore already in use - ignore
      }
      settingsApplied = true;
    }
  }

  return dbInstance;
}

/**
 * Safely convert a Firestore Timestamp, Date, or date-like value to a Date.
 *
 * Handles:
 * - Firestore Timestamp objects (have .toDate() method)
 * - Native Date objects (returned as-is)
 * - Date strings (parsed via new Date())
 * - Numbers (treated as milliseconds since epoch)
 * - null/undefined (returns fallback or new Date())
 *
 * @param value - The value to convert
 * @param fallback - Optional fallback if value is nullish (defaults to new Date())
 * @returns A Date object
 *
 * @example
 * // In repository docToEntity converters:
 * dateTime: toDate(data.dateTime),
 * createdAt: toDate(data.createdAt, new Date()),
 */
export function toDate(
  value: unknown,
  fallback: Date = new Date()
): Date {
  if (value === null || value === undefined) {
    return fallback;
  }

  // Firestore Timestamp - has toDate method
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  // Already a Date
  if (value instanceof Date) {
    return value;
  }

  // String or number - try to parse
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? fallback : parsed;
  }

  return fallback;
}

/**
 * @deprecated Use getDb() instead for lazy initialization
 *
 * This export is kept for backwards compatibility but triggers
 * eager initialization which causes cold start delays.
 */
export const db = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    // Lazily get the real db instance when any property is accessed
    const realDb = getDb();
    const value = realDb[prop as keyof FirebaseFirestore.Firestore];
    if (typeof value === 'function') {
      return value.bind(realDb);
    }
    return value;
  },
});
