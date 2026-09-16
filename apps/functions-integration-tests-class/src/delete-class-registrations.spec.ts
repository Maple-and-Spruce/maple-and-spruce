/**
 * FAILING (bug E): deleting a class orphans its registrations.
 *
 * `deleteClass` checks that the class exists and then hard-deletes it. The
 * source carries the admission:
 *
 *     // TODO: In Phase 3c, check for existing registrations before allowing deletion
 *
 * `ClassRepository.delete` is a bare `doc(id).delete()` — no cascade, no
 * archive collection, no soft-delete flag — so every registration that
 * referenced the class survives it, pointing at a `classId` that now resolves
 * to nothing. The roster cannot render them, the spot count cannot count them,
 * and the refund path cannot find the class they were sold against.
 *
 * Production currently holds 9 such registrations across 3 deleted classes,
 * 3 of them `confirmed` — people who paid for a class whose record is gone.
 *
 * The operator's route for a class that is not going ahead is to CANCEL it,
 * which keeps the record and the roster intact. Deletion should be refused
 * once money or a seat is attached.
 *
 * These run against the real emulators: ./tools/run-integration-tests.sh class
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  listFirestoreDocs,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateClassRequest,
  CreateClassResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
  DeleteClassRequest,
  DeleteClassResponse,
  GetClassRequest,
} from '@maple/ts/firebase/api-types';

/** A future date, 30 days from now */
function futureDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

describe('deleteClass — registrations must never be orphaned', () => {
  let adminUser: TestUser;
  let classId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

    // A published class needs an instructor — `classValidation` refuses
    // otherwise. The class must be PUBLISHED rather than draft: a draft class
    // carrying a confirmed registration is a fixture that cannot occur, and
    // the classes this actually happened to in production were published
    // classes people had paid for.
    const instructorResult = await callFunction<
      CreateInstructorRequest,
      CreateInstructorResponse
    >({
      functionName: 'createInstructor',
      data: {
        name: 'Test Instructor',
        email: 'instructor@test.com',
        status: 'active',
        bio: 'Test instructor for class integration tests.',
        specialties: ['stained-glass'],
        payRateType: 'flat',
        payRate: 5000,
      },
      idToken: adminUser.idToken,
    });
    const instructorId = instructorResult.data!.instructor.id;

    const created = await callFunction<CreateClassRequest, CreateClassResponse>(
      {
        functionName: 'createClass',
        data: {
          name: 'Stained Glass - TryIt Class',
          description:
            'One-session stained glass class for beginners, all materials included.',
          sessions: [{ dateTime: futureDate() }],
          durationMinutes: 180,
          capacity: 8,
          priceCents: 6000,
          skillLevel: 'beginner',
          status: 'published',
          instructorId,
        },
        idToken: adminUser.idToken,
      }
    );

    // Assert the fixture built, rather than letting an undefined body surface
    // later as an opaque TypeError that skips every test in the file.
    expect(
      created.status,
      `createClass failed (${created.status}): ${JSON.stringify(created.error)}`
    ).toBe(200);

    classId = created.data!.class.id;

    // One paid seat. Invented person — never a real registrant.
    await setFirestoreDoc('registrations', 'reg-orphan-check', {
      classId,
      customerName: 'Robin Ashfield',
      customerEmail: 'robin@example.com',
      customerPhone: '+15550000001',
      quantity: 1,
      status: 'confirmed',
      pricePaidCents: 6360,
      subtotalCents: 6000,
      taxAmountCents: 360,
      taxRatePercent: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('refuses to delete a class that has registrations', async () => {
    const result = await callFunction<DeleteClassRequest, DeleteClassResponse>({
      functionName: 'deleteClass',
      data: { id: classId },
      idToken: adminUser.idToken,
    });

    expect(
      result.status,
      'deleteClass accepted a class with a confirmed registration. The ' +
        'registration survives with a classId that resolves to nothing, so ' +
        'the roster and the refund path both lose it. Cancel the class instead.'
    ).not.toBe(200);
  });

  it('leaves every registration pointing at a class that still exists', async () => {
    await callFunction<DeleteClassRequest, DeleteClassResponse>({
      functionName: 'deleteClass',
      data: { id: classId },
      idToken: adminUser.idToken,
    }).catch(() => undefined);

    // listFirestoreDocs returns { id, data } wrappers — the fields live on
    // `data`. Reading `doc['classId']` yields undefined for every row, which
    // would empty the loop below and let this test pass without checking
    // anything at all.
    const registrations = await listFirestoreDocs('registrations');
    const referencedClassIds = [
      ...new Set(
        registrations
          .map((doc) => doc.data['classId'])
          .filter((id): id is string => typeof id === 'string')
      ),
    ];

    expect(
      referencedClassIds.length,
      'No registration referenced any class, so this assertion would pass ' +
        'vacuously. The fixture failed to seed — fix that before trusting a ' +
        'green result here.'
    ).toBeGreaterThan(0);

    for (const referencedId of referencedClassIds) {
      const lookup = await callFunction<GetClassRequest>({
        functionName: 'getClass',
        data: { id: referencedId },
        idToken: adminUser.idToken,
      });

      expect(
        lookup.status,
        `A registration references class ${referencedId}, which no longer ` +
          `exists. Registrations must not outlive the class they were sold ` +
          `against — there is no archive collection to recover them from.`
      ).toBe(200);
    }
  });
});
