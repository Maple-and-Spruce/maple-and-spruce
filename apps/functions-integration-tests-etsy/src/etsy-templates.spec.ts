/**
 * Integration tests for Etsy template functions.
 *
 * Backfill coverage for getEtsyTemplates, saveEtsyCategoryTemplate, and
 * saveEtsyArtistTemplate. These are pure Firestore functions (no Etsy
 * API calls) so no mock server is required for this suite.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  GetEtsyTemplatesRequest,
  GetEtsyTemplatesResponse,
  SaveEtsyCategoryTemplateRequest,
  SaveEtsyCategoryTemplateResponse,
  SaveEtsyArtistTemplateRequest,
} from '@maple/ts/firebase/api-types';

describe('Etsy template functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guards', () => {
    it('rejects non-admin from saveEtsyCategoryTemplate', async () => {
      const result = await callFunction<SaveEtsyCategoryTemplateRequest>({
        functionName: 'saveEtsyCategoryTemplate',
        data: {
          categoryId: 'cat-1',
          categoryName: 'Mugs',
          defaults: { taxonomyId: 68 },
        },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects non-admin from getEtsyTemplates', async () => {
      const result = await callFunction<GetEtsyTemplatesRequest>({
        functionName: 'getEtsyTemplates',
        data: { categoryId: 'cat-1' },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('saves a category template and reads it back via getEtsyTemplates', async () => {
      const save = await callFunction<
        SaveEtsyCategoryTemplateRequest,
        SaveEtsyCategoryTemplateResponse
      >({
        functionName: 'saveEtsyCategoryTemplate',
        data: {
          categoryId: 'cat-pottery',
          categoryName: 'Pottery',
          defaults: {
            taxonomyId: 68,
            tags: ['pottery', 'ceramic'],
            whoMade: 'i_did',
            whenMade: '2020_2025',
          },
        },
        idToken: adminUser.idToken,
      });
      expect(save.status).toBe(200);
      expect(save.data!.template.id).toBe('cat-pottery');
      expect(save.data!.template.taxonomyId).toBe(68);

      const get = await callFunction<
        GetEtsyTemplatesRequest,
        GetEtsyTemplatesResponse
      >({
        functionName: 'getEtsyTemplates',
        data: { categoryId: 'cat-pottery' },
        idToken: adminUser.idToken,
      });
      expect(get.status).toBe(200);
      expect(get.data!.categoryTemplate?.taxonomyId).toBe(68);
      expect(get.data!.merged.taxonomyId).toBe(68);
      expect(get.data!.merged.tags).toEqual(
        expect.arrayContaining(['pottery', 'ceramic'])
      );
    });

    it('merges artist overrides on top of category base', async () => {
      // Category base
      await callFunction<SaveEtsyCategoryTemplateRequest>({
        functionName: 'saveEtsyCategoryTemplate',
        data: {
          categoryId: 'cat-merge',
          categoryName: 'Merge Test',
          defaults: {
            taxonomyId: 100,
            tags: ['handmade'],
            whoMade: 'someone_else',
          },
        },
        idToken: adminUser.idToken,
      });

      // Artist override
      await callFunction<SaveEtsyArtistTemplateRequest>({
        functionName: 'saveEtsyArtistTemplate',
        data: {
          artistId: 'artist-merge',
          artistName: 'Merge Artist',
          defaults: {
            whoMade: 'i_did', // override
            tags: ['artisan'], // additive
          },
        },
        idToken: adminUser.idToken,
      });

      const get = await callFunction<
        GetEtsyTemplatesRequest,
        GetEtsyTemplatesResponse
      >({
        functionName: 'getEtsyTemplates',
        data: { categoryId: 'cat-merge', artistId: 'artist-merge' },
        idToken: adminUser.idToken,
      });
      expect(get.status).toBe(200);
      expect(get.data!.merged.whoMade).toBe('i_did'); // artist wins
      expect(get.data!.merged.taxonomyId).toBe(100); // category base preserved
      expect(get.data!.merged.tags).toEqual(
        expect.arrayContaining(['handmade', 'artisan'])
      );
    });

    it('returns empty merged result when no templates exist', async () => {
      const get = await callFunction<
        GetEtsyTemplatesRequest,
        GetEtsyTemplatesResponse
      >({
        functionName: 'getEtsyTemplates',
        data: { categoryId: 'cat-unknown', artistId: 'artist-unknown' },
        idToken: adminUser.idToken,
      });
      expect(get.status).toBe(200);
      expect(get.data!.categoryTemplate).toBeUndefined();
      expect(get.data!.artistTemplate).toBeUndefined();
      expect(get.data!.merged.taxonomyId).toBeUndefined();
    });
  });
});
