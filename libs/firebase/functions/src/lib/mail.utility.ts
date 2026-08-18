/**
 * Transactional mail queue helper
 *
 * Single choke point for queuing transactional email. Today every send lands in
 * the `mail` collection watched by the `firestore-send-email` extension, which
 * delivers over Gmail SMTP as katie@mapleandsprucefolkarts.com.
 *
 * WHY A HELPER RATHER THAN `db.collection('mail').add(...)` AT EACH CALL SITE:
 *
 * Gmail SMTP can only send as an address the account is authorized for, so we
 * cannot set a per-brand `from` today — Music Together mail goes out under the
 * Maple & Spruce address even though the MT templates advertise a Music
 * Together contact. Every send therefore has to declare WHICH BRAND it belongs
 * to (`sender`), so that:
 *
 *   - MT mail can at least carry `replyTo: musictogether@…` now, and
 *   - when #775 moves transactional email to a provider that supports
 *     arbitrary validated senders, ONLY the `SENDER_FROM` map below changes.
 *     No re-audit of every send site, no risk of missing one and having a
 *     Music Together family get a reply-to pointing at the wrong inbox.
 *
 * See also #756 — the Trigger Email extension is decommissioned 2027-03-31, so
 * this indirection is the migration seam for that too.
 */
import { getDb } from '@maple/firebase/database';
import { isE2ETestEmail } from './email.utility';

/** Which brand a transactional email is sent on behalf of. */
export type MailSender = 'maple-spruce' | 'music-together';

/**
 * Per-brand `from` address.
 *
 * `null` means "use the extension's configured DEFAULT_FROM". Both brands sit
 * on `null` today because Gmail SMTP rejects (or silently rewrites) a `from`
 * the authenticated account isn't authorized to send as — setting a Music
 * Together `from` here now would break delivery, not fix branding.
 *
 * #775 is what makes these settable. When it lands, fill in the MT row.
 */
const SENDER_FROM: Record<MailSender, string | null> = {
  'maple-spruce': null,
  'music-together': null,
};

/**
 * Per-brand `Reply-To`. Unlike `from`, this is NOT constrained by the SMTP
 * account, so MT mail can route replies to the Music Together inbox today —
 * which is the address the MT template bodies and footers already print.
 */
const SENDER_REPLY_TO: Record<MailSender, string | null> = {
  'maple-spruce': null,
  'music-together': 'musictogether@mapleandsprucefolkarts.com',
};

export interface QueueMailInput {
  /** Recipient address. E2E test addresses are dropped (never delivered). */
  to: string;
  /** Template document id in the `email-templates` collection. */
  templateName: string;
  /** Handlebars data for the template. */
  data: Record<string, unknown>;
  /**
   * Which brand this mail is from. Required — an explicit choice at every call
   * site is the whole point of this helper (see the file header).
   */
  sender: MailSender;
}

/**
 * Queue one transactional email.
 *
 * Returns `true` if a `mail` document was written, `false` if the recipient was
 * skipped as an E2E test address. Callers that need to record "we emailed this
 * person" should only stamp their doc when this returns `true`.
 */
export async function queueMail(input: QueueMailInput): Promise<boolean> {
  if (isE2ETestEmail(input.to)) {
    console.log(
      `[queueMail] Skipping E2E test recipient ${input.to} (${input.templateName})`
    );
    return false;
  }

  const from = SENDER_FROM[input.sender];
  const replyTo = SENDER_REPLY_TO[input.sender];

  await getDb()
    .collection('mail')
    .add({
      to: input.to,
      ...(from ? { from } : {}),
      ...(replyTo ? { replyTo } : {}),
      template: { name: input.templateName, data: input.data },
    });

  return true;
}
