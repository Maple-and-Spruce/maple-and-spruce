/**
 * The instruments the studio teaches, as an app setting (#161).
 *
 * The list used to be a hardcoded union of fourteen, of which the studio
 * offers a few. It now lives in `appConfig/instruments`, edited on Settings,
 * and drives the student form, the instructor rate editor and the labels.
 *
 * A key is stable once a student has it: retiring an instrument removes it
 * from the choices, never from the students who learn it. Their records keep
 * the key, and `instrumentLabel` still names it.
 */
import type { Instrument } from './student';

export interface InstrumentOption {
  /** Stored on students and instructor rates. Lowercase, hyphenated. */
  key: Instrument;
  label: string;
}

export interface InstrumentsConfig {
  instruments: InstrumentOption[];
  updatedAt?: Date;
  updatedByUid?: string;
}

/** What the studio teaches until someone edits the list. */
export const DEFAULT_INSTRUMENT_OPTIONS: InstrumentOption[] = [
  { key: 'violin', label: 'Violin' },
  { key: 'fiddle', label: 'Fiddle' },
  { key: 'guitar', label: 'Guitar' },
  { key: 'harp', label: 'Harp' },
];

/**
 * Names for keys recorded before the list was a setting, so a student on a
 * retired instrument still reads properly.
 */
const KNOWN_INSTRUMENT_LABELS: Record<string, string> = {
  piano: 'Piano',
  guitar: 'Guitar',
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  bass: 'Bass',
  voice: 'Voice',
  ukulele: 'Ukulele',
  mandolin: 'Mandolin',
  banjo: 'Banjo',
  fiddle: 'Fiddle',
  harp: 'Harp',
  flute: 'Flute',
  other: 'Other',
};

/** "mountain dulcimer" → "mountain-dulcimer". */
export function instrumentKeyFromLabel(label: string): Instrument {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * What to call an instrument: the configured label, else the name it had
 * before the list was a setting, else the key made readable.
 */
export function instrumentLabel(
  key: Instrument,
  options: InstrumentOption[] = []
): string {
  const configured = options.find((o) => o.key === key);
  if (configured) return configured.label;
  if (KNOWN_INSTRUMENT_LABELS[key]) return KNOWN_INSTRUMENT_LABELS[key];
  const words = key.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The choices for a form: the configured list, plus the record's current
 * instrument if it is no longer offered — so editing a student on a retired
 * instrument neither loses it nor silently changes it.
 */
export function instrumentChoices(
  options: InstrumentOption[],
  current?: Instrument
): InstrumentOption[] {
  if (!current || options.some((o) => o.key === current)) return options;
  return [...options, { key: current, label: instrumentLabel(current, options) }];
}

/**
 * Is this instrument one the record may be saved with? Offered now, or what
 * the record already had.
 */
export function isAllowedInstrument(
  key: Instrument,
  options: InstrumentOption[],
  existing?: Instrument
): boolean {
  return key === existing || options.some((o) => o.key === key);
}

/**
 * Why a list cannot be saved, or null when it can.
 *
 * Keys and labels must be present and unique; the list must not be empty,
 * since every student needs an instrument.
 */
export function instrumentListProblem(options: InstrumentOption[]): string | null {
  if (options.length === 0) return 'Keep at least one instrument.';
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const option of options) {
    const label = option.label.trim();
    if (!label) return 'Every instrument needs a name.';
    if (!option.key || option.key !== instrumentKeyFromLabel(option.key)) {
      return `"${label}" has an invalid key.`;
    }
    if (keys.has(option.key)) return `"${label}" is listed twice.`;
    if (labels.has(label.toLowerCase())) return `"${label}" is listed twice.`;
    keys.add(option.key);
    labels.add(label.toLowerCase());
  }
  return null;
}

/**
 * Instruments an instructor's rates name that the studio does not offer —
 * other than ones the instructor already had rates for, which may stay.
 */
export function unofferedRateInstruments(
  rates: Record<string, unknown> | undefined,
  options: InstrumentOption[],
  existingRates: Record<string, unknown> = {}
): Instrument[] {
  return Object.keys(rates ?? {}).filter(
    (key) => !(key in existingRates) && !options.some((o) => o.key === key)
  );
}
