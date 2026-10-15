/**
 * Inbox Dismissal Repository (#235)
 *
 * "Mark done" on the Home inbox, shared by everyone at the studio: Katie
 * dismissing a row hides it for Nathan too, and it stays hidden across
 * reloads.
 *
 * One document per dismissed item, at a document id derived from the item's
 * `key`. The key names the record *and* the state that made it actionable
 * (`charge-failed:<id>:<failedAtMs>`), so a new failure is a different key
 * and is never hidden by an old dismissal.
 *
 * Reads go by key, never a scan: the inbox asks about exactly the keys it is
 * about to show, so the cost is bounded by the inbox, not by every dismissal
 * ever made. Nothing deletes old dismissals; they are a few bytes each and
 * a resolved item's key is simply never asked about again.
 */
import { db, getDb, toDate } from './utilities/database.config';
import type { InboxDismissal } from '@maple/ts/domain';

const COLLECTION = 'inboxDismissals';

/**
 * Keys are `kind:…` with no slashes (`isWellFormedInboxKey`), but a document
 * id must also not be `.`/`..` or look like `__x__`. Encoding makes any
 * well-formed key a safe id and keeps it readable in the console.
 */
export function inboxDismissalDocId(key: string): string {
  return encodeURIComponent(key);
}

function docToInboxDismissal(
  doc: FirebaseFirestore.DocumentSnapshot
): InboxDismissal | undefined {
  const data = doc.exists ? doc.data() : undefined;
  if (!data) return undefined;
  return {
    key: data.key,
    kind: data.kind,
    dismissedAt: toDate(data.dismissedAt),
    dismissedByUid: data.dismissedByUid ?? undefined,
  };
}

export const InboxDismissalRepository = {
  /** The dismissals among these keys. Missing keys are simply absent. */
  async findByKeys(keys: string[]): Promise<InboxDismissal[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const database = getDb();
    const collection = database.collection(COLLECTION);
    const snaps = await database.getAll(
      ...unique.map((key) => collection.doc(inboxDismissalDocId(key)))
    );
    return snaps
      .map(docToInboxDismissal)
      .filter((d): d is InboxDismissal => d !== undefined);
  },

  /**
   * Record that an item is done. Idempotent: dismissing twice keeps one
   * document, with the latest time and person.
   */
  async dismiss(input: Omit<InboxDismissal, 'dismissedAt'>): Promise<InboxDismissal> {
    const dismissal: InboxDismissal = { ...input, dismissedAt: new Date() };
    await db
      .collection(COLLECTION)
      .doc(inboxDismissalDocId(input.key))
      .set({
        key: dismissal.key,
        kind: dismissal.kind,
        dismissedAt: dismissal.dismissedAt,
        dismissedByUid: dismissal.dismissedByUid ?? null,
      });
    return dismissal;
  },
};
