/**
 * Craft Club Member Repository
 *
 * Handles all Firestore operations for Craft Club members. All database access
 * should go through this repository.
 *
 * `email` (lowercased) is the natural unique key — `findByEmail` is the primary
 * lookup, and callers upsert by email rather than minting duplicate records.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CraftClubMember,
  CreateCraftClubMemberInput,
  UpdateCraftClubMemberInput,
  CraftClubMemberStatus,
} from '@maple/ts/domain';

const COLLECTION = 'craftClubMembers';

/** Normalize an email to the stored key form (trimmed + lowercased). */
export function craftClubEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Convert a Firestore document to a CraftClubMember. */
function docToMember(
  doc: FirebaseFirestore.DocumentSnapshot
): CraftClubMember | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    email: data.email,
    name: data.name,
    phone: data.phone,
    status: data.status as CraftClubMemberStatus,
    squareCustomerId: data.squareCustomerId,
    squareCardId: data.squareCardId,
    squareSubscriptionId: data.squareSubscriptionId,
    approvedAt: data.approvedAt ? toDate(data.approvedAt) : undefined,
    approvedBy: data.approvedBy,
    subscribedAt: data.subscribedAt ? toDate(data.subscribedAt) : undefined,
    cancelledAt: data.cancelledAt ? toDate(data.cancelledAt) : undefined,
    currentPeriodEndsAt: data.currentPeriodEndsAt
      ? toDate(data.currentPeriodEndsAt)
      : undefined,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Filters for querying Craft Club members. */
export interface CraftClubMemberFilters {
  status?: CraftClubMemberStatus;
}

/**
 * Craft Club Member Repository — all Firestore operations for members.
 */
export const CraftClubMemberRepository = {
  /** Find all members with optional filters, newest first. */
  async findAll(
    filters?: CraftClubMemberFilters
  ): Promise<CraftClubMember[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToMember(doc))
      .filter((m): m is CraftClubMember => m !== undefined);
  },

  /** Find a member by ID. */
  async findById(id: string): Promise<CraftClubMember | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToMember(doc);
  },

  /** Find a member by email (the natural unique key). */
  async findByEmail(email: string): Promise<CraftClubMember | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('email', '==', craftClubEmailKey(email))
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToMember(snapshot.docs[0]);
  },

  /** Create a new member. Email is normalized to its key form. */
  async create(input: CreateCraftClubMemberInput): Promise<CraftClubMember> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      email: craftClubEmailKey(input.email),
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /** Update an existing member. */
  async update(input: UpdateCraftClubMemberInput): Promise<CraftClubMember> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.update({
      ...updates,
      updatedAt: new Date(),
    });

    const updated = await docRef.get();
    const member = docToMember(updated);

    if (!member) {
      throw new Error(`Craft Club member ${id} not found after update`);
    }

    return member;
  },

  /** Get the Firestore collection reference (for transactions). */
  getCollectionRef() {
    return db.collection(COLLECTION);
  },

  /** Get a document reference (for transactions). */
  getDocRef(id?: string) {
    return id
      ? db.collection(COLLECTION).doc(id)
      : db.collection(COLLECTION).doc();
  },
};
