/**
 * Environment utility for Firebase Functions
 *
 * ## Firebase Project Configuration
 *
 * We use separate Firebase projects for dev and prod:
 * - Dev project: `maple-and-spruce-dev`
 * - Prod project: `maple-and-spruce`
 *
 * Each project has its own secrets configured with the same names but different values:
 * - Dev project: SQUARE_ACCESS_TOKEN = sandbox token
 * - Prod project: SQUARE_ACCESS_TOKEN = production token
 *
 * This eliminates the need for _PROD suffixes - the project itself determines
 * which credentials are used.
 *
 * ## Resource Naming Conventions
 *
 * Firebase resources follow predictable naming patterns based on project ID:
 * - Storage bucket: `{project-id}.firebasestorage.app`
 * - Functions URL: `https://us-east4-{project-id}.cloudfunctions.net/{functionName}`
 * - Firestore: Automatically scoped to project
 *
 * Use the `FirebaseProject` helper to get these values consistently.
 *
 * @see ServiceEnvironment - For Square-specific environment configuration
 * @see FirebaseProject - For Firebase resource naming
 */

/**
 * Firebase project IDs
 */
export const FIREBASE_PROJECTS = {
  dev: 'maple-and-spruce-dev',
  prod: 'maple-and-spruce',
} as const;

export type FirebaseProjectId = (typeof FIREBASE_PROJECTS)[keyof typeof FIREBASE_PROJECTS];

/**
 * Helper for Firebase project configuration
 *
 * Provides consistent access to project-specific resource names.
 * Automatically detects the current project from environment variables.
 *
 * @example
 * ```typescript
 * // In a Cloud Function:
 * const bucket = admin.storage().bucket(FirebaseProject.storageBucket);
 * ```
 */
export class FirebaseProject {
  /**
   * Get the current Firebase project ID
   *
   * Detection order:
   * 1. GCLOUD_PROJECT - Set by Cloud Functions runtime
   * 2. FIREBASE_CONFIG.projectId - Set by Firebase emulator
   * 3. Falls back to prod project (safe default for deployed functions)
   */
  static get projectId(): FirebaseProjectId {
    // GCLOUD_PROJECT is set by Cloud Functions runtime
    const gcloudProject = process.env.GCLOUD_PROJECT;
    if (gcloudProject) {
      return gcloudProject as FirebaseProjectId;
    }

    // FIREBASE_CONFIG is set by Firebase emulator and contains project info
    const firebaseConfig = process.env.FIREBASE_CONFIG;
    if (firebaseConfig) {
      try {
        const config = JSON.parse(firebaseConfig);
        if (config.projectId) {
          return config.projectId as FirebaseProjectId;
        }
      } catch {
        // Invalid JSON, fall through to default
      }
    }

    // Default to prod (deployed functions always have GCLOUD_PROJECT set)
    return FIREBASE_PROJECTS.prod;
  }

  /**
   * Check if running in the dev project
   */
  static get isDev(): boolean {
    return this.projectId === FIREBASE_PROJECTS.dev;
  }

  /**
   * Check if running in the prod project
   */
  static get isProd(): boolean {
    return this.projectId === FIREBASE_PROJECTS.prod;
  }

  /**
   * Get the Firebase Storage bucket name for the current project
   *
   * Format: `{project-id}.firebasestorage.app`
   */
  static get storageBucket(): string {
    return `${this.projectId}.firebasestorage.app`;
  }

  /**
   * Get the Cloud Functions base URL for the current project
   *
   * Format: `https://us-east4-{project-id}.cloudfunctions.net`
   */
  static get functionsBaseUrl(): string {
    return `https://us-east4-${this.projectId}.cloudfunctions.net`;
  }

  /**
   * Get a full Cloud Functions URL for a specific function
   *
   * @param functionName - The function name (e.g., 'squareWebhook')
   * @returns Full URL like `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook`
   */
  static functionUrl(functionName: string): string {
    return `${this.functionsBaseUrl}/${functionName}`;
  }
}

export type EnvironmentMode = 'LOCAL' | 'PROD';

/**
 * Helper class for environment-aware configuration
 *
 * Two modes:
 * - LOCAL: Uses Square sandbox API endpoints
 * - PROD: Uses Square production API endpoints
 *
 * Note: Secrets are now per-project, so no suffix selection is needed.
 * The SQUARE_ENV only controls API endpoint selection.
 */
export class ServiceEnvironment {
  public readonly isProd: boolean;
  public readonly mode: EnvironmentMode;

  constructor(envValue: string | undefined) {
    const normalized = envValue?.toUpperCase() ?? 'LOCAL';
    this.isProd = normalized === 'PROD';
    this.mode = this.isProd ? 'PROD' : 'LOCAL';
  }

  /**
   * Get a secret by name
   *
   * With per-project secrets, we just return the secret directly.
   * No suffix logic needed - the project determines which value is used.
   *
   * @param secrets - Record of all available secrets
   * @param secretName - Secret name (e.g., 'SQUARE_ACCESS_TOKEN')
   * @returns The secret value
   * @throws Error if the required secret is not found
   */
  getSecret<T extends Record<string, string>>(
    secrets: T,
    secretName: string
  ): string {
    const value = secrets[secretName as keyof T];

    if (!value) {
      throw new Error(
        `Secret ${secretName} not configured. ` +
          `Set it using: firebase functions:secrets:set ${secretName}`
      );
    }

    return value;
  }

  /**
   * Select the appropriate config value based on environment
   *
   * Useful when local and prod have different non-secret config values
   *
   * @param localValue - Value for local development
   * @param prodValue - Value for production
   */
  select<T>(localValue: T, prodValue: T): T {
    return this.isProd ? prodValue : localValue;
  }

  /**
   * Get a descriptive label for logging
   */
  get label(): string {
    return this.isProd ? 'production' : 'local';
  }
}
