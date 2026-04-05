import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '../utils/index.js';
import type { TestUser } from '../utils/index.js';
import { ADMIN_USER, NON_ADMIN_USER } from '../fixtures/index.js';
import type {
  GetCalendarEmbedConfigResponse,
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
} from '@maple/ts/firebase/api-types';

describe('Calendar Embed Config Functions', () => {
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
      const result = await callFunction({
        functionName: 'getCalendarEmbedConfig',
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction({
        functionName: 'getCalendarEmbedConfig',
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('Config lifecycle', () => {
    it('should get config (creates default if none exists)', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetCalendarEmbedConfigResponse
      >({
        functionName: 'getCalendarEmbedConfig',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.config).toBeDefined();
      expect(result.data?.config.defaultTab).toBeDefined();
      expect(result.data?.config.sources).toBeDefined();
      expect(Array.isArray(result.data?.config.sources)).toBe(true);
    });

    it('should update config settings', async () => {
      const result = await callFunction<
        UpdateCalendarEmbedConfigRequest,
        UpdateCalendarEmbedConfigResponse
      >({
        functionName: 'updateCalendarEmbedConfig',
        data: {
          title: 'Test Calendar',
          defaultTab: 'week',
          startOfWeek: 'su',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.config.title).toBe('Test Calendar');
      expect(result.data?.config.defaultTab).toBe('week');
      expect(result.data?.config.startOfWeek).toBe('su');
    });

    it('should add a custom source', async () => {
      const result = await callFunction<
        AddCalendarEmbedSourceRequest,
        AddCalendarEmbedSourceResponse
      >({
        functionName: 'addCalendarEmbedSource',
        data: {
          label: 'Test Feed',
          url: 'https://example.com/test.ics',
          color: 'FF5733',
          enabled: true,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const addedSource = result.data?.config.sources.find(
        (s) => s.label === 'Test Feed'
      );
      expect(addedSource).toBeDefined();
      expect(addedSource?.url).toBe('https://example.com/test.ics');
      expect(addedSource?.color).toBe('FF5733');
      expect(addedSource?.isSystem).toBe(false);
    });

    it('should remove a custom source', async () => {
      // First get config to find the source ID
      const getResult = await callFunction<
        Record<string, never>,
        GetCalendarEmbedConfigResponse
      >({
        functionName: 'getCalendarEmbedConfig',
        idToken: adminUser.idToken,
      });

      const customSource = getResult.data?.config.sources.find(
        (s) => s.label === 'Test Feed'
      );
      expect(customSource).toBeDefined();

      const result = await callFunction<
        RemoveCalendarEmbedSourceRequest,
        RemoveCalendarEmbedSourceResponse
      >({
        functionName: 'removeCalendarEmbedSource',
        data: { sourceId: customSource!.id },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const removed = result.data?.config.sources.find(
        (s) => s.id === customSource!.id
      );
      expect(removed).toBeUndefined();
    });
  });

  describe('Validation', () => {
    it('should reject source with missing label', async () => {
      const result = await callFunction({
        functionName: 'addCalendarEmbedSource',
        data: {
          url: 'https://example.com/test.ics',
          color: 'FF5733',
          enabled: true,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject source with missing url', async () => {
      const result = await callFunction({
        functionName: 'addCalendarEmbedSource',
        data: {
          label: 'Missing URL Feed',
          color: 'FF5733',
          enabled: true,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
