import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CreateCalendarEventRequest,
  CreateCalendarEventResponse,
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
  GetCalendarEventRequest,
  GetCalendarEventResponse,
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse,
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

function futureStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(10, 0, 0, 0);
  return d;
}

function futureEnd(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(12, 0, 0, 0);
  return d;
}

const SAMPLE_EVENT: CreateCalendarEventRequest = {
  title: 'Community Open Jam',
  description: 'Bring your instruments and join the jam session.',
  startDateTime: futureStart(),
  endDateTime: futureEnd(),
  recurrenceRule: null,
  location: '688 Beulah Road, Morgantown, WV 26508',
  type: 'jam',
  public: true,
  sourceRef: null,
  createdBy: 'test-admin-uid',
};

describe('Calendar Event Functions', () => {
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

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction<CreateCalendarEventRequest>({
        functionName: 'createCalendarEvent',
        data: SAMPLE_EVENT,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateCalendarEventRequest>({
        functionName: 'createCalendarEvent',
        data: SAMPLE_EVENT,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let eventId: string;

    it('should create a calendar event', async () => {
      const result = await callFunction<
        CreateCalendarEventRequest,
        CreateCalendarEventResponse
      >({
        functionName: 'createCalendarEvent',
        data: { ...SAMPLE_EVENT, createdBy: adminUser.uid },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.calendarEvent).toBeDefined();
      expect(result.data?.calendarEvent.title).toBe(SAMPLE_EVENT.title);
      expect(result.data?.calendarEvent.description).toBe(
        SAMPLE_EVENT.description
      );
      expect(result.data?.calendarEvent.type).toBe('jam');
      expect(result.data?.calendarEvent.public).toBe(true);
      expect(result.data?.calendarEvent.location).toBe(SAMPLE_EVENT.location);
      expect(result.data?.calendarEvent.id).toBeDefined();

      eventId = result.data!.calendarEvent.id;
    });

    it('should get all calendar events', async () => {
      const result = await callFunction<
        GetCalendarEventsRequest,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.calendarEvents).toBeDefined();
      expect(result.data?.calendarEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should get calendar event by id', async () => {
      const result = await callFunction<
        GetCalendarEventRequest,
        GetCalendarEventResponse
      >({
        functionName: 'getCalendarEvent',
        data: { id: eventId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.calendarEvent.id).toBe(eventId);
      expect(result.data?.calendarEvent.title).toBe(SAMPLE_EVENT.title);
    });

    it('should update a calendar event', async () => {
      const result = await callFunction<
        UpdateCalendarEventRequest,
        UpdateCalendarEventResponse
      >({
        functionName: 'updateCalendarEvent',
        data: {
          id: eventId,
          title: 'Updated Jam Session',
          public: false,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.calendarEvent.title).toBe('Updated Jam Session');
      expect(result.data?.calendarEvent.public).toBe(false);
      // Unchanged fields should persist
      expect(result.data?.calendarEvent.type).toBe('jam');
      expect(result.data?.calendarEvent.description).toBe(
        SAMPLE_EVENT.description
      );
    });

    it('should delete a calendar event', async () => {
      const result = await callFunction<
        DeleteCalendarEventRequest,
        DeleteCalendarEventResponse
      >({
        functionName: 'deleteCalendarEvent',
        data: { id: eventId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });

    it('should return not-found for deleted event', async () => {
      const result = await callFunction<GetCalendarEventRequest>({
        functionName: 'getCalendarEvent',
        data: { id: eventId },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Filtering by type', () => {
    let jamEventId: string;
    let hoursEventId: string;

    beforeAll(async () => {
      const [jamRes, hoursRes] = await Promise.all([
        callFunction<CreateCalendarEventRequest, CreateCalendarEventResponse>({
          functionName: 'createCalendarEvent',
          data: {
            ...SAMPLE_EVENT,
            title: 'Filter Test Jam',
            type: 'jam',
            createdBy: adminUser.uid,
          },
          idToken: adminUser.idToken,
        }),
        callFunction<CreateCalendarEventRequest, CreateCalendarEventResponse>({
          functionName: 'createCalendarEvent',
          data: {
            ...SAMPLE_EVENT,
            title: 'Filter Test Hours',
            type: 'hours',
            createdBy: adminUser.uid,
          },
          idToken: adminUser.idToken,
        }),
      ]);

      jamEventId = jamRes.data!.calendarEvent.id;
      hoursEventId = hoursRes.data!.calendarEvent.id;
    });

    afterAll(async () => {
      await Promise.all([
        callFunction<DeleteCalendarEventRequest>({
          functionName: 'deleteCalendarEvent',
          data: { id: jamEventId },
          idToken: adminUser.idToken,
        }),
        callFunction<DeleteCalendarEventRequest>({
          functionName: 'deleteCalendarEvent',
          data: { id: hoursEventId },
          idToken: adminUser.idToken,
        }),
      ]);
    });

    it('should filter events by type', async () => {
      const result = await callFunction<
        GetCalendarEventsRequest,
        GetCalendarEventsResponse
      >({
        functionName: 'getCalendarEvents',
        data: { type: 'jam' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const titles = result.data?.calendarEvents.map((e) => e.title) ?? [];
      expect(titles).toContain('Filter Test Jam');
      expect(titles).not.toContain('Filter Test Hours');
    });
  });

  describe('Validation', () => {
    it('should reject event with missing title', async () => {
      const result = await callFunction({
        functionName: 'createCalendarEvent',
        data: {
          description: 'No title event',
          startDateTime: futureStart(),
          endDateTime: futureEnd(),
          type: 'event',
          public: true,
          recurrenceRule: null,
          location: 'Test',
          sourceRef: null,
          createdBy: adminUser.uid,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject event with end before start', async () => {
      const result = await callFunction({
        functionName: 'createCalendarEvent',
        data: {
          title: 'Backwards Time Event',
          description: 'End is before start',
          startDateTime: futureEnd(), // later time
          endDateTime: futureStart(), // earlier time
          type: 'event',
          public: true,
          recurrenceRule: null,
          location: 'Test',
          sourceRef: null,
          createdBy: adminUser.uid,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject event with title too short', async () => {
      const result = await callFunction({
        functionName: 'createCalendarEvent',
        data: {
          title: 'Hi',
          description: 'Short title',
          startDateTime: futureStart(),
          endDateTime: futureEnd(),
          type: 'event',
          public: true,
          recurrenceRule: null,
          location: 'Test',
          sourceRef: null,
          createdBy: adminUser.uid,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
