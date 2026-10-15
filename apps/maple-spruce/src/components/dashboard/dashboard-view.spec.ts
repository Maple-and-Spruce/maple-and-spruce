import { describe, it, expect } from 'vitest';
import {
  agendaFooterText,
  buildAgenda,
  buildClassesThisWeek,
  buildRecentRegistrations,
  combinedStatus,
  formatClockShort,
  formatLongDate,
  formatMoney,
  registrationCountsByClass,
  relativeDayLabel,
  relativeTimeAgo,
  todayCounts,
  todaySummaryText,
} from './dashboard-view';
import {
  FIXTURE_NOW,
  fixtureClasses,
  fixtureRegistrations,
  fixtureStudioDay,
} from './dashboard-fixtures';
import type { StudioDayLesson } from '@maple/ts/firebase/api-types';

const NOW = FIXTURE_NOW;
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute);

describe('formatting', () => {
  it('formats the header date', () => {
    expect(formatLongDate(NOW)).toBe('Wednesday, October 14');
  });

  it('formats a short clock for the NOW line', () => {
    expect(formatClockShort(NOW)).toBe('3:10');
  });

  it('formats money with and without cents', () => {
    expect(formatMoney(9500)).toBe('$95');
    expect(formatMoney(4250)).toBe('$42.50');
    expect(formatMoney(123400)).toBe('$1,234');
  });

  it('labels a session day relative to now', () => {
    expect(relativeDayLabel(local(14, 18), NOW)).toBe('Tonight');
    expect(relativeDayLabel(local(14, 10), NOW)).toBe('Today');
    expect(relativeDayLabel(local(15, 18), NOW)).toBe('Thu, Oct 15');
  });

  it('labels how long ago something happened', () => {
    expect(relativeTimeAgo(local(14, 15, 9), NOW)).toBe('1m ago');
    expect(relativeTimeAgo(new Date(NOW.getTime() - 20_000), NOW)).toBe('Just now');
    expect(relativeTimeAgo(local(14, 14, 5), NOW)).toBe('1h ago');
    expect(relativeTimeAgo(local(13, 20), NOW)).toBe('Yesterday');
    expect(relativeTimeAgo(local(12, 11), NOW)).toBe('Mon');
  });
});

describe('combinedStatus', () => {
  it('reports the first error', () => {
    expect(
      combinedStatus([
        { status: 'success', data: 1 },
        { status: 'error', error: 'nope' },
        { status: 'loading' },
      ]),
    ).toEqual({ status: 'error', error: 'nope' });
  });

  it('is loading while anything is idle or loading', () => {
    expect(
      combinedStatus([{ status: 'success', data: 1 }, { status: 'idle' }]),
    ).toEqual({ status: 'loading' });
  });

  it('succeeds when everything has loaded', () => {
    expect(combinedStatus([{ status: 'success', data: 1 }])).toEqual({
      status: 'success',
      data: true,
    });
  });
});

describe('registrationCountsByClass', () => {
  it('sums the quantity of confirmed and pending registrations', () => {
    const counts = registrationCountsByClass(fixtureRegistrations);
    expect(counts.get('cls-wheel')).toBe(5);
    expect(counts.get('cls-weave')).toBe(1);
    expect(counts.get('cls-spoon')).toBe(4);
  });
});

describe('buildAgenda', () => {
  const view = buildAgenda(fixtureStudioDay, fixtureClasses, fixtureRegistrations, NOW);

  it('drops what already ended and caps what is left', () => {
    expect(view.items.map((i) => i.id)).toEqual([
      'lesson-les-3',
      'lesson-les-4',
      'lesson-les-5',
      'lesson-les-6',
    ]);
    expect(view.doneCount).toBe(2);
    expect(view.laterCount).toBe(1);
    expect(view.totalCount).toBe(7);
    expect(agendaFooterText(view)).toBe('2 done · 1 later');
  });

  it('puts NOW after the lesson in progress', () => {
    expect(view.nowIndex).toBe(1);
  });

  it('titles a lesson with the instrument and details its teacher', () => {
    const [inProgress, online] = view.items;
    expect(inProgress.title).toBe('Milo Fairbanks · Fiddle');
    expect(inProgress.detail).toBe('with Ben');
    expect(online.detail).toBe('with Ada · Online');
    expect(view.items[2].title).toBe('Quinn Larkspur');
  });

  it('labels each payment state', () => {
    const chips = view.items.map((i) => i.chip);
    expect(chips).toEqual([
      { label: 'Charges Fri', tone: 'pending' },
      { label: 'Charge failed', tone: 'failed' },
      { label: 'Waived', tone: 'neutral' },
      { label: 'Not billed', tone: 'neutral' },
    ]);
    const paid = buildAgenda(
      fixtureStudioDay.slice(0, 1),
      [],
      [],
      local(14, 12),
    );
    expect(paid.items[0].chip).toEqual({ label: 'Paid', tone: 'paid' });
  });

  it('labels an invoice without a due date, and a charge due today', () => {
    const base = fixtureStudioDay[5];
    const entries: StudioDayLesson[] = [
      { ...base, payment: { state: 'scheduled' } },
      {
        ...base,
        lesson: { ...base.lesson, id: 'les-x' },
        payment: { state: 'scheduled', dueAt: local(14, 20).toISOString() },
      },
    ];
    const v = buildAgenda(entries, [], [], NOW);
    expect(v.items.map((i) => i.chip.label)).toEqual(['Invoiced', 'Charges today']);
  });

  it('merges class sessions in time order', () => {
    const v = buildAgenda(fixtureStudioDay, fixtureClasses, fixtureRegistrations, local(14, 17));
    const cls = v.items.find((i) => i.kind === 'class');
    expect(cls).toMatchObject({
      title: 'Wheel Throwing Basics',
      detail: '5 of 8 registered',
      chip: { label: '5/8', tone: 'class' },
    });
    expect(v.items.map((i) => i.kind)).toEqual(['lesson', 'class']);
  });

  it('shows classes only when the viewer does not see lessons', () => {
    const v = buildAgenda(null, fixtureClasses, fixtureRegistrations, NOW);
    expect(v.items.map((i) => i.kind)).toEqual(['class']);
    expect(v.nowIndex).toBe(0);
    expect(agendaFooterText(v)).toBe('');
  });

  it('skips cancelled lessons and unpublished classes', () => {
    const cancelled: StudioDayLesson = {
      ...fixtureStudioDay[5],
      lesson: { ...fixtureStudioDay[5].lesson, status: 'cancelled' },
    };
    const v = buildAgenda([cancelled], [fixtureClasses[3]], [], local(14, 8));
    expect(v.totalCount).toBe(0);
  });

  it('places NOW last once everything left has started', () => {
    const v = buildAgenda(fixtureStudioDay.slice(2, 3), [], [], local(14, 15, 20));
    expect(v.nowIndex).toBe(1);
  });

  it('reads ISO strings where the wire left them', () => {
    const wire = {
      ...fixtureStudioDay[5],
      lesson: {
        ...fixtureStudioDay[5].lesson,
        scheduledAt: local(14, 17, 30).toISOString() as unknown as Date,
      },
    };
    expect(buildAgenda([wire], [], [], NOW).items).toHaveLength(1);
  });
});

