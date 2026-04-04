/**
 * Etsy Template Repository
 *
 * CRUD operations for Etsy listing templates stored in Firestore.
 * Two collections:
 * - etsy-category-templates/{categoryId} — category-level defaults
 * - etsy-artist-templates/{artistId} — artist-level overrides
 *
 * Templates are used to pre-fill the Etsy listing form when creating
 * products. Category provides the base, artist overrides on top.
 */
import { db } from './utilities/database.config';
import type {
  EtsyCategoryTemplate,
  EtsyArtistTemplate,
  EtsyListingDefaults,
} from '@maple/ts/domain';

const CATEGORY_COLLECTION = 'etsy-category-templates';
const ARTIST_COLLECTION = 'etsy-artist-templates';

function docToCategoryTemplate(
  doc: FirebaseFirestore.DocumentSnapshot
): EtsyCategoryTemplate | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    categoryName: data.categoryName ?? '',
    taxonomyId: data.taxonomyId,
    tags: data.tags,
    materials: data.materials,
    whoMade: data.whoMade,
    whenMade: data.whenMade,
    isSupply: data.isSupply,
    shippingProfileId: data.shippingProfileId,
    shopSectionId: data.shopSectionId,
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

function docToArtistTemplate(
  doc: FirebaseFirestore.DocumentSnapshot
): EtsyArtistTemplate | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    artistName: data.artistName ?? '',
    taxonomyId: data.taxonomyId,
    tags: data.tags,
    materials: data.materials,
    whoMade: data.whoMade,
    whenMade: data.whenMade,
    isSupply: data.isSupply,
    shippingProfileId: data.shippingProfileId,
    shopSectionId: data.shopSectionId,
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

function defaultsToDoc(
  defaults: EtsyListingDefaults
): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  if (defaults.taxonomyId !== undefined) doc.taxonomyId = defaults.taxonomyId;
  if (defaults.tags !== undefined) doc.tags = defaults.tags;
  if (defaults.materials !== undefined) doc.materials = defaults.materials;
  if (defaults.whoMade !== undefined) doc.whoMade = defaults.whoMade;
  if (defaults.whenMade !== undefined) doc.whenMade = defaults.whenMade;
  if (defaults.isSupply !== undefined) doc.isSupply = defaults.isSupply;
  if (defaults.shippingProfileId !== undefined)
    doc.shippingProfileId = defaults.shippingProfileId;
  if (defaults.shopSectionId !== undefined)
    doc.shopSectionId = defaults.shopSectionId;
  return doc;
}

export const EtsyTemplateRepository = {
  // ============================================================================
  // Category Templates
  // ============================================================================

  async getCategoryTemplate(
    categoryId: string
  ): Promise<EtsyCategoryTemplate | undefined> {
    const doc = await db.collection(CATEGORY_COLLECTION).doc(categoryId).get();
    return docToCategoryTemplate(doc);
  },

  async getAllCategoryTemplates(): Promise<EtsyCategoryTemplate[]> {
    const snapshot = await db.collection(CATEGORY_COLLECTION).get();
    return snapshot.docs
      .map((doc) => docToCategoryTemplate(doc))
      .filter((t): t is EtsyCategoryTemplate => t !== undefined);
  },

  async saveCategoryTemplate(
    categoryId: string,
    categoryName: string,
    defaults: EtsyListingDefaults
  ): Promise<EtsyCategoryTemplate> {
    const docRef = db.collection(CATEGORY_COLLECTION).doc(categoryId);
    const data = {
      ...defaultsToDoc(defaults),
      categoryName,
      updatedAt: new Date(),
    };
    await docRef.set(data, { merge: true });

    const saved = await docRef.get();
    return docToCategoryTemplate(saved)!;
  },

  async deleteCategoryTemplate(categoryId: string): Promise<void> {
    await db.collection(CATEGORY_COLLECTION).doc(categoryId).delete();
  },

  // ============================================================================
  // Artist Templates
  // ============================================================================

  async getArtistTemplate(
    artistId: string
  ): Promise<EtsyArtistTemplate | undefined> {
    const doc = await db.collection(ARTIST_COLLECTION).doc(artistId).get();
    return docToArtistTemplate(doc);
  },

  async getAllArtistTemplates(): Promise<EtsyArtistTemplate[]> {
    const snapshot = await db.collection(ARTIST_COLLECTION).get();
    return snapshot.docs
      .map((doc) => docToArtistTemplate(doc))
      .filter((t): t is EtsyArtistTemplate => t !== undefined);
  },

  async saveArtistTemplate(
    artistId: string,
    artistName: string,
    defaults: EtsyListingDefaults
  ): Promise<EtsyArtistTemplate> {
    const docRef = db.collection(ARTIST_COLLECTION).doc(artistId);
    const data = {
      ...defaultsToDoc(defaults),
      artistName,
      updatedAt: new Date(),
    };
    await docRef.set(data, { merge: true });

    const saved = await docRef.get();
    return docToArtistTemplate(saved)!;
  },

  async deleteArtistTemplate(artistId: string): Promise<void> {
    await db.collection(ARTIST_COLLECTION).doc(artistId).delete();
  },
};
