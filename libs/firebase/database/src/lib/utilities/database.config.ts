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

    if (!settingsApplied) {
      dbInstance.settings({ ignoreUndefinedProperties: true, preferRest: true });
      settingsApplied = true;
    }
  }

  return dbInstance;
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
