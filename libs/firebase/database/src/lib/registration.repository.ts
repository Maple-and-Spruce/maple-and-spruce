/**
 * Registration Repository
 *
 * Handles all Firestore operations for class registrations.
 * All database access should go through this repository.
 */
import { FieldPath } from 'firebase-admin/firestore';
import { db, toDate } from './utilities/database.config';
import type {
  Registration,
  CreateRegistrationInput,
  UpdateRegistrationInput,
  RegistrationStatus,
  RegistrationSource,
  Attendee,
  SquareRefundInput,
  SquareRefundOutcome,
} from '@maple/ts/domain';
import {
  applySquareRefundToRegistration,
  flagSquareRefundForReview,
  refundedInSquareAmountCents,
} from '@maple/ts/domain';

const COLLECTION = 'registrations';

/**
 * Convert Firestore document to Registration
 */
function docToRegistration(
  doc: FirebaseFirestore.DocumentSnapshot
): Registration | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    classId: data.classId,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    quantity: data.quantity,
    additionalAttendees: parseAdditionalAttendees(data.additionalAttendees),
    // Private hours only; written as null for seat registrations.
    slotStart: data.slotStart ? toDate(data.slotStart) : undefined,
    groupSize: typeof data.groupSize === 'number' ? data.groupSize : undefined,
    pricePaidCents: data.pricePaidCents,
    subtotalCents: data.subtotalCents,
    taxAmountCents: data.taxAmountCents,
    taxRatePercent: data.taxRatePercent,
    squarePaymentId: data.squarePaymentId,
    squareOrderId: data.squareOrderId,
    squareReceiptUrl: data.squareReceiptUrl,
    discountCode: data.discountCode,
    discountAmountCents: data.discountAmountCents,
    status: data.status as RegistrationStatus,
    refundedAt: data.refundedAt ? toDate(data.refundedAt) : undefined,
    refundedAmountCents: data.refundedAmountCents ?? undefined,
    squareRefundId: data.squareRefundId ?? undefined,
    squareRefundIds: parseStringArray(data.squareRefundIds),
    lastRefundAt: data.lastRefundAt ? toDate(data.lastRefundAt) : undefined,
    // Cleared by writing null (see markRefundedInSquare); read back as absent.
    refundReviewAt: data.refundReviewAt ? toDate(data.refundReviewAt) : undefined,
    refundReviewAmountCents: data.refundReviewAmountCents ?? undefined,
    refundReviewId: data.refundReviewId ?? undefined,
    confirmationNumber: data.confirmationNumber,
    // Default to 'web' so registrations created before the source field
    // existed (all of which were web checkouts) read back with a usable value.
    source: (data.source as RegistrationSource | undefined) ?? 'web',
    notes: data.notes,
    confirmationSentAt: data.confirmationSentAt
      ? toDate(data.confirmationSentAt)
      : undefined,
    reminderSentAt: data.reminderSentAt
      ? toDate(data.reminderSentAt)
      : undefined,
    reminderSentForSessions: parseReminderSentForSessions(
      data.reminderSentForSessions
    ),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** A persisted array of ids, or undefined when absent or empty. */
function parseStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((v): v is string => typeof v === 'string');
  return ids.length > 0 ? ids : undefined;
}

/**
 * Normalize the persisted `additionalAttendees` array. Older rows wrote `null`
 * when there were no extras; coerce to undefined so callers consistently see
 * "absent" rather than two falsy values.
 */
function parseAdditionalAttendees(raw: unknown): Attendee[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed: Attendee[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { name?: unknown; email?: unknown };
    parsed.push({
      name: typeof e.name === 'string' ? e.name : undefined,
      email: typeof e.email === 'string' ? e.email : undefined,
    });
  }
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Convert the persisted `reminderSentForSessions` map into a
 * `Record<string, Date>`. The persisted form is `{ [sessionIso]: Timestamp }`
 * (or ISO string in tests); this normalizes either shape.
 */
function parseReminderSentForSessions(
  raw: unknown
): Record<string, Date> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return undefined;
  }
  const result: Record<string, Date> = {};
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    result[key] = toDate(value);
  }
  return result;
}

/**
 * Filters for querying registrations
 */
export interface RegistrationFilters {
  classId?: string;
  customerEmail?: string;
  status?: RegistrationStatus;
  source?: RegistrationSource;
}

