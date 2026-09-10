/**
 * Matching Square cards on file to students (#798).
 *
 * Built from the three cards actually on the live account, because the shape
 * of the problem is not what you would guess: an adult student's card is in
 * their own name, but a child's card is in a parent's — Devin Marlowe's card
 * reads "Sasha Marlowe" and shares nothing with his name.
 *
 * A wrong link charges the wrong family, so the bar here is that a suggestion
 * is never made without a stated reason, and never made automatically.
 */
import { describe, it, expect } from 'vitest';
import {
  isCardExpired,
  isCardExpiringSoon,
  rankCardsForStudent,
} from './square-card-match';
import type { SquareCardOnFile } from './square-card-match';
import type { Student } from './student';

function card(over: Partial<SquareCardOnFile> = {}): SquareCardOnFile {
  return {
    cardId: 'ccof:x',
    customerId: 'cus_x',
    cardBrand: 'VISA',
    last4: '1111',
    enabled: true,
    ...over,
  };
}

function student(over: Partial<Student> = {}): Student {
  return {
    name: 'Test Student',
    isAdultStudent: true,
    primaryContactName: 'Test Student',
    primaryContactEmail: 'test@example.com',
    ...over,
  } as Student;
}

/** The real cards, as read from the live account. */
const delphine = card({
  cardId: 'ccof:delphine',
  customerId: 'cus_adele',
  cardholderName: 'Delphine Cray',
  customerGivenName: 'Delphine',
  customerFamilyName: 'Cray',
  customerEmail: 'delphine.cray@example.com',
  customerPhone: '+15555550142',
  last4: '1112',
  expMonth: 12,
  expYear: 2026,
});

const sasha = card({
  cardId: 'ccof:sasha',
  customerId: 'cus_lark',
  cardholderName: 'Sasha Marlowe',
  customerGivenName: 'Sasha',
  customerFamilyName: 'Marlowe',
  customerEmail: 'sasha.marlowe@example.com',
  last4: '1113',
});

/** A retail customer with a card, matching no student. */
const stranger = card({
  cardId: 'ccof:quinn',
  customerId: 'cus_retail',
  cardholderName: 'Quinn Vasser',
  customerGivenName: 'Quinn',
  customerFamilyName: 'Vasser',
  last4: '1114',
});

