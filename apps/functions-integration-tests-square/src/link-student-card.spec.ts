/**
 * Linking a card Katie already saved in Square to a student (#798).
 *
 * Katie saves cards in the Square app, in person. The portal's job is to find
 * the card she already saved and attach it to the right student — so what is
 * proven here is the read (does a POS-saved card come back, including past the
 * first page) and the guards on the write, because the linked card id is what
 * the billing job charges.
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
  GetSquareCardCandidatesRequest,
  GetSquareCardCandidatesResponse,
  UpdateStudentSquareCardRequest,
  UpdateStudentSquareCardResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = `http://localhost:${process.env['SQUARE_MOCK_SERVER_PORT'] ?? 9997}`;

/** The shape a card saved in the Square app leaves behind. */
const CARDS = {
  'ccof:adult': {
    card_brand: 'VISA',
    last_4: '1112',
    exp_month: 12,
    exp_year: 2031,
    cardholder_name: 'Delphine Cray',
    customer_id: 'cus_adult',
    enabled: true,
  },
  'ccof:parent': {
    card_brand: 'VISA',
    last_4: '1113',
    exp_month: 1,
    exp_year: 2031,
    cardholder_name: 'Sasha Marlowe',
    customer_id: 'cus_parent',
    enabled: true,
  },
  'ccof:stranger': {
    card_brand: 'VISA',
    last_4: '1114',
    exp_month: 9,
    exp_year: 2031,
    cardholder_name: 'Quinn Vasser',
    customer_id: 'cus_stranger',
    enabled: true,
  },
  'ccof:dead': {
    card_brand: 'VISA',
    last_4: '0000',
    exp_month: 1,
    exp_year: 2020,
    cardholder_name: 'Expired Card',
    customer_id: 'cus_dead',
    enabled: true,
  },
  'ccof:off': {
    card_brand: 'VISA',
    last_4: '9999',
    exp_month: 1,
    exp_year: 2031,
    cardholder_name: 'Disabled Card',
    customer_id: 'cus_off',
    enabled: false,
  },
};

const CUSTOMERS = {
  cus_adult: {
    id: 'cus_adult',
    given_name: 'Delphine',
    family_name: 'Cray',
    email_address: 'delphine.cray@example.com',
  },
  cus_parent: {
    id: 'cus_parent',
    given_name: 'Sasha',
    family_name: 'Marlowe',
    email_address: 'sasha.marlowe@example.com',
  },
  cus_stranger: {
    id: 'cus_stranger',
    given_name: 'Quinn',
    family_name: 'Vasser',
    email_address: 'quinn.vasser@example.com',
  },
  cus_dead: { id: 'cus_dead', email_address: 'dead@example.com' },
  cus_off: { id: 'cus_off', email_address: 'off@example.com' },
};

async function seedStudent(
  id: string,
  over: Record<string, unknown>
): Promise<void> {
  await setFirestoreDoc('students', id, {
    instrument: 'fiddle',
    isAdultStudent: true,
    primaryTeacherId: 'instructor-x',
    isHopeScholarship: false,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });
}

describe('Linking a Square card to a student (#798)', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
    await fetch(`${SQUARE_MOCK}/_mock/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(CARDS),
    });
    await fetch(`${SQUARE_MOCK}/_mock/pos-fixture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers: CUSTOMERS }),
    });

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await seedStudent('stu-adult', {
      name: 'Delphine Cray',
      isAdultStudent: true,
      primaryContactName: 'Delphine Cray',
      primaryContactEmail: 'delphine.cray@example.com',
    });
    await seedStudent('stu-child', {
      name: 'Devin Marlowe',
      isAdultStudent: false,
      primaryContactName: 'Sasha Marlowe',
      primaryContactEmail: 'sasha.marlowe@example.com',
    });
  }, 30000);

  const candidates = () =>
    callFunction<GetSquareCardCandidatesRequest, GetSquareCardCandidatesResponse>(
      { functionName: 'getSquareCardCandidates', data: {}, idToken: adminUser.idToken }
    );

  const link = (studentId: string, squareCardId: string | null) =>
    callFunction<UpdateStudentSquareCardRequest, UpdateStudentSquareCardResponse>(
      {
        functionName: 'updateStudentSquareCard',
        data: { studentId, squareCardId },
        idToken: adminUser.idToken,
      }
    );

  it('reads every card on file, past the first page', async () => {
    // The mock paginates at 2. Reading only the first page would silently lose
    // everyone after the second card — the failure this test exists for.
    const result = await candidates();

    expect(result.status).toBe(200);
    const ids = (result.data?.cards ?? []).map((c) => c.cardId).sort();
    expect(ids).toEqual([
      'ccof:adult',
      'ccof:dead',
      'ccof:parent',
      'ccof:stranger',
    ]);
  }, 60000);

  it('leaves a disabled card out entirely — it cannot be charged', async () => {
    const ids = ((await candidates()).data?.cards ?? []).map((c) => c.cardId);
    expect(ids).not.toContain('ccof:off');
  }, 30000);

  it('carries the customer email, which is what matches a child to a parent’s card', async () => {
    const cards = (await candidates()).data?.cards ?? [];
    const parent = cards.find((c) => c.cardId === 'ccof:parent');

    expect(parent?.customerEmail).toBe('sasha.marlowe@example.com');
    expect(parent?.customerFamilyName).toBe('Marlowe');
  }, 30000);

  it('links a card, storing what the billing job needs', async () => {
    const result = await link('stu-adult', 'ccof:adult');

    expect(result.status).toBe(200);
    expect(result.data?.student).toMatchObject({
      squareCustomerId: 'cus_adult',
      squareCardId: 'ccof:adult',
      cardBrand: 'VISA',
      cardLast4: '1112',
    });
    expect(result.data?.student.cardLinkedAt).toBeTruthy();
  }, 30000);

  it('reports which cards are already spoken for', async () => {
    const result = await candidates();
    expect(result.data?.linkedTo['ccof:adult']).toMatchObject({
      id: 'stu-adult',
      name: 'Delphine Cray',
    });
  }, 30000);

  it('refuses to link one card to a second student', async () => {
    // A card belongs to one family. Linking it twice bills one family for
    // another's lessons.
    const result = await link('stu-child', 'ccof:adult');

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/already linked to Delphine Cray/i);
  }, 30000);

  it('refuses an expired card', async () => {
    const result = await link('stu-child', 'ccof:dead');

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/expired/i);
  }, 30000);

  it('refuses a card that is not on file at all', async () => {
    const result = await link('stu-child', 'ccof:invented');

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.error)).toMatch(/no longer on file/i);
  }, 30000);

  it('unlinks without touching Square, so the card stays usable by hand', async () => {
    const result = await link('stu-adult', null);

    expect(result.status).toBe(200);
    expect(result.data?.student.squareCardId).toBeUndefined();
    expect(result.data?.student.squareCustomerId).toBeUndefined();

    // Still on file in Square — unlinking is a portal decision, not a deletion.
    const ids = ((await candidates()).data?.cards ?? []).map((c) => c.cardId);
    expect(ids).toContain('ccof:adult');
  }, 30000);

  it('rejects an unauthenticated caller', async () => {
    const result = await callFunction({
      functionName: 'getSquareCardCandidates',
    });
    expect(result.status).toBe(401);
  }, 30000);
});
