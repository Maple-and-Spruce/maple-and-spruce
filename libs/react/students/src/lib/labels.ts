import type { Instrument, LessonLength } from '@maple/ts/domain';

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
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
  flute: 'Flute',
  other: 'Other',
};

export const LESSON_LENGTH_LABELS: Record<LessonLength, string> = {
  '30-min-initial': '30 min (initial)',
  '30-min-full': '30 min (full)',
  '45-min': '45 min',
  '60-min': '60 min',
};
