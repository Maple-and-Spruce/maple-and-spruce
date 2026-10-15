'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { httpsCallableFromURL } from 'firebase/functions';
import {
  getMapleFunctions,
  routerCallableUrl,
} from '@maple/ts/firebase/firebase-config';
import type { InboxItem, RequestState } from '@maple/ts/domain';
import type {
  DismissInboxItemRequest,
  DismissInboxItemResponse,
  GetInboxRequest,
  GetInboxResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The studio-wide inbox on the admin Home dashboard (#235).
 *
 * Admin-only server-side, so mount it with `enabled` false for anyone else.
 *
 * `dismiss` is optimistic: the row leaves at once, and the call that records
 * it for everyone runs behind. If that call fails the row is put back where
 * it was and `dismissError` says so — a row that silently came back on the
 * next load would look like the click did nothing.
 */
export function useInbox(enabled = true) {
  const [inboxState, setInboxState] = useState<RequestState<InboxItem[]>>({
    status: 'idle',
  });
  const [dismissError, setDismissError] = useState<string | null>(null);
  // The list as last loaded, so a failed dismissal can restore its row's
  // original position even after other rows have been dismissed since.
  const loadedRef = useRef<InboxItem[]>([]);

  const fetchInbox = useCallback(async () => {
    setInboxState({ status: 'loading' });
    try {
      const fn = httpsCallableFromURL<GetInboxRequest, GetInboxResponse>(
        getMapleFunctions(),
        routerCallableUrl('lessons', 'getInbox')
      );
      const result = await fn({});
      loadedRef.current = result.data.items;
      setInboxState({ status: 'success', data: result.data.items });
    } catch (error) {
      console.error('Failed to fetch the inbox:', error);
      setInboxState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to fetch',
      });
    }
  }, []);

  const dismiss = useCallback(async (key: string) => {
    setDismissError(null);
    setInboxState((state) =>
      state.status === 'success'
        ? { status: 'success', data: state.data.filter((i) => i.key !== key) }
        : state
    );
    try {
      const fn = httpsCallableFromURL<
        DismissInboxItemRequest,
        DismissInboxItemResponse
      >(getMapleFunctions(), routerCallableUrl('lessons', 'dismissInboxItem'));
      await fn({ key });
    } catch (error) {
      console.error('Failed to mark an inbox item done:', error);
      setInboxState((state) => {
        if (state.status !== 'success') return state;
        if (state.data.some((i) => i.key === key)) return state;
        const order = loadedRef.current.map((i) => i.key);
        const item = loadedRef.current.find((i) => i.key === key);
        if (!item) return state;
        const restored = [...state.data, item].sort(
          (a, b) => order.indexOf(a.key) - order.indexOf(b.key)
        );
        return { status: 'success', data: restored };
      });
      setDismissError("Couldn't mark that done. It's back in the list; try again.");
    }
  }, []);

  const clearDismissError = useCallback(() => setDismissError(null), []);

  useEffect(() => {
    if (enabled) fetchInbox();
  }, [enabled, fetchInbox]);

  return { inboxState, fetchInbox, dismiss, dismissError, clearDismissError };
}
