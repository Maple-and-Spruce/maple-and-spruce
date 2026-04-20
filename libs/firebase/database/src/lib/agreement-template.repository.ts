/**
 * Agreement Template Repository
 *
 * Handles all Firestore operations for agreement/waiver templates.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  AgreementTemplate,
  AgreementTemplateStatus,
  CreateAgreementTemplateInput,
  UpdateAgreementTemplateInput,
} from '@maple/ts/domain';

const COLLECTION = 'agreementTemplates';

function docToAgreementTemplate(
  doc: FirebaseFirestore.DocumentSnapshot
): AgreementTemplate | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    sections: data.sections ?? [],
    classCategoryIds: data.classCategoryIds ?? [],
    autoAttach: data.autoAttach ?? false,
    supportsMinor: data.supportsMinor ?? false,
    version: data.version ?? 1,
    status: data.status as AgreementTemplateStatus,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface AgreementTemplateFilters {
  status?: AgreementTemplateStatus;
  classCategoryId?: string;
  autoAttach?: boolean;
}

export const AgreementTemplateRepository = {
  async findAll(
    filters?: AgreementTemplateFilters
  ): Promise<AgreementTemplate[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.autoAttach !== undefined) {
      query = query.where('autoAttach', '==', filters.autoAttach);
    }

    if (filters?.classCategoryId) {
      query = query.where(
        'classCategoryIds',
        'array-contains',
        filters.classCategoryId
      );
    }

    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToAgreementTemplate(doc))
      .filter((t): t is AgreementTemplate => t !== undefined);
  },

  async findById(id: string): Promise<AgreementTemplate | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToAgreementTemplate(doc);
  },

  /**
   * Find active templates that auto-attach to a given class category
   */
  async findAutoAttachForCategory(
    classCategoryId: string
  ): Promise<AgreementTemplate[]> {
    return this.findAll({
      status: 'active',
      autoAttach: true,
      classCategoryId,
    });
  },

  async create(
    input: CreateAgreementTemplateInput
  ): Promise<AgreementTemplate> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      version: 1,
      status: 'active' as AgreementTemplateStatus,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  async update(
    input: UpdateAgreementTemplateInput
  ): Promise<AgreementTemplate> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const existing = await docRef.get();
    if (!existing.exists) {
      throw new Error(`Agreement template ${id} not found`);
    }

    const currentVersion = existing.data()?.version ?? 1;

    const dataWithTimestamp = {
      ...updates,
      version: currentVersion + 1,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const template = docToAgreementTemplate(updated);

    if (!template) {
      throw new Error(`Agreement template ${id} not found after update`);
    }

    return template;
  },

  /**
   * Soft-delete by archiving
   */
  async archive(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).update({
      status: 'archived',
      updatedAt: new Date(),
    });
  },
};
