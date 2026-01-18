/**
 * Environment utility for Firebase Functions
 *
 * With separate Firebase projects for dev and prod, each project has its own
 * secrets configured with the same names but different values:
 * - Dev project (maple-and-spruce-dev): SQUARE_ACCESS_TOKEN = sandbox token
 * - Prod project (maple-and-spruce): SQUARE_ACCESS_TOKEN = production token
 *
 * This eliminates the need for _PROD suffixes - the project itself determines
 * which credentials are used.
 *
 * The SQUARE_ENV string param is still used to control SDK behavior
 * (e.g., using Square sandbox vs production API endpoints).
 */

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
