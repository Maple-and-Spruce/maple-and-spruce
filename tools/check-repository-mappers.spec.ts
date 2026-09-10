/**
 * The guard that stops a domain field being silently dropped on read.
 *
 * These test the analyzer against fixture repositories, because the thing that
 * matters is not "does it pass on main today" — it is that it would have caught
 * the three real cases (#798 card fields, #835 onDate, #837 intervalWeeks) and
 * that it does not cry wolf on the shapes the codebase legitimately uses.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from './check-repository-mappers';

let root: string;
let dbDir: string;
let domainDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mapper-guard-'));
  dbDir = join(root, 'db');
  domainDir = join(root, 'domain');
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(domainDir, { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const domain = (name: string, src: string) =>
  writeFileSync(join(domainDir, `${name}.ts`), src);
const repo = (name: string, src: string) =>
  writeFileSync(join(dbDir, `${name}.repository.ts`), src);

const run = () => analyze(dbDir, domainDir, root);

describe('catches a dropped field', () => {
  it('reports a field the entity declares and the mapper omits', () => {
    // This is #837 exactly: intervalWeeks on the entity, absent from the mapper.
    domain(
      'schedule',
      `export interface Schedule {
        id: string;
        dayOfWeek: number;
        intervalWeeks?: number;
      }`
    );
    repo(
      'schedule',
      `function docToSchedule(doc: Snap): Schedule | undefined {
        return { id: doc.id, dayOfWeek: data.dayOfWeek };
      }`
    );

    const { gaps } = run();

    expect(gaps).toHaveLength(1);
    expect(gaps[0].entity).toBe('Schedule');
    expect(gaps[0].missing).toEqual(['intervalWeeks']);
  });

  it('reports several missing fields at once', () => {
    domain(
      'artist',
      `export interface Artist {
        id: string;
        name: string;
        payoutMethod?: string;
        payoutDetails?: string;
      }`
    );
    repo(
      'artist',
      `function docToArtist(doc: Snap): Artist | undefined {
        return { id: doc.id, name: data.name };
      }`
    );

    expect(run().gaps[0].missing).toEqual(['payoutMethod', 'payoutDetails']);
  });

  it('counts inherited fields from an extended interface', () => {
    domain(
      'base',
      `export interface Timestamped { createdAt: Date; updatedAt: Date; }
       export interface Thing extends Timestamped { id: string; label?: string; }`
    );
    repo(
      'thing',
      `function docToThing(doc: Snap): Thing | undefined {
        return { id: doc.id, label: data.label, createdAt: data.createdAt };
      }`
    );

    expect(run().gaps[0].missing).toEqual(['updatedAt']);
  });
});

describe('does not cry wolf', () => {
  it('passes a complete mapper', () => {
    domain('thing', `export interface Thing { id: string; label?: string; }`);
    repo(
      'thing',
      `function docToThing(doc: Snap): Thing | undefined {
        return { id: doc.id, label: data.label };
      }`
    );

    const { gaps, checked } = run();
    expect(gaps).toEqual([]);
    expect(checked).toBe(1);
  });

  it('skips a mapper that spreads, since it maps everything by construction', () => {
    domain('thing', `export interface Thing { id: string; a?: string; b?: string; }`);
    repo(
      'thing',
      `function docToThing(doc: Snap): Thing | undefined {
        return { id: doc.id, ...data };
      }`
    );

    const { gaps, checked } = run();
    expect(gaps).toEqual([]);
    expect(checked).toBe(0); // reported as skipped, not silently passed
  });

  it('honours an explicit exemption with a reason', () => {
    domain('thing', `export interface Thing { id: string; derived?: string; }`);
    repo(
      'thing',
      `// mapper-field-check-ignore: derived -- computed on read, never stored
       function docToThing(doc: Snap): Thing | undefined {
        return { id: doc.id };
      }`
    );

    expect(run().gaps).toEqual([]);
  });

  it('collects fields from every object literal the mapper returns', () => {
    // A mapper that branches must not look like it dropped the fields on the
    // path the analyzer happened to read second.
    domain('thing', `export interface Thing { id: string; a?: string; b?: string; }`);
    repo(
      'thing',
      `function docToThing(doc: Snap): Thing | undefined {
        if (x) return { id: doc.id, a: data.a, b: data.b };
        return { id: doc.id, a: data.a, b: data.b };
      }`
    );

    expect(run().gaps).toEqual([]);
  });

  it('ignores a nested object literal’s keys leaking into the outer check', () => {
    domain(
      'thing',
      `export interface Thing { id: string; state?: { q: number }; }`
    );
    repo(
      'thing',
      `function docToThing(doc: Snap): Thing | undefined {
        return { id: doc.id, state: { q: data.q } };
      }`
    );

    expect(run().gaps).toEqual([]);
  });
});

describe('skips what it cannot judge, rather than guessing', () => {
  it('skips a mapper whose return type is not a domain interface', () => {
    repo(
      'thing',
      `function docToThing(doc: Snap): SomethingElse | undefined {
        return { id: doc.id };
      }`
    );

    const { gaps, checked, report } = run();
    expect(gaps).toEqual([]);
    expect(checked).toBe(0);
    expect(report.join('\n')).toContain('not a domain interface');
  });

  it('skips a mapper with no return type annotation', () => {
    domain('thing', `export interface Thing { id: string; a?: string; }`);
    repo('thing', `function docToThing(doc) { return { id: doc.id }; }`);

    const { gaps, report } = run();
    expect(gaps).toEqual([]);
    expect(report.join('\n')).toContain('no named return type');
  });

  it('ignores functions that are not mappers', () => {
    domain('thing', `export interface Thing { id: string; a?: string; }`);
    repo(
      'thing',
      `function buildThing(doc: Snap): Thing | undefined {
        return { id: doc.id };
      }`
    );

    expect(run().checked).toBe(0);
  });

  it('does not scan spec files', () => {
    domain('thing', `export interface Thing { id: string; a?: string; }`);
    writeFileSync(
      join(dbDir, 'thing.repository.spec.ts'),
      `function docToThing(doc: Snap): Thing | undefined { return { id: doc.id }; }`
    );

    expect(run().checked).toBe(0);
  });
});
