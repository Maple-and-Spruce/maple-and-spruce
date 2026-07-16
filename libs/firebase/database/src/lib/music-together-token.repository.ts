/**
 * Music Together Token Repository
 *
 * Two short-lived token collections powering self-service payment-method
 * management for installment families without customer auth. Mirrors the Craft
 * Club token model, but scoped to a *registration* (the card on file lives on
 * the registration) rather than a member.
 *
 * - `musicTogetherAccessTokens` — single-use magic-link tokens emailed to a
 *   family (~30 min). Exchanged once for a session.
 * - `musicTogetherManageSessions` — session tokens issued after a magic link is
 *   consumed (~1 h), bound to a registration. The manage widget holds the raw
 *   session token and passes it on every management call.
 *
 * Tokens are sensitive (they authorize replacing the card that will be charged
 * for the Week-5 installment), so only a **sha256 hash** is stored — the raw
 * token lives only in the emailed URL / the widget's memory. Lookups hash the
 * presented token and match on the hash.
 */
import { createHash, randomBytes } from 'crypto';
import { db, toDate } from './utilities/database.config';

const ACCESS_TOKENS = 'musicTogetherAccessTokens';
const SESSIONS = 'musicTogetherManageSessions';

/** Magic-link tokens are valid for 30 minutes. */
export const MUSIC_TOGETHER_ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000;
/** Sessions are valid for 1 hour. */
export const MUSIC_TOGETHER_SESSION_TTL_MS = 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const MusicTogetherTokenRepository = {
  /**
   * Create a single-use magic-link token for a registration. Returns the RAW
   * token (only its hash is persisted) — embed it in the emailed URL.
   */
  async createAccessToken(
    registrationId: string,
    now: Date = new Date()
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    await db.collection(ACCESS_TOKENS).add({
      tokenHash: hashToken(rawToken),
      registrationId,
      expiresAt: new Date(now.getTime() + MUSIC_TOGETHER_ACCESS_TOKEN_TTL_MS),
      usedAt: null,
      createdAt: now,
    });
    return rawToken;
  },

  /**
   * Validate and consume a magic-link token. Returns the associated
   * registration id, or undefined if the token is unknown, already used, or
   * expired. Marks the token used so it cannot be replayed.
   */
  async consumeAccessToken(
    rawToken: string,
    now: Date = new Date()
  ): Promise<string | undefined> {
    if (!rawToken) return undefined;
    const snapshot = await db
      .collection(ACCESS_TOKENS)
      .where('tokenHash', '==', hashToken(rawToken))
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;

    const doc = snapshot.docs[0];
    const data = doc.data();
    if (data.usedAt) return undefined;
    if (toDate(data.expiresAt).getTime() < now.getTime()) return undefined;

    await doc.ref.update({ usedAt: now });
    return data.registrationId as string;
  },

  /**
   * Issue a session token bound to a registration. Returns the RAW session
   * token (only its hash is persisted).
   */
  async createSession(
    registrationId: string,
    now: Date = new Date()
  ): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    await db.collection(SESSIONS).add({
      tokenHash: hashToken(rawToken),
      registrationId,
      expiresAt: new Date(now.getTime() + MUSIC_TOGETHER_SESSION_TTL_MS),
      createdAt: now,
    });
    return rawToken;
  },

  /**
   * Resolve a session token to its registration id, or undefined if the token
   * is unknown or expired.
   */
  async resolveSession(
    rawToken: string,
    now: Date = new Date()
  ): Promise<string | undefined> {
    if (!rawToken) return undefined;
    const snapshot = await db
      .collection(SESSIONS)
      .where('tokenHash', '==', hashToken(rawToken))
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;

    const data = snapshot.docs[0].data();
    if (toDate(data.expiresAt).getTime() < now.getTime()) return undefined;
    return data.registrationId as string;
  },
};
