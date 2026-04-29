/**
 * Integration tests for createRegistration Cloud Function.
 *
 * Uses the mock HTTP server for Square payment API calls.
 * The function runs in the Firebase emulator against real Firestore,
 * but Square API calls are intercepted by the mock server via
 * SQUARE_BASE_URL env var.
 */
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
  CreateRegistrationRequest,
  CreateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

/** Future date for test classes */
function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

const TEST_CLASS_ID = 'test-reg-class';
const TEST_CLASS = {
  name: 'Registration Test Pottery',
  description: 'A class for testing the registration flow end to end.',
  dateTime: futureDate(),
  durationMinutes: 120,
  capacity: 5,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const FREE_CLASS_ID = 'test-reg-free-class';
const FREE_CLASS = {
  ...TEST_CLASS,
  name: 'Free Community Workshop',
  priceCents: 0,
};

describe('createRegistration', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);

    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });

    // Seed test classes directly into Firestore
    await setFirestoreDoc('classes', TEST_CLASS_ID, TEST_CLASS);
    await setFirestoreDoc('classes', FREE_CLASS_ID, FREE_CLASS);
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Happy path', () => {
    it('should create a registration with payment', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerEmail: 'student@test.com',
          customerName: 'Test Student',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration).toBeDefined();
      expect(result.data?.registration.classId).toBe(TEST_CLASS_ID);
      expect(result.data?.registration.customerEmail).toBe('student@test.com');
      expect(result.data?.registration.customerName).toBe('Test Student');
      expect(result.data?.registration.quantity).toBe(1);
      expect(result.data?.registration.status).toBe('confirmed');
      // 4500 base + 6% tax = 4770
      expect(result.data?.registration.pricePaidCents).toBe(4770);
      expect(result.data?.confirmationNumber).toBeDefined();
      expect(result.data?.confirmationNumber).toMatch(/^MS-[A-Z0-9]{6}$/);
    });

    it('should create a registration for a free class without payment', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: FREE_CLASS_ID,
          customerEmail: 'freebie@test.com',
          customerName: 'Free Student',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration).toBeDefined();
      expect(result.data?.registration.status).toBe('confirmed');
      expect(result.data?.registration.pricePaidCents).toBe(0);
    });

    it('should support group registrations', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerEmail: 'group@test.com',
          customerName: 'Group Leader',
          quantity: 2,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.quantity).toBe(2);
      // Price should be multiplied by quantity: 4500 * 2 + 6% tax = 9540
      expect(result.data?.registration.pricePaidCents).toBe(9540);
    });
  });

  describe('Capacity enforcement', () => {
    const SMALL_CLASS_ID = 'test-reg-small-class';

    beforeAll(async () => {
      await setFirestoreDoc('classes', SMALL_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Tiny Workshop',
        capacity: 2,
      });
    });

    it('should reject registration when class is full', async () => {
      // Fill the class
      await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: SMALL_CLASS_ID,
          customerEmail: 'first@test.com',
          customerName: 'First Student',
          quantity: 2,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      // Try to register when full
      const result = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: SMALL_CLASS_ID,
          customerEmail: 'late@test.com',
          customerName: 'Late Student',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject group registration exceeding remaining spots', async () => {
      const LIMITED_CLASS_ID = 'test-reg-limited-class';
      await setFirestoreDoc('classes', LIMITED_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Limited Workshop',
        capacity: 3,
      });

      // Take 2 spots
      await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: LIMITED_CLASS_ID,
          customerEmail: 'pair@test.com',
          customerName: 'Pair Student',
          quantity: 2,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      // Try to take 2 more (only 1 remaining)
      const result = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: LIMITED_CLASS_ID,
          customerEmail: 'overflow@test.com',
          customerName: 'Overflow Student',
          quantity: 2,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Validation', () => {
    it('should reject missing classId', async () => {
      const result = await callFunction({
        functionName: 'createRegistration',
        data: {
          customerEmail: 'test@test.com',
          customerName: 'Test',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject missing customerEmail', async () => {
      const result = await callFunction({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerName: 'Test',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject non-existent class', async () => {
      const result = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: 'nonexistent-class',
          customerEmail: 'test@test.com',
          customerName: 'Test',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject registration for draft class', async () => {
      const DRAFT_CLASS_ID = 'test-reg-draft-class';
      await setFirestoreDoc('classes', DRAFT_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Draft Class',
        status: 'draft',
      });

      const result = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: DRAFT_CLASS_ID,
          customerEmail: 'test@test.com',
          customerName: 'Test',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject zero quantity', async () => {
      const result = await callFunction({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerEmail: 'test@test.com',
          customerName: 'Test',
          quantity: 0,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Discount application', () => {
    // Quantity-tier tests need their own class — TEST_CLASS_ID has only 5 spots
    // and earlier tests in this file fill it before we get here.
    const PAIR_TEST_CLASS_ID = 'test-reg-pair-class';

    beforeAll(async () => {
      // Legacy-shape doc (no appliesTo/nthSlot) — verifies repo defaults
      // back-fill 'order' so existing discounts continue to work.
      await setFirestoreDoc('discounts', 'test-discount-percent', {
        code: 'TESTDISCOUNT',
        type: 'percent',
        description: '50% off for testing',
        status: 'active',
        percent: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Quantity-tier: 50% off second slot onward
      await setFirestoreDoc('discounts', 'test-discount-pair', {
        code: 'PAIRDEAL',
        type: 'percent',
        description: 'Bring a friend — 50% off second slot',
        status: 'active',
        appliesTo: 'nth-slot-onward',
        nthSlot: 2,
        percent: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Dedicated class with extra capacity for the pair-pricing tests.
      await setFirestoreDoc('classes', PAIR_TEST_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Pair Pricing Workshop',
        capacity: 10,
      });
    });

    it('should apply discount code to registration', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerEmail: 'discount@test.com',
          customerName: 'Discount Student',
          quantity: 1,
          discountCode: 'TESTDISCOUNT',
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration).toBeDefined();
      // 50% off $45 = $22.50 + 6% tax = 2385 cents
      expect(result.data?.registration.pricePaidCents).toBe(2385);
      expect(result.data?.registration.discountCode).toBe('TESTDISCOUNT');
    });

    it('should not discount when quantity-tier code is below threshold', async () => {
      // PAIRDEAL discounts slot 2+; at qty=1 nothing is discounted.
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: PAIR_TEST_CLASS_ID,
          customerEmail: 'pair-solo@test.com',
          customerName: 'Solo Student',
          quantity: 1,
          discountCode: 'PAIRDEAL',
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      // 4500 base + 6% tax = 4770; no discount applied
      expect(result.data?.registration.pricePaidCents).toBe(4770);
      // Code is silently ignored at sub-threshold quantities (no discount stored)
      expect(result.data?.registration.discountAmountCents ?? 0).toBe(0);
    });

    it('should apply quantity-tier discount only to slots from nthSlot onward', async () => {
      // qty=2 × $45 = $90 base; slot 2 gets 50% off ($22.50 off);
      // subtotal $67.50; +6% tax → $71.55 = 7155 cents
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: PAIR_TEST_CLASS_ID,
          customerEmail: 'pair-duo@test.com',
          customerName: 'Pair Student',
          quantity: 2,
          discountCode: 'PAIRDEAL',
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.discountCode).toBe('PAIRDEAL');
      expect(result.data?.registration.discountAmountCents).toBe(2250);
      expect(result.data?.registration.subtotalCents).toBe(6750);
      expect(result.data?.registration.pricePaidCents).toBe(7155);
    });
  });
});
