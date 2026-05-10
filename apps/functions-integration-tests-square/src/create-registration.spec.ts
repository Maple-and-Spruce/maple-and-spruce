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
  listFirestoreDocs,
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

    it('should persist additionalAttendees and queue per-attendee emails', async () => {
      const MULTI_CLASS_ID = 'test-reg-multi-class';
      await setFirestoreDoc('classes', MULTI_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Multi Attendee Class',
        capacity: 10,
      });

      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: MULTI_CLASS_ID,
          customerEmail: 'registrant@test.com',
          customerName: 'Pat Registrant',
          quantity: 3,
          additionalAttendees: [
            { name: 'Alice Friend', email: 'alice@test.com' },
            { name: 'Bob Friend' },
          ],
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.quantity).toBe(3);
      expect(result.data?.registration.additionalAttendees).toEqual([
        { name: 'Alice Friend', email: 'alice@test.com' },
        { name: 'Bob Friend' },
      ]);

      const mailDocs = await listFirestoreDocs('mail');
      const registrantMail = mailDocs.find(
        (d) => d.to === 'registrant@test.com'
      );
      const attendeeMail = mailDocs.find((d) => d.to === 'alice@test.com');

      expect(registrantMail?.template?.name).toBe('registration-confirmation');
      expect(registrantMail?.template?.data?.extrasWithoutEmailCount).toBe(1);

      expect(attendeeMail?.template?.name).toBe(
        'registration-confirmation-attendee'
      );
      expect(attendeeMail?.template?.data?.attendeeName).toBe('Alice Friend');
      expect(attendeeMail?.template?.data?.registrantName).toBe(
        'Pat Registrant'
      );
      // Class details only — no payment fields.
      expect(attendeeMail?.template?.data?.amountPaid).toBeUndefined();
      expect(attendeeMail?.template?.data?.subtotal).toBeUndefined();
    });

    it('should reject when quantity disagrees with additionalAttendees length', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: TEST_CLASS_ID,
          customerEmail: 'mismatch@test.com',
          customerName: 'Mismatch User',
          quantity: 3,
          additionalAttendees: [{ name: 'Solo Friend' }],
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });

      expect(result.status).not.toBe(200);
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

  describe('Atomic redemption (single-use codes)', () => {
    // Each test seeds a fresh single-use discount and a fresh class so
    // tests don't share state. The class needs enough capacity for two
    // concurrent registrations.
    const REDEEM_CLASS_ID = 'test-reg-redeem-class';

    beforeAll(async () => {
      await setFirestoreDoc('classes', REDEEM_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Atomic Redemption Workshop',
        capacity: 20,
      });
    });

    it('redeems a single-use code on the first attempt and rejects the second', async () => {
      // Fresh single-use code for this test.
      await setFirestoreDoc('discounts', 'test-discount-single-use-A', {
        code: 'SINGLEUSE-A',
        type: 'percent',
        description: 'single-use, sequential redemption',
        status: 'active',
        appliesTo: 'order',
        nthSlot: 1,
        usageLimit: 1,
        usageCount: 0,
        percent: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const first = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: REDEEM_CLASS_ID,
          customerEmail: 'first@test.com',
          customerName: 'First Redeemer',
          quantity: 1,
          discountCode: 'SINGLEUSE-A',
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(first.status).toBe(200);
      expect(first.data?.registration.discountCode).toBe('SINGLEUSE-A');
      expect(first.data?.registration.discountAmountCents).toBe(2250);

      const second = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: REDEEM_CLASS_ID,
          customerEmail: 'second@test.com',
          customerName: 'Second Redeemer',
          quantity: 1,
          discountCode: 'SINGLEUSE-A',
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      // Customer included the code in the request, expecting the discounted
      // price they saw in the preview. The code is now exhausted, so the
      // registration MUST fail rather than silently charge them full price.
      expect(second.status).not.toBe(200);
    });

    it('rejects a concurrent second redemption when both pass the pre-flight check', async () => {
      // This test seeds a discount, then fires two registration requests
      // *in parallel* to force them through the transaction at the same
      // time. Both will pass the pre-transaction lookup (usageCount=0),
      // but Firestore's transactional check inside create-registration
      // must allow exactly one to succeed.
      await setFirestoreDoc('discounts', 'test-discount-single-use-B', {
        code: 'SINGLEUSE-B',
        type: 'percent',
        description: 'single-use, concurrent redemption',
        status: 'active',
        appliesTo: 'order',
        nthSlot: 1,
        usageLimit: 1,
        usageCount: 0,
        percent: 50,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const both = await Promise.all([
        callFunction<CreateRegistrationRequest, CreateRegistrationResponse>({
          functionName: 'createRegistration',
          data: {
            classId: REDEEM_CLASS_ID,
            customerEmail: 'racer-1@test.com',
            customerName: 'Racer One',
            quantity: 1,
            discountCode: 'SINGLEUSE-B',
            paymentNonce: 'cnon:card-nonce-ok',
          },
        }),
        callFunction<CreateRegistrationRequest, CreateRegistrationResponse>({
          functionName: 'createRegistration',
          data: {
            classId: REDEEM_CLASS_ID,
            customerEmail: 'racer-2@test.com',
            customerName: 'Racer Two',
            quantity: 1,
            discountCode: 'SINGLEUSE-B',
            paymentNonce: 'cnon:card-nonce-ok',
          },
        }),
      ]);

      // Exactly one redemption succeeds; the other call must FAIL —
      // never silently fall back to full price (the customer didn't
      // consent to that charge). The loser hits one of two paths:
      //   (a) both pre-flight reads see usageCount=0; both enter the
      //       transaction; Firestore aborts one; the loser retries,
      //       re-reads usageCount=1, throws inside the transaction.
      //   (b) loser's pre-flight read happens after the winner commits;
      //       lookup says invalid → throws before the transaction.
      // Either way the loser returns non-200.
      const redeemed = both.filter(
        (r) => r.status === 200 && r.data?.registration.discountCode === 'SINGLEUSE-B'
      );
      expect(redeemed.length).toBe(1);
      expect(redeemed[0].data?.registration.discountAmountCents).toBe(2250);

      const loser = both.find((r) => r !== redeemed[0])!;
      expect(loser.status).not.toBe(200);
    });
  });

  describe('Referral program (auto-generated codes in confirmation email)', () => {
    const REFERRAL_OFF_CLASS_ID = 'test-reg-referral-off-class';
    const REFERRAL_ON_CLASS_ID = 'test-reg-referral-on-class';
    const FRIEND_CLASS_ID = 'test-reg-friend-class';

    beforeAll(async () => {
      // Class WITHOUT referralDiscount — control case.
      await setFirestoreDoc('classes', REFERRAL_OFF_CLASS_ID, {
        ...TEST_CLASS,
        name: 'No-Referral Workshop',
        capacity: 10,
      });

      // Class WITH referralDiscount — opted in.
      await setFirestoreDoc('classes', REFERRAL_ON_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Referral Workshop',
        capacity: 10,
        referralDiscount: {
          percent: 50,
          expiresAfterDays: 60,
        },
      });

      // Class for the friend to redeem the referral code on.
      await setFirestoreDoc('classes', FRIEND_CLASS_ID, {
        ...TEST_CLASS,
        name: 'Friend Workshop',
        capacity: 10,
      });
    });

    it('does not create a referral code for classes without referralDiscount', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: REFERRAL_OFF_CLASS_ID,
          customerEmail: 'no-referral@test.com',
          customerName: 'No Referral',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).toBe(200);
      const registrationId = result.data?.registration.id;

      // No discount doc was generated from this registration.
      const discounts = await listFirestoreDocs('discounts');
      const generated = discounts.filter(
        (d) => d.data.generatedFromRegistrationId === registrationId
      );
      expect(generated.length).toBe(0);

      // Mail doc for this registration has no referralCode field.
      const mail = await listFirestoreDocs('mail');
      const ours = mail.find((m) => {
        const tmpl = m.data.template as { data?: { confirmationNumber?: string } } | undefined;
        return tmpl?.data?.confirmationNumber === result.data?.confirmationNumber;
      });
      expect(ours).toBeDefined();
      const tmpl = ours!.data.template as { data: Record<string, unknown> };
      expect(tmpl.data.referralCode).toBeFalsy();
    });

    it('generates a single-use referral code and includes it in the email payload', async () => {
      const result = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: REFERRAL_ON_CLASS_ID,
          customerEmail: 'referrer@test.com',
          customerName: 'Referrer Person',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(result.status).toBe(200);
      const registrationId = result.data?.registration.id;

      // Exactly one discount doc was generated for this registration.
      const discounts = await listFirestoreDocs('discounts');
      const generated = discounts.filter(
        (d) => d.data.generatedFromRegistrationId === registrationId
      );
      expect(generated.length).toBe(1);
      const referral = generated[0].data;
      expect(referral.code).toMatch(/^FR-[A-Z0-9]{6}$/);
      expect(referral.type).toBe('percent');
      expect(referral.percent).toBe(50);
      expect(referral.usageLimit).toBe(1);
      expect(referral.usageCount).toBe(0);
      expect(referral.appliesTo).toBe('order');
      expect(referral.status).toBe('active');
      // expiresAt is ~60 days out; allow a generous window for test timing.
      expect(referral.expiresAt).toBeDefined();

      // Mail doc has the same code in its template payload.
      const mail = await listFirestoreDocs('mail');
      const ours = mail.find((m) => {
        const tmpl = m.data.template as { data?: { confirmationNumber?: string } } | undefined;
        return tmpl?.data?.confirmationNumber === result.data?.confirmationNumber;
      });
      expect(ours).toBeDefined();
      const tmpl = ours!.data.template as { data: Record<string, unknown> };
      expect(tmpl.data.referralCode).toBe(referral.code);
      expect(tmpl.data.referralPercent).toBe(50);
      expect(typeof tmpl.data.referralExpires).toBe('string');
    });

    it('generated code is redeemable as a single-use discount on a different class', async () => {
      // First, generate a referral code via the referrer's registration.
      const referrer = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: REFERRAL_ON_CLASS_ID,
          customerEmail: 'referrer-2@test.com',
          customerName: 'Second Referrer',
          quantity: 1,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(referrer.status).toBe(200);
      const referrerRegId = referrer.data?.registration.id;

      const discounts = await listFirestoreDocs('discounts');
      const generated = discounts.find(
        (d) => d.data.generatedFromRegistrationId === referrerRegId
      );
      expect(generated).toBeDefined();
      const code = generated!.data.code as string;

      // Friend uses the code on a different class.
      const friend = await callFunction<
        CreateRegistrationRequest,
        CreateRegistrationResponse
      >({
        functionName: 'createRegistration',
        data: {
          classId: FRIEND_CLASS_ID,
          customerEmail: 'friend@test.com',
          customerName: 'The Friend',
          quantity: 1,
          discountCode: code,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(friend.status).toBe(200);
      expect(friend.data?.registration.discountCode).toBe(code);
      // 50% off $45 = $22.50 + 6% tax = 2385 cents
      expect(friend.data?.registration.pricePaidCents).toBe(2385);

      // Second redemption of the same code must fail (single-use).
      const friendOfFriend = await callFunction<CreateRegistrationRequest>({
        functionName: 'createRegistration',
        data: {
          classId: FRIEND_CLASS_ID,
          customerEmail: 'friend-of-friend@test.com',
          customerName: 'Friend of Friend',
          quantity: 1,
          discountCode: code,
          paymentNonce: 'cnon:card-nonce-ok',
        },
      });
      expect(friendOfFriend.status).not.toBe(200);
    });
  });
});
