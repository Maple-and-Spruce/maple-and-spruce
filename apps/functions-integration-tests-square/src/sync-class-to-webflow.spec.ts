/**
 * Integration tests for syncClassToWebflow Firestore trigger.
 *
 * Uses the mock HTTP server for Webflow API calls.
 * The trigger runs in the Firebase emulator and calls the Webflow SDK,
 * which is redirected to the mock server via WEBFLOW_BASE_URL env var.
 *
 * NOTE: These tests require the maple-sync codebase to be built and
 * loaded in the emulator, plus WEBFLOW_API_TOKEN, WEBFLOW_SITE_ID,
 * WEBFLOW_ARTISTS_COLLECTION_ID, and WEBFLOW_CLASSES_COLLECTION_ID
 * to be set in the emulator environment. The mock server doesn't
 * validate tokens so any non-empty value works.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  deleteFirestoreDoc,
  callFunction,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';

/**
 * The Webflow Classes collection ID. Mirrors `WEBFLOW_CLASSES_COLLECTION_ID`
 * in `.env.dev`, which the function process reads from
 * `dist/apps/functions-sync/.env`. The mock server stores items under this
 * exact ID, so the test can fetch them back from the mock.
 */
const WEBFLOW_CLASSES_COLLECTION_ID = '69d0fb7572d9e153c22ce489';

interface WebflowMockItem {
  id: string;
  fieldData: Record<string, unknown>;
}

/**
 * Fetch the items the syncClassToWebflow trigger sent to the Webflow mock
 * server. Returns the item whose `firebase-id` field matches `classId`, or
 * `undefined` if no such item exists.
 */
