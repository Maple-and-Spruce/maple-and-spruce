/**
 * The roster builder decides which names the PII guard will look for. Too few
 * and a leak walks through; too many and the guard fires on every fixture and
 * gets switched off.
 */
import { describe, it, expect } from 'vitest';
import {
  camelJoin,
  collectFromDoc,
  renderRoster,
  splitPeople,
  wordsIn,
  type Roster,
} from './generate-customer-roster';

const empty = (): Roster => ({ fullNames: new Set(), tokens: new Set(), emails: new Set() });

describe('reading people out of a document', () => {
  it('takes a student and their contact, but not the class they take', () => {
    const r = empty();
    collectFromDoc(
      {
        name: 'Juniper Quill',
        primaryContactName: 'Rosalind Quill',
        primaryContactEmail: 'rq@fastmail.fm',
        className: 'Beginning Fiddle',
      },
      r
    );
    expect([...r.fullNames]).toEqual(['Juniper Quill', 'Rosalind Quill']);
    expect([...r.emails]).toEqual(['rq@fastmail.fm']);
  });

  it('reaches into nested attendees and queued mail', () => {
    const r = empty();
    collectFromDoc(
      {
        additionalAttendees: [{ name: 'Otto Fenwick' }],
        template: { name: 'registration-confirmation', data: { customerName: 'Mira Fenwick' } },
      },
      r
    );
    expect([...r.fullNames].sort()).toEqual(['Mira Fenwick', 'Otto Fenwick']);
  });

  it('joins a Music Together adult from its first/last fields', () => {
    const r = empty();
    collectFromDoc({ adultFirstName: 'Wilma', adultLastName: 'Quenby' }, r);
    expect(r.fullNames.has('Wilma Quenby')).toBe(true);
  });

  it('ignores placeholders typed into a name field', () => {
    const r = empty();
    collectFromDoc({ name: 'Student-1' }, r);
    collectFromDoc({ name: 'Test Parent' }, r);
    expect(r.tokens.size).toBe(0);
    expect(r.fullNames.size).toBe(0);
  });

  it('leaves staff out', () => {
    const r = empty();
    collectFromDoc({ customerName: 'Katie' }, r);
    expect(r.tokens.size).toBe(0);
  });

  it('keeps the studio’s own addresses out', () => {
    const r = empty();
    collectFromDoc({ email: 'hello@mapleandsprucefolkarts.com' }, r);
    expect(r.emails.size).toBe(0);
  });
});

describe('splitting one field into people', () => {
  it.each([
    ['Ann Lee & Bo Lee', ['Ann Lee', 'Bo Lee']],
    ['Ann Lee and Bo Lee', ['Ann Lee', 'Bo Lee']],
    ['Ann, Bo', ['Ann', 'Bo']],
  ])('%s', (input, expected) => {
    expect(splitPeople(input)).toEqual(expected);
  });
});

describe('what the roster file contains', () => {
  const roster: Roster = {
    fullNames: new Set(['Juniper Quill']),
    tokens: new Set(['Juniper', 'Quill', 'Sarah']),
    emails: new Set(['rq@fastmail.fm']),
  };
  const text = renderRoster(roster, new Set(['sarah']));
  const entries = text.split('\n').filter((l) => l && !l.startsWith('#'));

  it('has each full name as written and as a camelCase identifier', () => {
    expect(entries).toContain('Juniper Quill');
    expect(entries).toContain('juniperQuill');
  });

  it('has single names only when the repo does not already use them', () => {
    expect(entries).toContain('Juniper');
    expect(entries).not.toContain('Sarah');
  });

  it('has the emails', () => {
    expect(entries).toContain('rq@fastmail.fm');
  });

  it('says where it came from and not to commit it', () => {
    expect(text).toMatch(/^# Generated .* NEVER commit/);
  });
});

describe('camelJoin', () => {
  it('turns a full name into the variable a fixture would use', () => {
    expect(camelJoin('Juniper Van Quill')).toBe('juniperVanQuill');
  });
});

describe('which words the repo already uses', () => {
  it('splits identifiers the way the guard reads them', () => {
    const words = wordsIn("const catalogSyncRequest = O'Hara;");
    expect(words).toContain('catalog');
    expect(words).toContain('sync');
    expect(words).toContain('request');
    expect(words).toContain("o'hara");
  });
});
