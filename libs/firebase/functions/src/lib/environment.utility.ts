/**
 * Environment utility for Firebase Functions
 *
 * Provides a consistent pattern for determining local vs production environment
 * and selecting the appropriate secrets/configuration.
 *
 * Two modes:
 * - LOCAL: Local development with sandbox/test credentials
 * - PROD: Production deployment with production credentials
 *
 * Pattern: Each service defines its own *_ENV string param (e.g., SQUARE_ENV)
 * that controls which credentials to use. This utility provides helpers
 * for implementing that pattern consistently.
 *
 * @example
 * ```typescript
 * // In a service class constructor:
 * const env = new ServiceEnvironment(strings.SQUARE_ENV);
 * const token = env.selectSecret(secrets, 'SQUARE_ACCESS_TOKEN');
 * ```
 */

export type EnvironmentMode = 'LOCAL' | 'PROD';

/**
 * Helper class for environment-aware secret/config selection
 *
 * Two modes:
 * - LOCAL: Uses base secret names (e.g., SQUARE_ACCESS_TOKEN)
 * - PROD: Uses _PROD suffix (e.g., SQUARE_ACCESS_TOKEN_PROD)
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
   * Select the appropriate secret based on environment
   *
   * Convention: Production secrets have _PROD suffix
   *
   * @param secrets - Record of all available secrets
   * @param baseName - Base secret name (e.g., 'SQUARE_ACCESS_TOKEN')
   * @returns The appropriate secret value for the current environment
   * @throws Error if the required secret is not found
   *
   * @example
   * ```typescript
   * const env = new ServiceEnvironment('PROD');
   * // Returns secrets.SQUARE_ACCESS_TOKEN_PROD
   * const token = env.selectSecret(secrets, 'SQUARE_ACCESS_TOKEN');
   *
   * const env2 = new ServiceEnvironment('LOCAL');
   * // Returns secrets.SQUARE_ACCESS_TOKEN
   * const token2 = env2.selectSecret(secrets, 'SQUARE_ACCESS_TOKEN');
   * ```
   */
  selectSecret<T extends Record<string, string>>(
    secrets: T,
    baseName: string
  ): string {
    const secretName = this.isProd ? `${baseName}_PROD` : baseName;
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

/**
 * Standard secret name pairs for services
 *
 * Helper to generate the array of secret names needed for defineSecret()
 *
 * @example
 * ```typescript
 * const SQUARE_SECRETS = secretPair('SQUARE_ACCESS_TOKEN');
 * // Returns ['SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN_PROD']
 * ```
 */
export function secretPair(baseName: string): [string, string] {
  return [baseName, `${baseName}_PROD`];
}

/**
 * Flatten multiple secret pairs into a single array
 *
 * @example
 * ```typescript
 * const ALL_SECRETS = secretPairs('SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SECRET');
 * // Returns ['SQUARE_ACCESS_TOKEN', 'SQUARE_ACCESS_TOKEN_PROD',
 * //          'SQUARE_WEBHOOK_SECRET', 'SQUARE_WEBHOOK_SECRET_PROD']
 * ```
 */
export function secretPairs(...baseNames: string[]): string[] {
  return baseNames.flatMap((name) => secretPair(name));
}