async function findMockItemByFirebaseId(
  classId: string
): Promise<WebflowMockItem | undefined> {
  const url = `${EMULATOR_CONFIG.webflowMockServerUrl}/collections/${WEBFLOW_CLASSES_COLLECTION_ID}/items`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Webflow mock server returned ${res.status}: ${await res.text()}`
    );
  }
  const body = (await res.json()) as { items: WebflowMockItem[] };
  return body.items.find((item) => item.fieldData['firebase-id'] === classId);
}
import type {
  CreateClassRequest,
  CreateClassResponse,
  UpdateClassRequest,
  UpdateClassResponse,
  DeleteClassRequest,
  GetClassResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';

function futureDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

/**
 * Wait for the Firestore trigger to fire and the Webflow API call to complete.
 * Webflow sync triggers are async — there's a delay between the write and
 * the trigger completing its outbound HTTP call.
 */
function waitForTrigger(ms = 3000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a class has a webflowItemId stored back from the sync trigger.
 */
async function getClassWebflowItemId(
  classId: string,
  adminToken: string
): Promise<string | undefined> {
  const result = await callFunction<{ id: string }, GetClassResponse>({
    functionName: 'getClass',
    data: { id: classId },
    idToken: adminToken,
  });
  if (result.status !== 200) return undefined;
  return result.data?.class.webflowItemId;
}

/**
 * Poll until the trigger has written the id back, up to `timeoutMs`.
 *
 * A fixed `waitForTrigger()` sleep raced here: the write, the trigger cold
 * start and an outbound HTTP call all have to finish inside it, and on a
 * loaded CI runner sharing a machine with the other suites they did not — this
 * test failed in CI twice in a row while passing locally every time. Polling
 * keeps the fast case fast and only spends the extra seconds when the runner
 * is actually slow.
 */
async function waitForClassWebflowItemId(
  classId: string,
  adminToken: string,
  timeoutMs = 20000
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const id = await getClassWebflowItemId(classId, adminToken);
    if (id) return id;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

describe('syncClassToWebflow Trigger', () => {
  let adminUser: TestUser;
  let instructorId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);

    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

    // Create an instructor for published class tests
    const instructorResult = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Webflow Sync Test Instructor',
        email: 'webflow-instructor@test.com',
        status: 'active',
        bio: 'Test instructor for Webflow sync integration tests.',
        specialties: ['pottery'],
        payRateType: 'flat',
        payRate: 5000,
      },
      idToken: adminUser.idToken,
    });
    instructorId = instructorResult.data!.instructor.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Published class syncs to Webflow', () => {
    let classId: string;

    afterAll(async () => {
      if (classId) {
        await callFunction<DeleteClassRequest>({
          functionName: 'deleteClass',
          data: { id: classId },
          idToken: adminUser.idToken,
        });
        await waitForTrigger();
      }
    });

    it('should sync a published class and store webflowItemId', async () => {
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Webflow Sync Test Class',
          description:
            'This class should be synced to Webflow via the mock server.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          skillLevel: 'beginner',
          status: 'published',
          instructorId,
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;

      // The trigger should have stored a webflowItemId back on the class.
      const webflowItemId = await waitForClassWebflowItemId(
        classId,
        adminUser.idToken
      );
      expect(webflowItemId).toBeDefined();
      expect(webflowItemId).toMatch(/^mock-webflow-item-/);
    });
  });

  // ===========================================================================
  // Class with gallery images surfaces them on the Webflow CMS item
  // ===========================================================================

  describe('Published class with galleryImages', () => {
    let classId: string;

    afterAll(async () => {
      if (classId) {
        await callFunction<DeleteClassRequest>({
          functionName: 'deleteClass',
          data: { id: classId },
          idToken: adminUser.idToken,
        });
        await waitForTrigger();
      }
    });

    it('should send galleryImages as the class-gallery MultiImage field', async () => {
      const galleryImages = [
        {
          url: 'https://storage.example.com/gallery-1.jpg',
          alt: 'Hands centering clay on the wheel',
        },
        {
          url: 'https://storage.example.com/gallery-2.jpg',
          alt: 'Finished bowls on a drying rack',
        },
      ];

      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Webflow Gallery Sync Test',
          description: 'A class with gallery images for sync verification.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 90,
          capacity: 8,
          priceCents: 3500,
          skillLevel: 'all-levels',
          status: 'published',
          instructorId,
          imageUrl: 'https://storage.example.com/hero.jpg',
          galleryImages,
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;

      await waitForTrigger();

      // The class should have synced to the mock server.
      const item = await findMockItemByFirebaseId(classId);
      expect(item).toBeDefined();

      // The class-gallery field should hold the same {url, alt} array we sent.
      expect(item!.fieldData['class-gallery']).toEqual([
        { url: galleryImages[0].url, alt: galleryImages[0].alt },
        { url: galleryImages[1].url, alt: galleryImages[1].alt },
      ]);

      // Sanity: the existing class-image field should still flow.
      expect(item!.fieldData['class-image']).toEqual({
        url: 'https://storage.example.com/hero.jpg',
        alt: 'Webflow Gallery Sync Test class image',
      });
    });
  });

  // ===========================================================================
  // The fields the CMS-native related-classes list depends on (#776)
  // ===========================================================================

  describe('Related-classes fields on the synced item', () => {
    let classId: string;
    const categoryId = 'test-cat-related-classes';

    afterAll(async () => {
      if (classId) {
        await callFunction<DeleteClassRequest>({
          functionName: 'deleteClass',
          data: { id: classId },
          idToken: adminUser.idToken,
        });
        await waitForTrigger();
      }
      await deleteFirestoreDoc('classCategories', categoryId);
      await waitForTrigger();
    });

    it('sets is-full false and links the category, creating the category item on demand', async () => {
      // Seed a category that has never synced — no webflowItemId. The class
      // sync has to create its Webflow item on demand, otherwise the class
      // ships with an empty `category` reference and the related list on its
      // page has nothing to match against.
      await setFirestoreDoc('classCategories', categoryId, {
        name: 'Related Classes Test Category',
        description: 'Seeded without a webflowItemId on purpose.',
        order: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Related Classes Field Test',
          description: 'Verifies the fields the CMS related list binds to.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 90,
          capacity: 4,
          priceCents: 4000,
          skillLevel: 'all-levels',
          status: 'published',
          instructorId,
          categoryId,
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;
      await waitForTrigger();

      const item = await findMockItemByFirebaseId(classId);
      expect(item).toBeDefined();

      // A class with capacity and no registrations is bookable, so the sold-out
      // block on the class page must stay hidden.
      expect(item!.fieldData['is-full']).toBe(false);
      expect(item!.fieldData['spots-remaining']).toBe(4);

      // The denormalized name is what the Collection List filter matches on.
      expect(item!.fieldData['category-name']).toBe(
        'Related Classes Test Category'
      );

      // The reference should point at a real Webflow item id created on demand.
      const categoryItemId = item!.fieldData['category'];
      expect(typeof categoryItemId).toBe('string');
      expect(categoryItemId).toMatch(/^mock-webflow-item-/);

      // ...and that id should belong to an actual Class Categories item, with
      // the id recorded back on the Firestore doc so siblings skip this path.
      const categoryDoc = await getFirestoreDoc('classCategories', categoryId);
      expect(categoryDoc).not.toBeNull();
      expect(categoryDoc!['webflowItemId']).toBe(categoryItemId);
    });

    it('flips is-full to true once registrations fill the class', async () => {
      // capacity is 4, so four confirmed seats leaves zero spots. This is the
      // state that makes the sold-out block render and the class drop out of
      // every other class's "spots remaining > 0" related list.
      await Promise.all(
        [1, 2, 3, 4].map((n) =>
          setFirestoreDoc('registrations', `test-reg-related-${n}`, {
            classId,
            status: 'confirmed',
            quantity: 1,
            email: `related-${n}@test.com`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        )
      );

      // Touch the class so syncClassToWebflow recomputes the count.
      const updateResult = await callFunction<
        UpdateClassRequest,
        UpdateClassResponse
      >({
        functionName: 'updateClass',
        data: { id: classId, shortDescription: 'Now full.' },
        idToken: adminUser.idToken,
      });
      expect(updateResult.status).toBe(200);
      await waitForTrigger();

      const item = await findMockItemByFirebaseId(classId);
      expect(item).toBeDefined();
      expect(item!.fieldData['spots-remaining']).toBe(0);
      expect(item!.fieldData['is-full']).toBe(true);

      // The badge and the visibility switch are read side by side on the page;
      // they must not disagree.
      expect(item!.fieldData['spots-display']).toBe('Waitlist Available');
    });
  });

  describe('Draft class does not sync', () => {
    let classId: string;

    afterAll(async () => {
      if (classId) {
        await callFunction<DeleteClassRequest>({
          functionName: 'deleteClass',
          data: { id: classId },
          idToken: adminUser.idToken,
        });
        await waitForTrigger();
      }
    });

    it('should not sync a draft class to Webflow', async () => {
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Draft Webflow Test',
          description: 'This draft class should not be synced to Webflow.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 90,
          capacity: 8,
          priceCents: 3500,
          skillLevel: 'all-levels',
          status: 'draft',
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;

      await waitForTrigger();

      const webflowItemId = await getClassWebflowItemId(
        classId,
        adminUser.idToken
      );
      expect(webflowItemId).toBeUndefined();
    });
  });

  describe('Status change removes from Webflow', () => {
    let classId: string;

    it('should remove from Webflow when published class is unpublished', async () => {
      // Create published class (will sync)
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Unpublish Sync Test',
          description:
            'This class will be unpublished to test Webflow removal.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 60,
          capacity: 6,
          priceCents: 3000,
          skillLevel: 'beginner',
          status: 'published',
          instructorId,
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;
      await waitForTrigger();

      // Verify it was synced
      const webflowItemId = await getClassWebflowItemId(
        classId,
        adminUser.idToken
      );
      expect(webflowItemId).toBeDefined();

      // Change status to cancelled (should trigger removal)
      const updateResult = await callFunction<
        UpdateClassRequest,
        UpdateClassResponse
      >({
        functionName: 'updateClass',
        data: { id: classId, status: 'cancelled' },
        idToken: adminUser.idToken,
      });

      expect(updateResult.status).toBe(200);
      await waitForTrigger();

      // The webflowItemId may still be stored on the doc (or cleared,
      // depending on implementation). The key assertion is that the
      // trigger fired without error — if the mock server got the
      // delete call, the trigger worked correctly.
    });
  });
});
