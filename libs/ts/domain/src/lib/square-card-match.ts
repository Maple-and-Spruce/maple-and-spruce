/**
 * Matching a card already on file in Square to a student (#798).
 *
 * Katie saves cards **in the Square app, in person** — that is the starting
 * point, not a web form we get to design. So the portal's job is to find the
 * card she already saved and attach it to the right student, not to collect it
 * again.
 *
 * WHAT THE REAL DATA LOOKS LIKE
 * -----------------------------
 * Checked against the live account before writing this, because the shape is
 * not obvious:
 *
 *   - **An adult student's card is in their own name.** Cardholder, customer
 *     record and student all agree.
 *   - **A child's card is in a parent's name.** Nothing about the cardholder
 *     matches the student — not the given name, not the surname.
 *
 * The one field that bridges both is **email**: a child's
 * `primaryContactEmail` is the parent's, and it is exactly the email on that
 * parent's Square customer record. All three real cards match on email alone.
 *
 * So email is the primary signal, phone is the reliable second, and name is a
 * fallback for records typed without either. Nothing is ever linked
 * automatically — a wrong link charges the wrong family, so a person confirms.
 */
import type { Student } from './student';

/** A card on file in Square, with the customer it belongs to. */
export interface SquareCardOnFile {
  cardId: string;
  customerId: string;
  cardBrand?: string;
  last4?: string;
  cardholderName?: string;
  expMonth?: number;
  expYear?: number;
  /** Square's own flag; a disabled card cannot be charged. */
  enabled: boolean;
  customerEmail?: string;
  customerPhone?: string;
  customerGivenName?: string;
  customerFamilyName?: string;
}

export type CardMatchStrength = 'exact' | 'strong' | 'possible';

export interface CardMatch {
  card: SquareCardOnFile;
  strength: CardMatchStrength;
  /** Why this was suggested, in Katie's words, strongest first. */
  reasons: string[];
  score: number;
}

/** Lowercased and trimmed; enough for the exact-match comparisons here. */
function normalizeEmail(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Digits only, last 10. Portal phone data is inconsistent — "+15555550177",
 * "555-555-0142" and one malformed "168-127-09879" all appear — so compare the
 * subscriber number and ignore country-code formatting.
 */
function normalizePhone(value: string | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/** Lowercased, punctuation and nicknames-in-quotes removed. */
function normalizeName(value: string | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/["'“”]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function surnameOf(fullName: string | undefined): string {
  const parts = normalizeName(fullName).split(' ').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function customerFullName(card: SquareCardOnFile): string {
  const joined = [card.customerGivenName, card.customerFamilyName]
    .filter(Boolean)
    .join(' ');
  return normalizeName(joined || card.cardholderName);
}

/** Is this card past its expiry, as of `asOf`? */
export function isCardExpired(
  card: Pick<SquareCardOnFile, 'expMonth' | 'expYear'>,
  asOf: Date = new Date()
): boolean {
  if (!card.expMonth || !card.expYear) return false;
  const endOfMonth = new Date(Date.UTC(card.expYear, card.expMonth, 1));
  return asOf.getTime() >= endOfMonth.getTime();
}

/** Does this card expire within `days`? Worth flagging before it fails. */
export function isCardExpiringSoon(
  card: Pick<SquareCardOnFile, 'expMonth' | 'expYear'>,
  days = 60,
  asOf: Date = new Date()
): boolean {
  if (!card.expMonth || !card.expYear) return false;
  if (isCardExpired(card, asOf)) return false;
  const endOfMonth = new Date(Date.UTC(card.expYear, card.expMonth, 1));
  return endOfMonth.getTime() - asOf.getTime() <= days * 86_400_000;
}

type ContactFields = Pick<
  Student,
  | 'name'
  | 'isAdultStudent'
  | 'primaryContactName'
  | 'primaryContactEmail'
  | 'primaryContactPhone'
  | 'secondaryContactEmail'
  | 'secondaryContactPhone'
>;

/**
 * Rank the cards on file by how likely each is to be this student's.
 *
 * Returns only cards with at least one reason, best first. An empty result is
 * a real answer — a card belonging to a retail customer should match nobody
 * rather than be forced onto the nearest student.
 */
export function rankCardsForStudent(
  student: ContactFields,
  cards: SquareCardOnFile[]
): CardMatch[] {
  const emails = new Set(
    [student.primaryContactEmail, student.secondaryContactEmail]
      .map(normalizeEmail)
      .filter(Boolean)
  );
  const phones = new Set(
    [student.primaryContactPhone, student.secondaryContactPhone]
      .map(normalizePhone)
      .filter(Boolean)
  );
  const studentName = normalizeName(student.name);
  const contactName = normalizeName(student.primaryContactName);
  const studentSurname = surnameOf(student.name);

  const matches: CardMatch[] = [];

  for (const card of cards) {
    // A disabled card cannot be charged, so offering it would be a trap.
    if (!card.enabled) continue;

    const reasons: string[] = [];
    let score = 0;

    const cardEmail = normalizeEmail(card.customerEmail);
    if (cardEmail && emails.has(cardEmail)) {
      score += 100;
      reasons.push(`Same email as this student's contact (${card.customerEmail})`);
    }

    const cardName = customerFullName(card);

    // For an adult student the cardholder should be the student; for a child
    // it should be the parent. Both are worth points, but say which matched so
    // Katie can sanity-check it.
    if (cardName && cardName === studentName) {
      score += 60;
      reasons.push('Cardholder name matches the student');
    } else if (cardName && cardName === contactName) {
      score += 60;
      reasons.push("Cardholder name matches the student's contact");
    } else if (
      studentSurname &&
      surnameOf(cardName) === studentSurname &&
      !student.isAdultStudent
    ) {
      // Weak on its own, and only for children — an adult student sharing a
      // surname with an unrelated customer is a coincidence, not a lead.
      score += 25;
      reasons.push(`Same surname as ${student.name}`);
    }

    const cardPhone = normalizePhone(card.customerPhone);
    if (cardPhone && phones.has(cardPhone)) {
      score += 80;
      reasons.push(`Same phone number as this student's contact`);
    }

    if (reasons.length === 0) continue;

    matches.push({
      card,
      score,
      reasons,
      strength: score >= 100 ? 'exact' : score >= 60 ? 'strong' : 'possible',
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}
