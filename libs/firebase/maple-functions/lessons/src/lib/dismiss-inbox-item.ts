/**
 * Dismiss Inbox Item (#235)
 *
 * "Mark done" on the Home inbox. Studio-wide: the dismissal is stored, not
 * kept in one browser, so it holds across reloads and for Katie and Nathan
 * alike. The router validates the key (`inboxDismissalValidation`) before
 * this runs, so only a key the inbox could have built becomes a document.
 */
import { type FunctionContext } from '@maple/firebase/functions';
import { InboxDismissalRepository } from '@maple/firebase/database';
import { inboxKindOfKey, type InboxItemKind } from '@maple/ts/domain';
import type {
  DismissInboxItemRequest,
  DismissInboxItemResponse,
} from '@maple/ts/firebase/api-types';

export async function dismissInboxItem(
  data: DismissInboxItemRequest,
  context: FunctionContext
): Promise<DismissInboxItemResponse> {
  await InboxDismissalRepository.dismiss({
    key: data.key,
    // Validated as a known kind before the handler runs.
    kind: inboxKindOfKey(data.key) as InboxItemKind,
    dismissedByUid: context?.uid,
  });
  return { key: data.key };
}
