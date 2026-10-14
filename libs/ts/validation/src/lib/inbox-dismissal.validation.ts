/**
 * Inbox dismissal validation (#235)
 *
 * "Mark done" on the Home inbox sends the item's key. The key becomes a
 * Firestore document id, so it must be one the inbox could have built:
 * `kind:…`, a known kind, no slashes or whitespace, bounded length.
 */
import { test, enforce, only } from 'vest';
import { inboxKindOfKey, isWellFormedInboxKey } from '@maple/ts/domain';
import { staticSuite } from './static-suite';

export interface InboxDismissalValidationInput {
  key?: unknown;
}

export const inboxDismissalValidation = staticSuite(
  (data: InboxDismissalValidationInput, field?: string | string[]) => {
    only(field);

    test('key', 'Item key is required', () => {
      enforce(typeof data.key === 'string' && data.key.length > 0).isTruthy();
    });

    test('key', 'Item key is not one the inbox builds', () => {
      if (typeof data.key !== 'string' || data.key.length === 0) return;
      enforce(
        isWellFormedInboxKey(data.key) && inboxKindOfKey(data.key) !== undefined
      ).isTruthy();
    });
  }
);
