/**
 * Recipients used by the registration E2E suite (`apps/registration-e2e`).
 *
 * The Pay-flow specs run against the deployed dev project, whose
 * `firestore-send-email` extension delivers via real Gmail SMTP. Test
 * recipients use the reserved `.test` TLD and an `e2e+...` localpart, so
 * any function that queues mail must skip those recipients — otherwise
 * every post-merge run produces a real NXDOMAIN bounce back to the
 * configured From address.
 *
 * Tests should keep using `e2e+...@maplespruce.test` / `e2e-decline+...`
 * patterns; production traffic will never match.
 */
export function isE2ETestEmail(email: string | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (
    lower.endsWith('@maplespruce.test') ||
    lower.startsWith('e2e+') ||
    lower.startsWith('e2e-decline+')
  );
}
