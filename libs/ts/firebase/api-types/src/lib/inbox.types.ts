/**
 * Home inbox API types (#235): the studio-wide to-do list on the admin Home
 * dashboard, and "Mark done". Both are admin-only routes on the lessons router.
 */
import type { InboxItem } from '@maple/ts/domain';

export type GetInboxRequest = Record<string, never>;

export interface GetInboxResponse {
  /** Most urgent first, dismissed items already removed. */
  items: InboxItem[];
}

export interface DismissInboxItemRequest {
  /** The item's `key`, exactly as `getInbox` returned it. */
  key: string;
}

export interface DismissInboxItemResponse {
  key: string;
}
