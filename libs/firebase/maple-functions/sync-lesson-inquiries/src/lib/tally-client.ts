/**
 * Minimal Tally submissions API client (#795).
 *
 * Barrel-free and dependency-free so it can be unit-tested with a stubbed
 * `fetch`, the same way `map-submission.ts` is.
 *
 * The API is free on every Tally plan (including the free tier this account is
 * on), authenticates with a bearer token, is versioned by a date header, and
 * paginates with `page` / `limit` / `hasMore`.
 *
 * @see https://tally.so/help/api
 */
import type { TallyQuestion, TallySubmission } from './map-submission';

/**
 * Pin the API version. Tally versions by date and warns that unpinned requests
 * can break on their changes — a silent shape change here means leads stop
 * being captured, with nothing failing loudly.
 */
export const TALLY_API_VERSION = '2025-02-01';

/**
 * `fetch` has no default timeout. This runs on a schedule rather than inside a
 * webhook's 10s budget, so a hang is not a lost lead — but an unbounded one
 * would hold the function open until the platform kills it, and the next run
 * would find the same wall.
 */
export const TALLY_TIMEOUT_MS = 15_000;

/** Tally's documented ceiling is 100 requests/minute; one form is nowhere near it. */
const DEFAULT_PAGE_SIZE = 50;

/** Refuse to loop forever if `hasMore` never goes false. */
const MAX_PAGES = 40;

export interface TallySubmissionsPageResult {
  questions: TallyQuestion[];
  submissions: TallySubmission[];
  hasMore: boolean;
}

export interface TallyClientConfig {
  baseUrl: string;
  apiKey: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** One page of submissions for a form, newest first (Tally's default order). */
export async function fetchSubmissionsPage(
  config: TallyClientConfig,
  formId: string,
  page: number,
  limit: number = DEFAULT_PAGE_SIZE
): Promise<TallySubmissionsPageResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const url =
    `${config.baseUrl.replace(/\/$/, '')}/forms/${encodeURIComponent(formId)}` +
    `/submissions?page=${page}&limit=${limit}`;

  const response = await doFetch(url, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'tally-version': TALLY_API_VERSION,
    },
    signal: AbortSignal.timeout(TALLY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Tally submissions ${response.status} for form ${formId}: ${body.slice(0, 200)}`
    );
  }

  const payload = (await response.json()) as {
    questions?: TallyQuestion[];
    submissions?: TallySubmission[];
    hasMore?: boolean;
  };

  return {
    questions: payload.questions ?? [],
    submissions: payload.submissions ?? [],
    hasMore: payload.hasMore === true,
  };
}

/**
 * Walk pages until `shouldStop` says the rest are already known, `hasMore` goes
 * false, or `MAX_PAGES` is hit.
 *
 * `shouldStop` is what keeps the steady-state cost at one request: submissions
 * come back newest-first, so once a page contains only ids already stored,
 * everything older is stored too. The **first** run has no such shortcut and
 * walks the whole history on purpose — that backfill is the reason this is a
 * poll and not a webhook. Fourteen inquiries already sat in `dWPQOr` when this
 * was written, none of them ever in the portal, and a webhook could never have
 * gone back for them.
 */
export async function fetchAllSubmissions(
  config: TallyClientConfig,
  formId: string,
  shouldStop: (page: TallySubmissionsPageResult) => boolean = () => false
): Promise<{ questions: TallyQuestion[]; submissions: TallySubmission[] }> {
  const submissions: TallySubmission[] = [];
  let questions: TallyQuestion[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchSubmissionsPage(config, formId, page);
    // `questions` is repeated on every page; the first one is enough.
    if (questions.length === 0) questions = result.questions;
    submissions.push(...result.submissions);

    if (!result.hasMore || result.submissions.length === 0) break;
    if (shouldStop(result)) break;
  }

  return { questions, submissions };
}
