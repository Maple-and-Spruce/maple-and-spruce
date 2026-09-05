/**
 * Standalone Tally submissions-API mock HTTP server.
 *
 * Serves `GET /forms/{formId}/submissions` for `syncLessonInquiries`, the one
 * function that had no integration coverage at all — which is how a mapping
 * bug reached production and stored `contactName: "Unknown"` on all 14 leads
 * (#816). Unit tests could not catch it because their fixtures were written
 * from the documented shape rather than a real response, so they asserted the
 * assumption that was wrong.
 *
 * THE FIXTURES HERE ARE THE REAL SHAPE, AND THAT IS THE WHOLE POINT
 * ----------------------------------------------------------------
 * Captured from `dWPQOr` on 2026-09-05. Note what the question text is under:
 *
 *   { "type": "INPUT_TEXT", "id": "0EKjV0", "title": "Parent or Student Name",
 *     "isTitleModifiedByUser": false, "formId": "dWPQOr", "isDeleted": false,
 *     "numberOfResponses": 14, "fields": [...] }
 *
 * `title`. There is **no** `label` key anywhere in the response. A mock that
 * invents `label` would pass a green suite and prove nothing, so this one
 * refuses to emit it — see `makeQuestion`. The webhook body is a different
 * shape again (`{ key, label, type, value }`); do not cross-pollinate them.
 *
 * Per-service mock server, parallel to
 * libs/firebase/{square,webflow,etsy,ga4,meta-capi}-test-mock-server.
 */
import http from 'http';

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  timestamp: Date;
}

/** A question in the shape the live API actually returns. */
export interface TallyMockQuestion {
  id: string;
  type: string;
  title: string | null;
  isTitleModifiedByUser: boolean;
  formId: string;
  isDeleted: boolean;
  numberOfResponses: number;
  fields: { uuid: string; type: string; questionType: string; title: string }[];
}

export interface TallyMockSubmission {
  id: string;
  isCompleted: boolean;
  submittedAt: string;
  responses: { questionId: string; answer: unknown }[];
}

export interface TallyMockForm {
  questions: TallyMockQuestion[];
  submissions: TallyMockSubmission[];
}

export interface TallyMockInstance {
  server: TallyMockServer;
  reset: () => void;
}

/**
 * Build a question the way Tally does.
 *
 * Deliberately constructs `title` and never `label`. If a future change makes
 * the mapper read some other key, this mock will fail rather than quietly
 * agree with it — which is the property the old hand-written fixtures lacked.
 */
export function makeQuestion(
  id: string,
  type: string,
  title: string | null,
  formId = 'testform'
): TallyMockQuestion {
  return {
    id,
    type,
    title,
    isTitleModifiedByUser: false,
    formId,
    isDeleted: false,
    numberOfResponses: 0,
    fields: title
      ? [
          {
            uuid: `${id}-field`,
            type: 'INPUT_FIELD',
            questionType: type,
            title,
          },
        ]
      : [],
  };
}

/** The general music form's real question set (`dWPQOr`). */
export function generalMusicQuestions(formId = 'testform'): TallyMockQuestion[] {
  return [
    makeQuestion('0EKjV0', 'INPUT_TEXT', 'Parent or Student Name', formId),
    makeQuestion('zKkQE8', 'INPUT_EMAIL', 'Email', formId),
    makeQuestion('5dJqXP', 'INPUT_PHONE_NUMBER', 'Phone Number', formId),
    // HIDDEN_FIELDS carries no question-level title, so it is only findable
    // by type. Real forms differ in what they hold — dWPQOr's are
    // `instrument`/`lesson_subject`, not utm_*.
    makeQuestion('AJXEjl', 'HIDDEN_FIELDS', null, formId),
    makeQuestion(
      'dYO2by',
      'MULTI_SELECT',
      'Which instrument are you interested in?',
      formId
    ),
    makeQuestion('YZ1zj6', 'MULTIPLE_CHOICE', 'Who is the student?', formId),
    makeQuestion('DVjvqj', 'MULTIPLE_CHOICE', 'Experience level', formId),
  ];
}

export class TallyMockServer {
  private server: http.Server | null = null;
  private _requests: RecordedRequest[] = [];
  private forms = new Map<string, TallyMockForm>();

  /** When set, submissions requests answer with this status instead of 200. */
  failureStatus: number | null = null;

  get requests(): readonly RecordedRequest[] {
    return this._requests;
  }

  clearRequests(): void {
    this._requests = [];
  }

  setForm(formId: string, form: TallyMockForm): void {
    this.forms.set(formId, form);
  }

  clearForms(): void {
    this.forms.clear();
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const body = await readBody(req);
        const method = req.method?.toUpperCase() ?? 'GET';
        const url = req.url ?? '/';
        const [path, queryString = ''] = url.split('?');
        const query: Record<string, string> = {};
        if (queryString) {
          for (const [k, v] of new URLSearchParams(queryString)) query[k] = v;
        }

        this._requests.push({
          method,
          path,
          query,
          headers: req.headers,
          timestamp: new Date(),
        });

        const json = (status: number, payload: unknown) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };

        // -- test-control surface (the mock runs in its own process) ---------
        if (method === 'POST' && path === '/_mock/reset') {
          this.clearRequests();
          this.clearForms();
          this.failureStatus = null;
          return json(200, { ok: true });
        }
        if (method === 'GET' && path === '/_mock/requests') {
          return json(200, { requests: this._requests });
        }
        if (method === 'POST' && path === '/_mock/form') {
          const payload = body as
            | { formId?: string; form?: TallyMockForm }
            | undefined;
          if (!payload?.formId || !payload.form) {
            return json(400, { error: 'formId and form are required' });
          }
          this.setForm(payload.formId, payload.form);
          return json(200, { ok: true });
        }
        if (method === 'POST' && path === '/_mock/failure-status') {
          const status = (body as { status?: number } | undefined)?.status;
          this.failureStatus = typeof status === 'number' ? status : null;
          return json(200, { ok: true, failureStatus: this.failureStatus });
        }

        // -- the real endpoint ------------------------------------------------
        const match = /^\/forms\/([^/]+)\/submissions$/.exec(path);
        if (method === 'GET' && match) {
          // The client must authenticate. Answering 200 to an unauthenticated
          // request would let a broken auth header ship silently.
          const auth = req.headers['authorization'];
          if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
            return json(401, { error: 'Unauthorized' });
          }
          if (this.failureStatus) {
            return json(this.failureStatus, { error: 'simulated Tally failure' });
          }

          const formId = decodeURIComponent(match[1]);
          const form = this.forms.get(formId);
          if (!form) {
            return json(404, { error: `No such form: ${formId}` });
          }

          const page = Number.parseInt(query['page'] ?? '1', 10) || 1;
          const limit = Number.parseInt(query['limit'] ?? '50', 10) || 50;
          const start = (page - 1) * limit;
          const slice = form.submissions.slice(start, start + limit);

          return json(200, {
            page,
            limit,
            total: form.submissions.length,
            hasMore: start + limit < form.submissions.length,
            // Repeated on every page, exactly as the live API does.
            questions: form.questions,
            submissions: slice,
          });
        }

        json(404, {
          error: 'Tally mock server: no route matched',
          method,
          path,
        });
      });

      this.server.on('error', reject);
      this.server.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

export function createTallyMockServer(): TallyMockInstance {
  const server = new TallyMockServer();
  return {
    server,
    reset: () => {
      server.clearRequests();
      server.clearForms();
      server.failureStatus = null;
    },
  };
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}