describe('the real cases from the live account', () => {
  it('matches an adult student to their own card, by email', () => {
    const adeleCray = student({
      name: 'Delphine Cray',
      isAdultStudent: true,
      primaryContactName: 'Delphine Cray',
      primaryContactEmail: 'delphine.cray@example.com',
      primaryContactPhone: '555-555-0142',
    });

    const [best] = rankCardsForStudent(adeleCray, [stranger, sasha, delphine]);

    expect(best.card.cardId).toBe('ccof:delphine');
    expect(best.strength).toBe('exact');
    // Email, phone and name all agree here.
    expect(best.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('matches a CHILD to their parent’s card, which shares no name with them', () => {
    // The case that makes name-only matching useless. Devin's card reads
    // "Sasha Marlowe"; the bridge is that his contact email is hers.
    const devin = student({
      name: 'Devin Marlowe',
      isAdultStudent: false,
      primaryContactName: 'Sasha Marlowe',
      primaryContactEmail: 'sasha.marlowe@example.com',
      primaryContactPhone: '+15555550177',
    });

    const [best] = rankCardsForStudent(devin, [stranger, delphine, sasha]);

    expect(best.card.cardId).toBe('ccof:sasha');
    expect(best.strength).toBe('exact');
    expect(best.reasons[0]).toMatch(/same email/i);
  });

  it('suggests nothing for a student with no card on file', () => {
    // Pip's contact is Marnie Underhill, who has no card. Forcing the nearest
    // name would attach a stranger's card to his family.
    const pip = student({
      name: '"Pip" (Rosalind) Vance',
      isAdultStudent: false,
      primaryContactName: 'Marnie Underhill',
      primaryContactEmail: 'marnie.underhill@example.com',
    });

    expect(rankCardsForStudent(pip, [stranger, delphine, sasha])).toEqual([]);
  });

  it('leaves a retail customer’s card matched to nobody', () => {
    const anyStudent = student({
      name: 'Tobias Pike',
      primaryContactName: 'Tobias Pike',
      primaryContactEmail: 'tobias.pike@example.com',
    });

    const ids = rankCardsForStudent(anyStudent, [stranger]).map(
      (m) => m.card.cardId
    );
    expect(ids).toEqual([]);
  });
});

describe('signals', () => {
  it('ranks an email match above a name match', () => {
    const s = student({
      name: 'Jane Roe',
      primaryContactName: 'Jane Roe',
      primaryContactEmail: 'jane@example.com',
    });
    const byName = card({ cardId: 'by-name', customerGivenName: 'Jane', customerFamilyName: 'Roe' });
    const byEmail = card({ cardId: 'by-email', customerEmail: 'jane@example.com' });

    expect(rankCardsForStudent(s, [byName, byEmail])[0].card.cardId).toBe('by-email');
  });

  it('matches a phone written in a different format', () => {
    const s = student({
      name: 'Nobody Match',
      primaryContactName: 'Nobody Match',
      primaryContactEmail: 'x@example.com',
      primaryContactPhone: '555-555-0142',
    });

    const [best] = rankCardsForStudent(s, [
      card({ cardId: 'phone', customerPhone: '+1 (555) 555-0142' }),
    ]);
    expect(best.reasons[0]).toMatch(/phone/i);
  });

  it('matches a secondary contact email too', () => {
    const s = student({
      primaryContactEmail: 'parent1@example.com',
      secondaryContactEmail: 'parent2@example.com',
    });

    expect(
      rankCardsForStudent(s, [card({ customerEmail: 'PARENT2@Example.com' })])
    ).toHaveLength(1);
  });

  it('ignores a nickname in quotes when comparing names', () => {
    const s = student({
      name: '"Pip" (Rosalind) Vance',
      isAdultStudent: false,
      primaryContactName: 'Rosalind Maple',
      primaryContactEmail: 'none@example.com',
    });

    const [best] = rankCardsForStudent(s, [
      card({ customerGivenName: 'Rosalind', customerFamilyName: 'Maple' }),
    ]);
    expect(best.reasons[0]).toMatch(/cardholder name matches/i);
  });

  it('offers a shared surname for a child, but not for an adult', () => {
    const asChild = student({
      name: 'Devin Marlowe',
      isAdultStudent: false,
      primaryContactName: 'Someone Else',
      primaryContactEmail: 'nomatch@example.com',
    });
    const asAdult = { ...asChild, isAdultStudent: true };

    expect(rankCardsForStudent(asChild, [sasha])).toHaveLength(1);
    expect(rankCardsForStudent(asChild, [sasha])[0].strength).toBe('possible');
    // An adult sharing a surname with an unrelated customer is a coincidence.
    expect(rankCardsForStudent(asAdult, [sasha])).toEqual([]);
  });
});

describe('cards that cannot be charged', () => {
  it('never offers a disabled card', () => {
    const s = student({ primaryContactEmail: 'delphine.cray@example.com' });
    expect(rankCardsForStudent(s, [{ ...delphine, enabled: false }])).toEqual([]);
  });

  it('knows when a card has expired', () => {
    // Delphine's real card expires 12/2026 — it is valid through December and
    // dead on the 1st of January.
    expect(isCardExpired(delphine, new Date('2026-12-31T23:00:00Z'))).toBe(false);
    expect(isCardExpired(delphine, new Date('2027-01-01T00:00:00Z'))).toBe(true);
  });

  it('flags a card expiring soon, so it is replaced before a charge fails', () => {
    expect(isCardExpiringSoon(delphine, 60, new Date('2026-11-15T00:00:00Z'))).toBe(true);
    expect(isCardExpiringSoon(delphine, 60, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    // Already dead is not "expiring soon" — it is a different problem.
    expect(isCardExpiringSoon(delphine, 60, new Date('2027-02-01T00:00:00Z'))).toBe(false);
  });

  it('treats a card with no expiry as neither expired nor expiring', () => {
    const noExpiry = card({ expMonth: undefined, expYear: undefined });
    expect(isCardExpired(noExpiry)).toBe(false);
    expect(isCardExpiringSoon(noExpiry)).toBe(false);
  });
});
