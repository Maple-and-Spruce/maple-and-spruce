/**
 * Tally submission -> LessonInquiry mapping (#795).
 *
 * Kept barrel-free and dependency-free on purpose: this is the part most likely
 * to break silently (Tally labels are editable by a human in a web UI), so it
 * has to be unit-testable without dragging in firebase-admin.
 *
 * THE API SHAPE IS NOT THE WEBHOOK SHAPE
 * --------------------------------------
 * `tallyLeadWebhook` parses the webhook body, where each field arrives
 * self-describing: `{ key, label, type, value }`. The submissions API is
 * different and this was verified against real submissions, not assumed:
 *
 *   questions:   [{ id, type, label }]          <- once per page, not per submission
 *   submissions: [{ id, isCompleted, submittedAt,
 *                   responses: [{ questionId, answer }] }]
 *
 * So a response only makes sense joined to its question, and `answer` is
 * polymorphic: a plain string for text/email/phone, a string array for choice
 * fields (already resolved to option **text**, so no uuid lookup is needed),
 * and a single **object** keyed by field name for the HIDDEN_FIELDS question.
 * A HIDDEN_FIELDS question has `label: null`, so it can only be found by type.
 *
 * TWO FORMS, DIFFERENT QUESTIONS
 * ------------------------------
 * `QKQb6k` is the Suzuki funnel from `/suzuki` — it asks the student's age,
 * availability and Hope Scholarship status. `dWPQOr` is the older general music
 * form still serving `/music` and `/music-lessons` (fiddle, harp, old-time),
 * which asks none of those and labels its name and instrument questions
 * differently. Both are captured; a field the form does not ask is absent,
 * never invented.
 *
 * Email and phone are matched by **question type**, not label, because the two
 * forms label them differently and a label-only lookup is how Music Together
 * leads were nearly dropped at validation before. Everything else matches a
 * list of candidate labels, normalised, so an editor retitling "Your name" to
 * "Your Name" does not silently drop the field.
 */

export interface TallyQuestion {
  id: string;
  type?: string;
  /** Null for HIDDEN_FIELDS, which is why that one is found by type. */
  label?: string | null;
}

export interface TallyResponse {
  questionId: string;
  answer?: unknown;
}

export interface TallySubmission {
  id: string;
  isCompleted?: boolean;
  submittedAt?: string;
  responses?: TallyResponse[];
}

export interface TallySubmissionsPage {
  page?: number;
  limit?: number;
  hasMore?: boolean;
  questions?: TallyQuestion[];
  submissions?: TallySubmission[];
}

export interface MappedLessonInquiry {
  id: string;
  formId: string;
  formName: string;
  submittedAt: Date;
  contactName: string;
  email: string;
  phone?: string;
  studentFirstName?: string;
  studentAge?: number;
  interest?: string;
  availability: string[];
  hopeScholarship?: 'yes' | 'no' | 'unsure';
  message?: string;
  attribution: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    referrer?: string;
    landingPage?: string;
  };
}

/**
 * Human labels for the forms we ingest, so the queue reads without anyone
 * knowing form ids. An unlisted form still ingests — it just shows its id.
 */
const FORM_NAMES: Record<string, string> = {
  QKQb6k: 'Suzuki interview request',
  dWPQOr: 'Music lesson inquiry',
};

export function formNameFor(formId: string): string {
  return Object.prototype.hasOwnProperty.call(FORM_NAMES, formId)
    ? FORM_NAMES[formId]
    : formId;
}

/** Lowercase, strip punctuation and collapse whitespace, so label drift is tolerated. */
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Answer -> list of plain strings. Objects (hidden fields) are handled separately. */
function toStrings(answer: unknown): string[] {
  if (answer === null || answer === undefined || answer === '') return [];
  const raw = Array.isArray(answer) ? answer : [answer];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed !== '') out.push(trimmed);
    } else if (typeof entry === 'number' || typeof entry === 'boolean') {
      out.push(String(entry));
    }
    // Objects and nulls are not answers a person typed; drop them.
  }
  return out;
}

/**
 * Lookup helper bound to one submission, joining responses to their questions.
 * Built once per submission so each field access is a map hit, not a scan.
 */
