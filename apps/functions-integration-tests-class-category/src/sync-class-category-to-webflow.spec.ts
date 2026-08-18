/**
 * Integration tests for the syncClassCategoryToWebflow Firestore trigger (#776).
 *
 * The trigger runs in the Firebase emulator and calls the Webflow SDK, which is
 * redirected to the Webflow mock server via `WEBFLOW_BASE_URL`. That lets these
 * tests assert on the CMS item that actually reached Webflow, rather than only
 * that the trigger did not crash.
 *
 * Requires the maple-sync codebase built into the emulator, with
 * `WEBFLOW_API_TOKEN`, `WEBFLOW_SITE_ID` and
 * `WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID` set in its `.env`. The mock server
 * does not validate tokens, so any non-empty value works.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  deleteFirestoreDoc,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';

/**
 * The Webflow Class Categories collection ID. Mirrors
 * `WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID` in `.env.dev`, which the function
 * process reads from `dist/apps/functions-sync/.env`. The mock server stores
 * items under this exact ID, so the test can read them back.
 */
const WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID = '6a8390e82f1dcfc025db6391';

interface WebflowMockItem {
  id: string;
  isDraft?: boolean;
  fieldData: Record<string, unknown>;
}

async function listMockCategoryItems(): Promise<WebflowMockItem[]> {
  const url = `${EMULATOR_CONFIG.webflowMockServerUrl}/collections/${WEBFLOW_CLASS_CATEGORIES_COLLECTION_ID}/items`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Webflow mock server returned ${res.status}: ${await res.text()}`
    );
  }
  const body = (await res.json()) as { items: WebflowMockItem[] };
  return body.items;
}

async function findMockCategory(
  categoryId: string
): Promise<WebflowMockItem | undefined> {
  const items = await listMockCategoryItems();
  return items.find((item) => item.fieldData['firebase-id'] === categoryId);
}

/**
 * Wait for the Firestore trigger to fire and its outbound Webflow call to
 * complete. Webflow sync triggers are async — there is a gap between the
 * Firestore write and the mock server seeing the request.
 */
function waitForTrigger(ms = 3000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function categoryDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Contract Test Category',
    description: 'Seeded by the class category Webflow sync integration test.',
    order: 30,
    icon: '🧵',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('syncClassCategoryToWebflow trigger', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Category creation', () => {
    const categoryId = 'test-cat-sync-create';

    afterAll(async () => {
      await deleteFirestoreDoc('classCategories', categoryId);
      await waitForTrigger();
    });

    it('creates the Webflow item and writes the item ID back to Firestore', async () => {
      await setFirestoreDoc('classCategories', categoryId, categoryDoc());
      await waitForTrigger();

      const item = await findMockCategory(categoryId);
      expect(item).toBeDefined();
      expect(item!.fieldData['name']).toBe('Contract Test Category');
      expect(item!.fieldData['slug']).toBe('contract-test-category');
      expect(item!.fieldData['description']).toBe(
        'Seeded by the class category Webflow sync integration test.'
      );
      expect(item!.fieldData['order']).toBe(30);
      expect(item!.fieldData['icon']).toBe('🧵');

      // The item ID is written back so later syncs update in place instead of
      // rescanning the whole collection by firebase-id.
      const doc = await getFirestoreDoc('classCategories', categoryId);
      expect(doc).not.toBeNull();
      expect(doc!['webflowItemId']).toBe(item!.id);
    });

    it('does not create a duplicate item when the category is written again', async () => {
      // The write-back above re-fires this same trigger. Without the
      // "only write when the ID actually changed" guard that would loop, and
      // any missed dedupe here would show up as a second CMS item.
      await setFirestoreDoc(
        'classCategories',
        categoryId,
        categoryDoc({ description: 'Edited once.' })
      );
      await waitForTrigger();

      const items = await listMockCategoryItems();
      const matching = items.filter(
        (item) => item.fieldData['firebase-id'] === categoryId
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].fieldData['description']).toBe('Edited once.');
    });
  });

  describe('Category update', () => {
    const categoryId = 'test-cat-sync-update';

    afterAll(async () => {
      await deleteFirestoreDoc('classCategories', categoryId);
      await waitForTrigger();
    });

    it('updates the existing item in place and keeps its slug stable', async () => {
      await setFirestoreDoc('classCategories', categoryId, categoryDoc());
      await waitForTrigger();

      const created = await findMockCategory(categoryId);
      expect(created).toBeDefined();
      const originalSlug = created!.fieldData['slug'];

      await setFirestoreDoc(
        'classCategories',
        categoryId,
        categoryDoc({ name: 'Renamed Category', order: 40 })
      );
      await waitForTrigger();

      const updated = await findMockCategory(categoryId);
      expect(updated).toBeDefined();
      expect(updated!.id).toBe(created!.id);
      expect(updated!.fieldData['name']).toBe('Renamed Category');
      expect(updated!.fieldData['order']).toBe(40);

      // Slug is deliberately omitted on update: Webflow auto-suffixes slug
      // collisions on create but 400s on update, which would freeze every
      // later sync for this category.
      expect(updated!.fieldData['slug']).toBe(originalSlug);
    });
  });

  describe('Category deletion', () => {
    const categoryId = 'test-cat-sync-delete';

    it('removes the item from Webflow', async () => {
      await setFirestoreDoc('classCategories', categoryId, categoryDoc());
      await waitForTrigger();
      expect(await findMockCategory(categoryId)).toBeDefined();

      await deleteFirestoreDoc('classCategories', categoryId);
      await waitForTrigger();

      expect(await findMockCategory(categoryId)).toBeUndefined();
    });
  });
});