/**
 * Registration Repository - handles all Firestore operations for registrations
 */
export const RegistrationRepository = {
  /**
   * Find all registrations with optional filters
   */
  async findAll(filters?: RegistrationFilters): Promise<Registration[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.classId) {
      query = query.where('classId', '==', filters.classId);
    }

    if (filters?.customerEmail) {
      query = query.where('customerEmail', '==', filters.customerEmail);
    }

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.source) {
      query = query.where('source', '==', filters.source);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /**
   * Find a registration by ID
   */
  async findById(id: string): Promise<Registration | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToRegistration(doc);
  },

  /**
   * Find all registrations for a specific class
   */
  async findByClassId(classId: string): Promise<Registration[]> {
    return this.findAll({ classId });
  },

  /**
   * Count registrations for a class by status.
   * Defaults to counting pending + confirmed (spots taken).
   */
  async countByClassId(
    classId: string,
    statuses: RegistrationStatus[] = ['pending', 'confirmed']
  ): Promise<number> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('classId', '==', classId)
      .where('status', 'in', statuses)
      .get();

    return snapshot.docs.reduce((sum, doc) => {
      return sum + ((doc.data().quantity as number) || 1);
    }, 0);
  },

  /**
   * Private-hours classes: the starts of hours held by an active (pending or
   * confirmed) registration. Same query as `countByClassId`, so no new index.
   */
  async findHeldSlotStarts(classId: string): Promise<Date[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('classId', '==', classId)
      .where('status', 'in', ['pending', 'confirmed'])
      .get();

    return snapshot.docs
      .map((doc) => doc.data().slotStart)
      .filter((v) => !!v)
      .map((v) => toDate(v));
  },

  /**
   * Find a registration by its Square order id.
   *
   * Used by the POS class-registration worker for idempotency: if a
   * registration already carries this `squareOrderId`, the order has already
   * been turned into a registration and must not be duplicated. Single-field
   * equality query → covered by Firestore's automatic single-field index, no
   * composite index required.
   */
  async findBySquareOrderId(
    squareOrderId: string
  ): Promise<Registration | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squareOrderId', '==', squareOrderId)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    return doc ? docToRegistration(doc) : undefined;
  },

  /**
   * Find a registration by its Square payment id.
   *
   * Used by the Square webhook to match a refund made in the Square dashboard
   * to the registration it paid for. Single-field equality → automatic index.
   */
  async findBySquarePaymentId(
    squarePaymentId: string
  ): Promise<Registration | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squarePaymentId', '==', squarePaymentId)
      .limit(1)
      .get();

    const doc = snapshot.docs[0];
    return doc ? docToRegistration(doc) : undefined;
  },

  /**
   * Every registration paid by one Square payment. A POS sale with several
   * class lines writes one registration per line, all on the same payment, so
   * the Square refund webhook needs all of them to tell whether a refund can
   * be pinned on one. Single-field equality → automatic index.
   */
  async findAllBySquarePaymentId(
    squarePaymentId: string
  ): Promise<Registration[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squarePaymentId', '==', squarePaymentId)
      .get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /** Every registration on one Square order. Single-field equality. */
  async findAllBySquareOrderId(squareOrderId: string): Promise<Registration[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squareOrderId', '==', squareOrderId)
      .get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /**
   * Registrations with a Square refund flagged for review since `since`. A
   * single range filter → automatic single-field index.
   */
  async findWithRefundReviewSince(since: Date): Promise<Registration[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('refundReviewAt', '>', since)
      .get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /**
   * Note a Square refund that may or may not be for this registration (see
   * `flagSquareRefundForReview`), in a transaction so a redelivery cannot
   * note it twice. Status and `refundedAmountCents` are untouched. Returns
   * `undefined` when the registration does not exist.
   */
  async flagSquareRefundForReview(
    id: string,
    refund: SquareRefundInput
  ): Promise<{ outcome: 'flagged' | 'duplicate' } | undefined> {
    const docRef = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const current = docToRegistration(await tx.get(docRef));
      if (!current) return undefined;
      const result = flagSquareRefundForReview(current, refund);
      if (result.outcome === 'flagged') {
        tx.update(docRef, { ...result.updates, updatedAt: new Date() });
      }
      return { outcome: result.outcome };
    });
  },

  /**
   * Cancel a registration whose money already went back in the Square
   * dashboard: mark it refunded without calling Square, for the flagged
   * refund's amount (or the whole price), and clear the review. The review
   * fields are written as `null`, because an `undefined` would be dropped
   * rather than delete them; the mapper reads `null` back as absent.
   */
  async markRefundedInSquare(
    registration: Registration,
    at: Date = new Date()
  ): Promise<Registration> {
    const docRef = db.collection(COLLECTION).doc(registration.id);
    const refundId = registration.squareRefundId ?? registration.refundReviewId;
    await docRef.update({
      status: 'refunded',
      refundedAt: at,
      lastRefundAt: at,
      refundedAmountCents: refundedInSquareAmountCents(registration),
      ...(refundId && { squareRefundId: refundId }),
      refundReviewAt: null,
      refundReviewAmountCents: null,
      refundReviewId: null,
      updatedAt: at,
    });
    const updated = docToRegistration(await docRef.get());
    if (!updated) {
      throw new Error(`Registration ${registration.id} not found after update`);
    }
    return updated;
  },

  /**
   * Every registration with any money refunded, full or partial. Refunds are
   * rare, so this stays small; callers narrow it further in memory. A single
   * range filter → automatic single-field index.
   */
  async findWithRefunds(): Promise<Registration[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('refundedAmountCents', '>', 0)
      .get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /**
   * Fold a completed Square refund into a registration, in a transaction so
   * two deliveries of the same event (Square retries, and sends both
   * `refund.created` and `refund.updated`) cannot both count it.
   *
   * See `applySquareRefundToRegistration` for the rule. Returns what happened,
   * or `undefined` when the registration does not exist.
   */
  async applySquareRefund(
    id: string,
    refund: SquareRefundInput
  ): Promise<{ outcome: SquareRefundOutcome; registration: Registration } | undefined> {
    const docRef = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const current = docToRegistration(snap);
      if (!current) return undefined;

      const result = applySquareRefundToRegistration(current, refund);
      if (result.outcome === 'duplicate') {
        return { outcome: result.outcome, registration: current };
      }

      const updatedAt = new Date();
      tx.update(docRef, { ...result.updates, updatedAt });
      return {
        outcome: result.outcome,
        registration: { ...current, ...result.updates, updatedAt },
      };
    });
  },

  /**
   * Create a new registration
   */
  async create(input: CreateRegistrationInput): Promise<Registration> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Update an existing registration
   */
  async update(input: UpdateRegistrationInput): Promise<Registration> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const registration = docToRegistration(updated);

    if (!registration) {
      throw new Error(`Registration ${id} not found after update`);
    }

    return registration;
  },

  /**
   * Delete a registration
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Stamp the reminder-sent fields for a specific session of a multi-session
   * class. Used by the `sendClassReminders` scheduled function to guarantee
   * idempotency: the second run on the same day must not re-send.
   *
   * Updates two fields atomically:
   * - `reminderSentForSessions[sessionIso]` — per-session timestamp,
   *   our authoritative idempotency key.
   * - `reminderSentAt` — most recent reminder timestamp (any session),
   *   useful for admin UI and at-a-glance queries.
   *
   * @param id The registration ID
   * @param sessionIso The ISO string of the session's start dateTime
   *   (used as the map key — must match exactly across runs)
   * @param now Optional timestamp; defaults to `new Date()`
   */
  async markReminderSentForSession(
    id: string,
    sessionIso: string,
    now: Date = new Date()
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    // Use FieldPath rather than dotted-key syntax: the ISO string contains
    // literal `.` characters (e.g. `.000Z`) which Firestore would otherwise
    // parse as nested path segments, splitting the key into a sub-map.
    await docRef.update(
      new FieldPath('reminderSentForSessions', sessionIso),
      now,
      'reminderSentAt',
      now,
      'updatedAt',
      now
    );
  },

  /**
   * Get the Firestore collection reference (for transactions)
   */
  getCollectionRef() {
    return db.collection(COLLECTION);
  },

  /**
   * Get a document reference (for transactions)
   */
  getDocRef(id?: string) {
    return id
      ? db.collection(COLLECTION).doc(id)
      : db.collection(COLLECTION).doc();
  },
};