describe('header summary', () => {
  it('counts today across lessons and classes', () => {
    const counts = todayCounts(fixtureStudioDay, fixtureClasses, NOW);
    expect(counts).toEqual({ lessons: 6, classes: 1 });
    expect(todaySummaryText(counts.lessons, counts.classes)).toBe(
      '6 lessons · 1 class today',
    );
  });

  it('leaves lessons out for a viewer who does not see them', () => {
    const counts = todayCounts(null, fixtureClasses, NOW);
    expect(counts.lessons).toBeNull();
    expect(todaySummaryText(counts.lessons, 2)).toBe('2 classes today');
    expect(todaySummaryText(1, 0)).toBe('1 lesson today');
    expect(todaySummaryText(0, 0)).toBe('Nothing scheduled today');
  });
});

describe('buildRecentRegistrations', () => {
  const view = buildRecentRegistrations(fixtureRegistrations, fixtureClasses, NOW);

  it('totals confirmed and pending registrations from the last 7 days', () => {
    expect(view.weekCount).toBe(7);
    expect(view.weekBookedCents).toBe(61500);
  });

  it('lists the five most recent, newest first', () => {
    expect(view.rows.map((r) => r.name)).toEqual([
      'Avery Holloway',
      'Jun Castellano',
      'Priya Wexford',
      'Dmitri Oakley',
      'Sage Whitcombe',
    ]);
  });

  it('marks the last 24 hours as new and dates each row', () => {
    expect(view.rows.map((r) => r.isNew)).toEqual([true, true, true, false, false]);
    expect(view.rows[0]).toMatchObject({
      detail: 'Wheel Throwing Basics · Tonight',
      amount: '$95',
      when: '1h ago',
    });
    expect(view.rows[1].detail).toBe(
      'Beginner Weaving on a Rigid Heddle Loom · Thu, Oct 15',
    );
    expect(view.rows[2].when).toBe('Yesterday');
    expect(view.rows[3].when).toBe('Mon');
  });

  it('copes with a registration for an unknown class', () => {
    const v = buildRecentRegistrations(fixtureRegistrations.slice(0, 1), [], NOW);
    expect(v.rows[0].detail).toBe('Unknown class');
  });
});

describe('buildClassesThisWeek', () => {
  const view = buildClassesThisWeek(fixtureClasses, fixtureRegistrations, NOW);

  it('keeps published classes with a session in the next 7 days, soonest first', () => {
    expect(view.rows.map((r) => r.id)).toEqual(['cls-wheel', 'cls-weave', 'cls-spoon']);
  });

  it('reports fill and flags under-filled classes', () => {
    expect(view.rows[0]).toMatchObject({ filled: 5, capacity: 8, low: false });
    expect(view.rows[1]).toMatchObject({ filled: 1, capacity: 10, low: true });
    expect(view.rows[1].fillRatio).toBeCloseTo(0.1);
    expect(view.openSeats).toBe(3 + 9 + 2);
  });

  it('dates each class relative to now', () => {
    expect(view.rows[0].detail).toBe('Tonight · 6:00 PM · $95');
    expect(view.rows[1].detail).toBe('Thu, Oct 15 · 6:00 PM · $40');
  });

  it('keeps a class that is still running', () => {
    const v = buildClassesThisWeek(fixtureClasses, [], local(14, 19));
    expect(v.rows[0].id).toBe('cls-wheel');
    expect(v.rows[0].fillRatio).toBe(0);
  });
});
