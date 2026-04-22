/**
 * Signed Agreement Repository
 *
 * Handles all Firestore operations for completed, signed agreements.
 * Signed agreements are immutable once created — no update or delete.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  SignedAgreement,
  CreateSignedAgreementInput,
  MediaReleaseChoice,
} from '@maple/ts/domain';

const COLLECTION = 'signedAgreements';

function docToSignedAgreement(
  doc: FirebaseFirestore.DocumentSnapshot
): SignedAgreement | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    requestId: data.requestId,
    templateId: data.templateId,
    templateVersion: data.templateVersion,
    agreementHtmlSnapshot: data.agreementHtmlSnapshot,
    signerEmail: data.signerEmail,
    printedName: data.printedName,
    signatureImagePath: data.signatureImagePath,
    mediaReleaseChoice: data.mediaReleaseChoice as
      | MediaReleaseChoice
      | undefined,
    isMinor: data.isMinor ?? false,
    minorName: data.minorName,
    guardianName: data.guardianName,
    guardianSignatureImagePath: data.guardianSignatureImagePath,
    signedAt: toDate(data.signedAt),
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    createdAt: toDate(data.createdAt),
  };
}

export interface SignedAgreementFilters {
  signerEmail?: string;
  templateId?: string;
  requestId?: string;
}

export const SignedAgreementRepository = {
  async findAll(
    filters?: SignedAgreementFilters
  ): Promise<SignedAgreement[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.signerEmail) {
      query = query.where('signerEmail', '==', filters.signerEmail);
    }

    if (filters?.templateId) {
      query = query.where('templateId', '==', filters.templateId);
    }

    if (filters?.requestId) {
      query = query.where('requestId', '==', filters.requestId);
    }

    query = query.orderBy('signedAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToSignedAgreement(doc))
      .filter((s): s is SignedAgreement => s !== undefined);
  },

  async findById(id: string): Promise<SignedAgreement | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToSignedAgreement(doc);
  },

  async updateStoragePaths(
    id: string,
    paths: {
      signatureImagePath: string;
      guardianSignatureImagePath?: string;
    }
  ): Promise<void> {
    const update: Record<string, string> = {
      signatureImagePath: paths.signatureImagePath,
    };
    if (paths.guardianSignatureImagePath) {
      update.guardianSignatureImagePath = paths.guardianSignatureImagePath;
    }
    await db.collection(COLLECTION).doc(id).update(update);
  },

  async create(
    input: CreateSignedAgreementInput
  ): Promise<SignedAgreement> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      createdAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },
};
