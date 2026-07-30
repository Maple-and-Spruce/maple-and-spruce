import type { LessonBlock } from '@maple/ts/domain';
import { WEEKDAY_LONG } from '@maple/ts/domain';

/** Minutes-from-midnight → "3:00 PM". */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** A block as a one-line option, e.g. "Tuesdays · 3:00 PM–6:00 PM". */
export function formatBlockOption(block: LessonBlock): string {
  return `${WEEKDAY_LONG[block.dayOfWeek]}s · ${formatMinutes(
    block.startMinutes,
  )}–${formatMinutes(block.endMinutes)}`;
}
