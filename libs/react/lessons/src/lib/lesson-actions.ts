import type { Lesson } from '@maple/ts/domain';

/**
 * What can be done to one booked lesson, wherever it is shown.
 *
 * The student page lists lessons on three tabs (Next lessons, Settings,
 * Activity). Each used to offer its own subset, so Katie could move a lesson
 * on one tab and not on another. Every tab now builds its menu here, so a
 * lesson offers the same things wherever she finds it.
 *
 * A handler that is left out hides its action. That is for places that
 * cannot do it at all (a Hope student is never charged), not for trimming a
 * tab's menu.
 */
export interface LessonActionHandlers {
  /** Opens the edit dialog: date and time, teacher, length, room. */
  onMove?: (lesson: Lesson) => void;
  /** Pushes this lesson and every later one back a week, together. */
  onPushBack?: (lesson: Lesson) => void;
  onCharge?: (lesson: Lesson) => void;
  onInvoice?: (lesson: Lesson) => void;
  /** Opens the cancel dialog, which can also reschedule with a credit. */
  onCancel?: (lesson: Lesson) => void;
  /** Takes a cancelled lesson back to scheduled. */
  onRestore?: (lesson: Lesson) => void;
  /** Reschedules an already-cancelled lesson with a credit. */
  onReschedule?: (lesson: Lesson) => void;
  /** Opens the weather dialog: reschedule with a credit, or hold it online. */
  onWeather?: (lesson: Lesson) => void;
  /** Brings a lesson held online back into the room. */
  onInPerson?: (lesson: Lesson) => void;
  onDelete?: (lesson: Lesson) => void;
}

/** Facts about the lesson the menu depends on, beyond the lesson itself. */
export interface LessonActionContext {
  /** Already paid or invoiced. Only an unbilled past lesson can be settled. */
  billed: boolean;
  /** Billed through EMA, so never charged here. */
  isHope: boolean;
  /** A card is linked, so "Charge the card" can be offered. */
  hasCard: boolean;
  /**
   * A credit has already replaced this cancelled lesson. It cannot be restored
   * or credited again: that would leave the payment on the replacement.
   */
  replaced?: boolean;
  now: Date;
}

export interface LessonAction {
  text: string;
  run: () => void;
  danger?: boolean;
}

export function lessonActions(
  lesson: Lesson,
  context: LessonActionContext,
  handlers: LessonActionHandlers,
): LessonAction[] {
  const items: LessonAction[] = [];
  const add = (
    text: string,
    handler: ((lesson: Lesson) => void) | undefined,
    danger?: boolean,
  ) => {
    if (handler) items.push({ text, run: () => handler(lesson), danger });
  };

  const cancelled = lesson.status === 'cancelled';
  const past = lesson.scheduledAt.getTime() <= context.now.getTime();

  if (!cancelled) {
    add('Move…', handlers.onMove);
    // Pushing back slides every later lesson too, which is about the future.
    if (!past) add('Push back a week…', handlers.onPushBack);
  }

  // Past payments were settled outside the portal, so this is the only place
  // an unbilled past lesson can be charged for, and only when asked.
  if (!cancelled && past && !context.billed && !context.isHope) {
    if (context.hasCard) add('Charge the card', handlers.onCharge);
    add('Send an invoice', handlers.onInvoice);
  }

  if (!cancelled) {
    add('Cancel…', handlers.onCancel);
    if (lesson.virtual) add('In person', handlers.onInPerson);
    else add('Weather…', handlers.onWeather);
  } else if (!context.replaced) {
    add('Reschedule with a credit…', handlers.onReschedule);
    add('Undo cancel', handlers.onRestore);
  }

  add('Delete', handlers.onDelete, true);
  return items;
}