function buildLookup(submission: TallySubmission, questions: TallyQuestion[]) {
  const answersByQuestionId = new Map<string, unknown>();
  for (const response of submission.responses ?? []) {
    if (response?.questionId) {
      answersByQuestionId.set(response.questionId, response.answer);
    }
  }

  const idsByNormalizedLabel = new Map<string, string>();
  const idsByType = new Map<string, string[]>();
  for (const question of questions) {
    if (!question?.id) continue;
    if (question.label) {
      const key = normalizeLabel(question.label);
      // First question wins — a duplicated label is a form-authoring mistake,
      // and silently preferring the later one would be surprising.
      if (!idsByNormalizedLabel.has(key)) {
        idsByNormalizedLabel.set(key, question.id);
      }
    }
    if (question.type) {
      const existing = idsByType.get(question.type) ?? [];
      existing.push(question.id);
      idsByType.set(question.type, existing);
    }
  }

  return {
    byLabel(candidates: string[]): string[] {
      for (const candidate of candidates) {
        const id = idsByNormalizedLabel.get(normalizeLabel(candidate));
        if (!id) continue;
        const values = toStrings(answersByQuestionId.get(id));
        if (values.length > 0) return values;
      }
      return [];
    },
    byType(type: string): string[] {
      for (const id of idsByType.get(type) ?? []) {
        const values = toStrings(answersByQuestionId.get(id));
        if (values.length > 0) return values;
      }
      return [];
    },
    /** The HIDDEN_FIELDS answer object, keyed by field name. */
    hiddenFields(): Record<string, unknown> {
      for (const id of idsByType.get('HIDDEN_FIELDS') ?? []) {
        const answer = answersByQuestionId.get(id);
        if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
          return answer as Record<string, unknown>;
        }
      }
      return {};
    },
  };
}

function first(values: string[]): string | undefined {
  return values.length > 0 ? values[0] : undefined;
}

function hiddenValue(
  hidden: Record<string, unknown>,
  name: string
): string | undefined {
  const value = hidden[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function toHopeInterest(
  value: string | undefined
): 'yes' | 'no' | 'unsure' | undefined {
  if (!value) return undefined;
  const normalized = normalizeLabel(value);
  if (normalized.startsWith('yes')) return 'yes';
  if (normalized.startsWith('no ') || normalized === 'no') return 'no';
  if (normalized.startsWith('not sure')) return 'unsure';
  return undefined;
}

function toAge(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  // A plausible studio range. Out-of-range input is a typo, not an age, and a
  // wrong number on the card is worse than no number.
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) return undefined;
  return parsed;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Map one Tally submission into an ingestible lesson inquiry.
 *
 * Returns null when the submission cannot become a usable lead: it is
 * incomplete, has no id (nothing to key on, and the id is what makes ingestion
 * idempotent), or has no email (nothing to reply to). Callers should count and
 * log skips rather than failing the whole run — one malformed submission must
 * not stop the other nineteen from being captured.
 */
export function mapSubmission(
  submission: TallySubmission,
  questions: TallyQuestion[],
  formId: string,
  now: Date = new Date()
): MappedLessonInquiry | null {
  if (!submission?.id) return null;
  if (submission.isCompleted === false) return null;

  const lookup = buildLookup(submission, questions ?? []);

  const email = first(lookup.byType('INPUT_EMAIL'));
  if (!email) return null;

  const hidden = lookup.hiddenFields();
  const availability = lookup.byLabel(['When could you generally come in?']);

  return {
    id: submission.id,
    formId,
    formName: formNameFor(formId),
    submittedAt: toDate(submission.submittedAt) ?? now,
    contactName:
      first(
        lookup.byLabel(['Your name', 'Parent or Student Name', 'Name'])
      ) ?? 'Unknown',
    email,
    phone: first(lookup.byType('INPUT_PHONE_NUMBER')),
    studentFirstName: first(
      lookup.byLabel(["Student's first name", 'Student first name'])
    ),
    studentAge: toAge(first(lookup.byLabel(["Student's age", 'Age']))),
    interest: first(
      lookup.byLabel([
        'Which would you like to start with?',
        'Which instrument are you interested in?',
      ])
    ),
    availability,
    hopeScholarship: toHopeInterest(
      first(
        lookup.byLabel([
          'Will you be using the West Virginia Hope Scholarship?',
          'Will you be using the WV Hope Scholarship?',
        ])
      )
    ),
    message: first(
      lookup.byLabel([
        'Anything you would like us to know?',
        'Anything else you would like us to know?',
      ])
    ),
    attribution: {
      utmSource: hiddenValue(hidden, 'utm_source'),
      utmMedium: hiddenValue(hidden, 'utm_medium'),
      utmCampaign: hiddenValue(hidden, 'utm_campaign'),
      utmContent: hiddenValue(hidden, 'utm_content'),
      utmTerm: hiddenValue(hidden, 'utm_term'),
      referrer: hiddenValue(hidden, 'referrer'),
      landingPage: hiddenValue(hidden, 'landing_page'),
    },
  };
}
