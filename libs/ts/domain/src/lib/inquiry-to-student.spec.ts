import { describe, it, expect } from 'vitest';
import {
  inferAdultStudent,
  inquiryProvenanceNote,
  instrumentFromInterest,
  studentDraftFromInquiry,
} from './inquiry-to-student';
import type { LessonInquiry } from './lesson-inquiry';

/** A real shape from `dWPQOr`, the general music form. */
function inquiry(overrides: Partial<LessonInquiry> = {}): LessonInquiry {
  return {
    id: 'sub-1',
    formId: 'dWPQOr',
    formName: 'Music lesson inquiry',
    submittedAt: new Date('2026-08-26T03:42:50.000Z'),
    contactName: 'Lace Haggerty',
    email: 'lace@example.com',
    phone: '+15550000001',
    interest: 'Old-Time Fiddle',
    availability: [],
    status: 'new',
    attribution: {},
    createdAt: new Date('2026-09-04T19:45:01.000Z'),
    updatedAt: new Date('2026-09-04T19:45:01.000Z'),
    ...overrides,
  };
}

describe('instrumentFromInterest', () => {
  it('THE POINT: reads the studio’s own wording, not a strict enum', () => {
    // "Old-Time Fiddle" is what the form offers; "fiddle" is what we store.
    expect(instrumentFromInterest('Old-Time Fiddle')).toBe('fiddle');
    expect(instrumentFromInterest('Old-Time Guitar')).toBe('guitar');
    expect(instrumentFromInterest('Suzuki violin, with Katie')).toBe('violin');
  });

  it('prefers fiddle over violin when a family says both', () => {
    // An old-time studio: someone writing "violin/fiddle" wants the fiddle
    // lesson. Getting this backwards puts them in the wrong pedagogy.
    expect(instrumentFromInterest('violin/fiddle')).toBe('fiddle');
    expect(instrumentFromInterest('fiddle (violin)')).toBe('fiddle');
  });

  it('does not let viola swallow violin, or bass swallow bassoon', () => {
    expect(instrumentFromInterest('Viola')).toBe('viola');
    expect(instrumentFromInterest('Violin')).toBe('violin');
    expect(instrumentFromInterest('Double Bass')).toBe('bass');
  });

  it('maps harp, which the studio actually gets asked for', () => {
    // Two of the first fourteen inquiries were harp. Before #819 the enum had
    // no harp at all and both would have landed on "Other".
    expect(instrumentFromInterest('Harp')).toBe('harp');
  });

  it('falls back to other rather than guessing, and stays undefined when unasked', () => {
    expect(instrumentFromInterest('Hurdy-gurdy')).toBe('other');
    expect(instrumentFromInterest(undefined)).toBeUndefined();
  });
});

describe('inferAdultStudent', () => {
  it('THE POINT: the form’s own answer decides who the student is', () => {
    expect(inferAdultStudent({ studentIs: 'self' })).toBe(true);
    expect(inferAdultStudent({ studentIs: 'child' })).toBe(false);
  });

  it('falls back to age, then to a separately-asked student name', () => {
    expect(inferAdultStudent({ studentAge: 34 })).toBe(true);
    expect(inferAdultStudent({ studentAge: 11 })).toBe(false);
    // A form that asks for the student's first name separately is a form that
    // distinguishes the two people, so the respondent is the parent.
    expect(inferAdultStudent({ studentFirstName: 'Conor' })).toBe(false);
  });

  it('says undefined rather than guessing when nothing settles it', () => {
    // The caller leaves the toggle at its default and a human answers it.
    // A confident wrong guess here files a child as an adult student.
    expect(inferAdultStudent({})).toBeUndefined();
  });
});

