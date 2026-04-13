import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateClassRequest,
  CreateClassResponse,
  UpdateClassRequest,
  UpdateClassResponse,
  DeleteClassRequest,
  GetCalendarEventsResponse,
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';
import type { CalendarEvent } from '@maple/ts/domain';

/** A future date, 30 days from now */
function futureDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

/**
 * Wait for the trigger to process. Firestore triggers in the emulator
 * are async — there's a brief delay between the write and the trigger
 * completing its work.
 */
function waitForTrigger(ms = 2000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find a calendar event linked to a class by its sourceRef.
 */
function findLinkedEvent(
  events: CalendarEvent[],
  classId: string
): CalendarEvent | undefined {
  return events.find((e) => e.sourceRef === `classes/${classId}`);
}

describe('onClassWrite Trigger', () => {
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
        name: 'Trigger Test Instructor',
        email: 'trigger-instructor@test.com',
        status: 'active',
        bio: 'Test instructor for trigger integration tests.',
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

  describe('Published class creates calendar event', () => {
    let classId: string;

    afterAll(async () => {
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });
      await waitForTrigger();
    });

    it('should auto-create a calendar event when a class is published', async () => {
      // Create a published class
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Trigger Test Pottery',
          description: 'A class that should generate a calendar event automatically.',
          dateTime: futureDate(),
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

      // Wait for the onClassWrite trigger to fire
      await waitForTrigger();

      // Check that a calendar event was created
      const eventsResult = await callFunction<
        Record<string, never>,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      expect(eventsResult.status).toBe(200);
      const linkedEvent = findLinkedEvent(
        eventsResult.data!.calendarEvents,
        classId
      );
      expect(linkedEvent).toBeDefined();
      expect(linkedEvent?.title).toBe('Trigger Test Pottery');
      expect(linkedEvent?.type).toBe('class');
      expect(linkedEvent?.public).toBe(true);
    });
  });

  describe('Draft class does not create calendar event', () => {
    let classId: string;

    afterAll(async () => {
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });
      await waitForTrigger();
    });

    it('should not create a calendar event for a draft class', async () => {
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Draft Trigger Test',
          description: 'This draft class should not generate a calendar event.',
          dateTime: futureDate(),
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

      const eventsResult = await callFunction<
        Record<string, never>,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      expect(eventsResult.status).toBe(200);
      const linkedEvent = findLinkedEvent(
        eventsResult.data!.calendarEvents,
        classId
      );
      expect(linkedEvent).toBeUndefined();
    });
  });

  describe('Class update syncs to calendar event', () => {
    let classId: string;

    afterAll(async () => {
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });
      await waitForTrigger();
    });

    it('should update the calendar event when a published class is updated', async () => {
      // Create published class
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Update Trigger Test',
          description: 'This class will be updated to test trigger sync.',
          dateTime: futureDate(),
          durationMinutes: 60,
          capacity: 12,
          priceCents: 5000,
          skillLevel: 'intermediate',
          status: 'published',
          instructorId,
        },
        idToken: adminUser.idToken,
      });

      expect(createResult.status).toBe(200);
      classId = createResult.data!.class.id;
      await waitForTrigger();

      // Update the class title
      const updateResult = await callFunction<
        UpdateClassRequest,
        UpdateClassResponse
      >({
        functionName: 'updateClass',
        data: {
          id: classId,
          name: 'Renamed Trigger Test',
        },
        idToken: adminUser.idToken,
      });

      expect(updateResult.status).toBe(200);
      await waitForTrigger();

      // Verify the calendar event title was updated
      const eventsResult = await callFunction<
        Record<string, never>,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      expect(eventsResult.status).toBe(200);
      const linkedEvent = findLinkedEvent(
        eventsResult.data!.calendarEvents,
        classId
      );
      expect(linkedEvent).toBeDefined();
      expect(linkedEvent?.title).toBe('Renamed Trigger Test');
    });
  });

  describe('Class deletion removes calendar event', () => {
    it('should delete the calendar event when a published class is deleted', async () => {
      // Create published class
      const createResult = await callFunction<
        CreateClassRequest,
        CreateClassResponse
      >({
        functionName: 'createClass',
        data: {
          name: 'Delete Trigger Test',
          description: 'This class will be deleted to test trigger cleanup.',
          dateTime: futureDate(),
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
      const classId = createResult.data!.class.id;
      await waitForTrigger();

      // Verify event was created
      let eventsResult = await callFunction<
        Record<string, never>,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      const linkedEvent = findLinkedEvent(
        eventsResult.data!.calendarEvents,
        classId
      );
      expect(linkedEvent).toBeDefined();

      // Delete the class
      await callFunction<DeleteClassRequest>({
        functionName: 'deleteClass',
        data: { id: classId },
        idToken: adminUser.idToken,
      });
      await waitForTrigger();

      // Verify the calendar event was removed
      eventsResult = await callFunction<
        Record<string, never>,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      expect(eventsResult.status).toBe(200);
      const removedEvent = findLinkedEvent(
        eventsResult.data!.calendarEvents,
        classId
      );
      expect(removedEvent).toBeUndefined();
    });
  });
});
