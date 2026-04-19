/**
 * Agreement Request Repository
 *
 * Handles all Firestore operations for agreement signing requests.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  AgreementRequest,
  AgreementRequestStatus,
  CreateAgreementRequestInput,
} from '@maple/ts/domain';

const COLLECTION = 'agreementRequests';

function docToAgreementRequest(
  doc: FirebaseFirestore.DocumentSnapshot
): AgreementRequest | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    templateId: data.templateId,
    templateVersion: data.templateVersion,
    signerEmail: data.signerEmail,
    signerName: data.signerName,
    signerPhone: data.signerPhone,
    deliveryMethod: data.deliveryMethod,
    registrationId: data.registrationId,
    classId: data.classId,
    studentId: data.studentId,
    signingToken: data.signingToken,
    expiresAt: toDate(data.expiresAt),
    status: data.status as AgreementRequestStatus,
    emailSentAt: data.emailSentAt ? toDate(data.emailSentAt) : undefined,
    signedAgreementId: data.signedAgreementId,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface AgreementRequestFilters {
  status?: AgreementRequestStatus;
  signerEmail?: string;
  classId?: string;
  registrationId?: string;
}

export const AgreementRequestRepository = {
  async findAll(
    filters?: AgreementRequestFilters
  ): Promise<AgreementRequest[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.signerEmail) {
      query = query.where('signerEmail', '==', filters.signerEmail);
    }

    if (filters?.classId) {
      query = query.where('classId', '==', filters.classId);
    }

    if (filters?.registrationId) {
      query = query.where('registrationId', '==', filters.registrationId);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToAgreementRequest(doc))
      .filter((r): r is AgreementRequest => r !== undefined);
  },

  async findById(id: string): Promise<AgreementRequest | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToAgreementRequest(doc);
  },

  /**
   * Find a request by its signing token (for public signing page)
   */
  async findByToken(token: string): Promise<AgreementRequest | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('signingToken', '==', token)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToAgreementRequest(snapshot.docs[0]);
  },

  async create(
    input: CreateAgreementRequestInput
  ): Promise<AgreementRequest> {
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
   * Mark a request as signed and link to the signed agreement
   */
  async markSigned(
    id: string,
    signedAgreementId: string
  ): Promise<void> {
    await db
      .collection(COLLECTION)
      .doc(id)
      .update({
        status: 'signed' as AgreementRequestStatus,
        signedAgreementId,
        updatedAt: new Date(),
      });
  },

  /**
   * Mark a request as cancelled
   */
  async cancel(id: string): Promise<void> {
    await db
      .collection(COLLECTION)
      .doc(id)
      .update({
        status: 'cancelled' as AgreementRequestStatus,
        updatedAt: new Date(),
      });
  },

  /**
   * Record that the signing email was sent
   */
  async markEmailSent(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).update({
      emailSentAt: new Date(),
      updatedAt: new Date(),
    });
  },
};