describe('studentDraftFromInquiry', () => {
  it('THE POINT: carries over everything the form already asked', () => {
    const draft = studentDraftFromInquiry(
      inquiry({ studentIs: 'self', contactName: 'Sarah Flowers' })
    );

    expect(draft).toMatchObject({
      name: 'Sarah Flowers',
      instrument: 'fiddle',
      isAdultStudent: true,
      primaryContactName: 'Sarah Flowers',
      primaryContactEmail: 'lace@example.com',
      primaryContactPhone: '+15550000001',
      status: 'active',
    });
  });

  it('NEVER invents a child’s name from the parent’s', () => {
    // The general form gives us the parent and nothing about the child. A
    // surname is a plausible guess and a fabricated human; blank makes the
    // person who read the email type the name they actually know.
    const draft = studentDraftFromInquiry(inquiry({ studentIs: 'child' }));

    expect(draft.name).toBe('');
    expect(draft.isAdultStudent).toBe(false);
    expect(draft.primaryContactName).toBe('Lace Haggerty');
  });

  it('uses the student first name when the form did ask for one', () => {
    const draft = studentDraftFromInquiry(
      inquiry({ studentIs: 'child', studentFirstName: 'Conor' })
    );

    expect(draft.name).toBe('Conor');
  });

  it('leaves teacher and lesson length unset, because nobody can read those off a form', () => {
    // Defaulting them would look like a decision Katie made. She has to pick.
    const draft = studentDraftFromInquiry(inquiry());

    expect(draft.primaryTeacherId).toBeUndefined();
    expect(draft.registeredLessonLength).toBeUndefined();
  });

  it('carries Hope Scholarship across only on a definite yes', () => {
    expect(
      studentDraftFromInquiry(inquiry({ hopeScholarship: 'yes' }))
        .isHopeScholarship
    ).toBe(true);
    // "unsure" is a real, common answer and is not a yes. It goes in the notes.
    expect(
      studentDraftFromInquiry(inquiry({ hopeScholarship: 'unsure' }))
        .isHopeScholarship
    ).toBe(false);
  });
});

describe('inquiryProvenanceNote', () => {
  it('records which form and when, so the why survives the hand-off', () => {
    expect(inquiryProvenanceNote(inquiry())).toContain(
      'From the Music lesson inquiry form, submitted Aug 25, 2026.'
    );
  });

  it('THE POINT: dates the note in the studio’s day, not the server’s', () => {
    // 2026-08-26T03:42:50Z is the evening of Aug 25 in Morgantown. A note
    // saying "Aug 26" would contradict the /leads row it was created from.
    //
    // The first version read getMonth()/getDate(), i.e. the runtime's zone:
    // right on an ET laptop, a day late in CI, and a day late in us-east4.
    // Asserting both zones is what makes this test able to fail anywhere.
    const evening = inquiry({
      submittedAt: new Date('2026-08-26T03:42:50.000Z'),
    });
    expect(inquiryProvenanceNote(evening)).toContain('Aug 25, 2026');

    // ...and the same instant must not drift the other way for a morning
    // submission, where UTC and ET agree on the day.
    const morning = inquiry({
      submittedAt: new Date('2026-08-26T15:42:50.000Z'),
    });
    expect(inquiryProvenanceNote(morning)).toContain('Aug 26, 2026');
  });

  it('THE POINT: keeps the answers the student record has no field for', () => {
    // Availability, the free-text message and an unmappable instrument are all
    // dropped the moment the inquiry stops being the thing on screen, unless
    // something carries them across.
    const note = inquiryProvenanceNote(
      inquiry({
        interest: 'Hurdy-gurdy',
        availability: ['Weekday evenings', 'Saturday morning'],
        hopeScholarship: 'unsure',
        message: 'He has been asking to learn for years.',
      })
    );

    expect(note).toContain('Asked about: Hurdy-gurdy.');
    expect(note).toContain('Weekday evenings, Saturday morning');
    expect(note).toContain('Hope Scholarship');
    expect(note).toContain('He has been asking to learn for years.');
  });

  it('does not repeat an instrument that mapped cleanly', () => {
    // "Asked about: Old-Time Fiddle" next to an Instrument field reading
    // "Fiddle" is noise.
    expect(inquiryProvenanceNote(inquiry())).not.toContain('Asked about');
  });
});
