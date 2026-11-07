/**
 * A confirmed "this item does not exist" from the Webflow API.
 *
 * Anything else (429, 5xx, a socket timeout) means "could not tell", so only
 * a real 404 counts. The SDK's `NotFoundError` carries `statusCode: 404`.
 */
export function isWebflowNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { statusCode?: number }).statusCode === 404
  );
}
