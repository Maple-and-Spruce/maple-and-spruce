/**
 * Turning a lesson inquiry into a student record (#819).
 *
 * The `/leads` queue could say who asked and whether anyone answered, but the
 * moment a family said yes, whoever was working the queue retyped a name, an
 * email and a phone number that were already on the screen — into a different
 * page — and then came back to link the two by hand. The inquiry knew
 * everything the student form was asking for.
 *
 * This module is the seam, and it is deliberately pure: no React, no Firestore.
 * Both directions use it — `/leads` starting from one inquiry, and `/students`
 * offering the open inquiries as a starting point — so the two entry points
 * cannot drift into disagreeing about what an inquiry means.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It never invents a person's name. A form answered by a parent gives us the
 * *parent's* name and, on the general music form, nothing at all about the
 * child. Guessing "Conor Haggerty" from "Lace Haggerty" would be a plausible
 * surname and a fabricated human; the draft leaves the student name blank and
 * lets the person who read the email type it. Everything here is a draft for a
 * form a human still reviews, never a record written behind their back.
 */
import type { CreateStudentInput, Instrument } from './student';
import type { LessonInquiry } from './lesson-inquiry';

/**
 * Instrument from the family's own words.
 *
 * Ordered, and the order carries meaning: "Old-Time Fiddle" and "fiddle/violin"
 * both have to land on `fiddle`, so fiddle is tested before violin. Matching is
 * on whole words, so "viola" never swallows "violin".
 *
 * Anything unrecognised becomes `other` rather than a wrong guess, and the
 * original wording is preserved in the draft's notes so nothing is lost.
 */
const INSTRUMENT_PATTERNS: [RegExp, Instrument][] = [
  [/\bfiddle\b/, 'fiddle'],
  [/\bviolin\b/, 'violin'],
  [/\bviola\b/, 'viola'],
  [/\bcello\b/, 'cello'],
  [/\b(double\s+)?bass\b/, 'bass'],
  [/\bguitar\b/, 'guitar'],
  [/\b(ukulele|uke)\b/, 'ukulele'],
  [/\bmandolin\b/, 'mandolin'],
  [/\bbanjo\b/, 'banjo'],
  [/\bharp\b/, 'harp'],
  [/\b(piano|keyboard)\b/, 'piano'],
  [/\b(voice|vocals?|singing)\b/, 'voice'],
  [/\bflute\b/, 'flute'],
];

export function instrumentFromInterest(
  interest: string | undefined
): Instrument | undefined {
  if (!interest) return undefined;
  const normalized = interest.toLowerCase();
  for (const [pattern, instrument] of INSTRUMENT_PATTERNS) {
    if (pattern.test(normalized)) return instrument;
  }
  return 'other';
}

/**
 * Is the person who filled the form the student themselves?
 *
 * `studentIs` is the honest answer and comes straight from the form. The
 * fallbacks below only run when a form did not ask: an explicit student age
 * decides it, and a separately-asked student first name means the form
 * distinguished the two people, so the respondent is the parent.
 *
 * Returns `undefined` when nothing in the inquiry settles it — the caller
 * leaves the toggle at its default and the human answers it.
 */
export function inferAdultStudent(
  inquiry: Pick<LessonInquiry, 'studentIs' | 'studentAge' | 'studentFirstName'>
): boolean | undefined {
  if (inquiry.studentIs === 'self') return true;
  if (inquiry.studentIs === 'child') return false;
  if (typeof inquiry.studentAge === 'number') return inquiry.studentAge >= 18;
  if (inquiry.studentFirstName) return false;
  return undefined;
}

/**
 * The studio's timezone, which is the only one this date can honestly be in.
 *
 * `submittedAt` is an instant; the *day* it happened on is a question you can
 * only answer relative to somewhere. Lace's inquiry is 2026-08-26T03:42:50Z —
 * that is the evening of Aug 25 in Morgantown, and Aug 25 is what `/leads`
 * shows, so a note reading "submitted Aug 26" would contradict the row it was
 * created from.
 *
 * Naming the zone also makes the function deterministic. The first version used
 * `getMonth()`/`getDate()`, which is the *runtime's* zone: correct on a laptop
 * in ET, off by a day in CI, and off by a day on any server not in Eastern.
 */
const STUDIO_TIMEZONE = 'America/New_York';

/**
 * Fixed locale and fixed timezone, so the seeded note reads identically on a
 * laptop, in CI, and in us-east4.
 */
const NOTE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: STUDIO_TIMEZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(date: Date): string {
  return NOTE_DATE_FORMAT.format(date);
}

/**
 * The provenance note seeded onto a student created from an inquiry.
 *
 * Worth writing down because it is the only place the *why* survives: which
 * form, when, in the family's own words. It also carries the answers the
 * student record has no field for (availability, the free-text message, and an
 * instrument we could not map), which would otherwise be silently dropped the
 * moment the inquiry stopped being the thing on screen.
 */
export function inquiryProvenanceNote(inquiry: LessonInquiry): string {
  const lines = [
    `From the ${inquiry.formName} form, submitted ${formatDate(
      inquiry.submittedAt
    )}.`,
  ];

  if (inquiry.interest && instrumentFromInterest(inquiry.interest) === 'other') {
    lines.push(`Asked about: ${inquiry.interest}.`);
  }
  if (inquiry.studentAge != null) {
    lines.push(`Student age at inquiry: ${inquiry.studentAge}.`);
  }
  if (inquiry.availability.length > 0) {
    lines.push(`Availability given: ${inquiry.availability.join(', ')}.`);
  }
  if (inquiry.hopeScholarship === 'unsure') {
    lines.push('Unsure about the WV Hope Scholarship, worth confirming.');
  }
  if (inquiry.message) {
    lines.push(`They wrote: "${inquiry.message}"`);
  }

  return lines.join(' ');
}

/**
 * A student draft from an inquiry, for a form a human is about to review.
 *
 * Partial on purpose. `primaryTeacherId` and `registeredLessonLength` are
 * decisions nobody can read off a form — who teaches this instrument and how
 * long the lesson is are Katie's calls — so they are left unset rather than
 * defaulted into something that looks deliberate and is not.
 */
export function studentDraftFromInquiry(
  inquiry: LessonInquiry
): Partial<CreateStudentInput> {
  const isAdult = inferAdultStudent(inquiry);

  return {
    // An adult learner is their own student, so their name is the student name.
    // A child's name is only ours to fill when the form actually asked for it.
    name: isAdult ? inquiry.contactName : inquiry.studentFirstName ?? '',
    instrument: instrumentFromInterest(inquiry.interest),
    isAdultStudent: isAdult,
    isHopeScholarship: inquiry.hopeScholarship === 'yes',
    primaryContactName: inquiry.contactName,
    primaryContactEmail: inquiry.email,
    primaryContactPhone: inquiry.phone,
    notes: inquiryProvenanceNote(inquiry),
    status: 'active',
  };
}

/**
 * Does this inquiry look like it belongs to a student we already have?
 *
 * Used to keep the `/students` suggestion list honest: an inquiry whose email
 * already appears on a student is almost always the same family coming back
 * (a second child, a second instrument), and offering it as a *new* student is
 * how you end up with two records for one household. Matching on email rather
 * than name because an email is what people reuse and what we can compare
 * without normalising human names.
 */
export function inquiryMatchesContact(
  inquiry: Pick<LessonInquiry, 'email'>,
  contactEmails: Set<string>
): boolean {
  return contactEmails.has(inquiry.email.trim().toLowerCase());
}
