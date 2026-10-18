import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * "Open this page with its create form already open." The sidebar's
 * Create menu links to `/classes?new=1` and friends; the page calls
 * `useCreateIntent` to honour it.
 */
export const CREATE_INTENT_PARAM = 'new';

interface ReadonlyParams {
  get(name: string): string | null;
  toString(): string;
}

export function createIntentHref(path: string): string {
  return `${path}?${CREATE_INTENT_PARAM}=1`;
}

export function hasCreateIntent(params: ReadonlyParams | null): boolean {
  return params?.get(CREATE_INTENT_PARAM) === '1';
}

/** The current URL with the intent removed and every other param kept. */
export function withoutCreateIntent(
  pathname: string,
  params: ReadonlyParams | null,
): string {
  const next = new URLSearchParams(params?.toString() ?? '');
  next.delete(CREATE_INTENT_PARAM);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Run `onCreate` once when the URL carries the create intent, then drop
 * the param so a refresh or the back button doesn't reopen the form.
 *
 * `ready` holds the intent until the page can act on it (e.g. Students
 * needs its instructors loaded to know whether a student can be added).
 * It fires again if the param comes back — the Create menu used while
 * already on the page.
 */
export function useCreateIntent(onCreate: () => void, ready = true): void {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const onCreateRef = useRef(onCreate);

  useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);

  const requested = hasCreateIntent(searchParams);

  useEffect(() => {
    if (!requested || !ready) return;
    onCreateRef.current();
    router.replace(withoutCreateIntent(pathname, searchParams), {
      scroll: false,
    });
  }, [requested, ready, pathname, router, searchParams]);
}
