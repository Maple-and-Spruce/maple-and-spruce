#!/usr/bin/env npx tsx
/**
 * Set `intervalWeeks` on existing standing arrangements from real lesson
 * history (#837).
 *
 * Katie worked around the missing cadence by hand-creating a lesson on each
 * off-week and cancelling it, so the materialiser would skip that date. This
 * reads those cancellations as the signal they are: a run of alternating
 * kept/cancelled lessons in one slot means the arrangement is biweekly.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, or it is worse than doing nothing:
 *
 *   1. **Parity.** Setting `intervalWeeks: 2` picks weeks by counting from the
 *      first occurrence on or after `startsOn`. If that lands on the *other*
 *      week, every lesson moves — and where two students alternate in one hour
 *      (Marisol and Odette share Tuesday 5pm) it puts both of them in the room
 *      together. So the proposed parity is checked against the student's real
 *      kept lessons before anything is written.
 *
 *   2. **`startsOn` is an instant, read in the shop zone.** A value stored as
 *      midnight UTC reads as the *previous* day here, which can walk the anchor
 *      back a week. That is exactly how parity flips silently.
 *
 * Dry run by default. Dev by default.
 *
 *   npx tsx tools/backfill-schedule-cadence.ts            # dev, dry run
 *   npx tsx tools/backfill-schedule-cadence.ts --prod     # prod, dry run
 *   npx tsx tools/backfill-schedule-cadence.ts --prod --execute
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  scheduleOccurrences,
  zonedDateKey,
  SCHEDULE_TIME_ZONE,
} from '@maple/ts/domain';

const isProd = process.argv.includes('--prod');
const isExecute = process.argv.includes('--execute');
/**
 * Also move `startsOn` when it would put the student on the wrong weeks.
 *
 * Separate from `--execute` on purpose. Adding a cadence field is a migration;
 * moving `startsOn` changes which weeks belong to a student, and where two of
 * them alternate in one hour that is the difference between a working schedule
 * and both families turning up at once. It should take a second, deliberate
 * decision.
 */
const isAlignParity = process.argv.includes('--align-parity');
// Default to dev, deliberately. A migration that picks its target from
// ambient credentials is one bad shell away from rewriting prod.
const projectId = isProd ? 'maple-and-spruce' : 'maple-and-spruce-dev';
const db = getFirestore(initializeApp({ projectId }));

const DAY = 86_400_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDate = (v: any): Date =>
  v?.toDate ? v.toDate() : v instanceof Date ? v : new Date(v);

const key = (d: Date) => zonedDateKey(d, SCHEDULE_TIME_ZONE);

interface LessonRow {
  studentId: string;
  at: Date;
  status: string;
}

async function main(): Promise<void> {
  console.log(`Project: ${projectId}${isExecute ? '' : '   (DRY RUN)'}\n`);

  const [schedSnap, lessonSnap, studentSnap] = await Promise.all([
    db.collection('studentLessonSchedules').get(),
    db.collection('lessons').get(),
    db.collection('students').get(),
  ]);

  const nameById = new Map(
    studentSnap.docs.map((d) => [d.id, d.data().name ?? d.id])
  );

  const lessons: LessonRow[] = lessonSnap.docs
    .map((d) => d.data())
    .filter((l) => l.studentId && l.scheduledAt)
    .map((l) => ({
      studentId: l.studentId,
      at: toDate(l.scheduledAt),
      status: l.status ?? 'scheduled',
    }));

  let changed = 0;
  let unchanged = 0;
  let blocked = 0;

  for (const doc of schedSnap.docs) {
    const s = doc.data();
    if ((s.status ?? 'active') !== 'active') continue;

    const who = nameById.get(s.studentId) ?? s.studentId;
    const slot = `${WD[s.dayOfWeek]} ${String(Math.floor(s.startMinutes / 60)).padStart(2, '0')}:${String(s.startMinutes % 60).padStart(2, '0')}`;

    // This student's lessons in this weekday slot, in date order.
    const mine = lessons
      .filter(
        (l) =>
          l.studentId === s.studentId &&
          WD.indexOf(
            new Intl.DateTimeFormat('en-US', {
              weekday: 'short',
              timeZone: SCHEDULE_TIME_ZONE,
            }).format(l.at)
          ) === s.dayOfWeek
      )
      .sort((a, b) => +a.at - +b.at);

    const kept = mine.filter((l) => l.status !== 'cancelled');
    const cancelled = mine.filter((l) => l.status === 'cancelled');

    // Gaps between KEPT lessons are the cadence signal. Cancelled placeholders
    // sit in the gaps and are what we are replacing.
    const gaps: number[] = [];
    for (let i = 1; i < kept.length; i++) {
      gaps.push(Math.round((+kept[i].at - +kept[i - 1].at) / DAY));
    }
    const fourteens = gaps.filter((g) => g >= 13 && g <= 15).length;
    const sevens = gaps.filter((g) => g >= 6 && g <= 8).length;

    const proposed = fourteens > sevens && fourteens >= 2 ? 2 : 1;
    const current = s.intervalWeeks ?? 1;

    console.log(`${who}  ${slot}  (${doc.id})`);
    console.log(
      `   kept ${kept.length}, cancelled ${cancelled.length}, gaps [${gaps.join(', ')}]  7d=${sevens} 14d=${fourteens}`
    );

    if (proposed === current) {
      console.log(`   -> already intervalWeeks=${current}, nothing to do\n`);
      unchanged++;
      continue;
    }

    // PARITY CHECK. Would intervalWeeks=proposed generate the weeks this
    // student actually has? Compare against their future kept lessons.
    // Compare over a window that actually contains the arrangement. An
    // arrangement whose startsOn is still in the future generates nothing from
    // "now", which would look like a total mismatch and hide the real answer.
    const startsOn = toDate(s.startsOn);
    const windowFrom = new Date(Math.min(Date.now(), +startsOn));
    const windowTo = new Date(+windowFrom + 20 * 7 * DAY);

    const occurrencesFor = (interval: number, from = startsOn) =>
      scheduleOccurrences(
        {
          dayOfWeek: s.dayOfWeek,
          startMinutes: s.startMinutes,
          status: 'active',
          startsOn: from,
          endsOn: s.endsOn ? toDate(s.endsOn) : undefined,
          intervalWeeks: proposed,
        },
        windowFrom,
        windowTo
      ).map(key);

    const futureKept = kept
      .filter((l) => +l.at >= +windowFrom)
      .map((l) => key(l.at));
    const generated = occurrencesFor(proposed);

    const overlap = futureKept.filter((d) => generated.includes(d));
    const missed = futureKept.filter((d) => !generated.includes(d));

    console.log(`   startsOn reads as ${key(toDate(s.startsOn))} in shop time`);
    console.log(`   would generate: ${generated.slice(0, 6).join(', ')}`);
    if (futureKept.length) {
      console.log(`   real upcoming:  ${futureKept.slice(0, 6).join(', ')}`);
    }

    if (futureKept.length > 0 && missed.length > overlap.length) {
      // The startsOn that WOULD line up: back up six days from the first real
      // lesson, so the first matching weekday on/after it is that very date.
      const nextReal =
        futureKept.find((d) => d >= key(startsOn)) ?? futureKept[0];
      const aligned = nextReal
        ? (() => {
            const [ay, am, ad] = nextReal.split('-').map(Number);
            return new Date(Date.UTC(ay, am - 1, ad - 6, 12));
          })()
        : undefined;

      if (aligned && isAlignParity) {
        const stillMissed = futureKept.filter(
          (d) => !occurrencesFor(proposed, aligned).includes(d)
        );
        if (stillMissed.length > 0) {
          console.log(
            `   --align-parity would still miss ${stillMissed.length} lesson(s); refusing.\n`
          );
          blocked++;
          continue;
        }
        console.log(
          `   parity off — aligning: startsOn ${key(startsOn)} => ${key(aligned)}, intervalWeeks ${current} => ${proposed}`
        );
        if (isExecute) {
          await doc.ref.update({
            intervalWeeks: proposed,
            startsOn: aligned,
            updatedAt: new Date(),
          });
          console.log(`   WRITTEN`);
        }
        console.log();
        changed++;
        continue;
      }

      console.log(
        `   *** PARITY MISMATCH — ${missed.length} of ${futureKept.length} real lessons fall on weeks this would NOT generate. NOT WRITING. ***`
      );
      if (aligned) {
        console.log(
          `   Aligned startsOn would be ${key(aligned)} (first occurrence ${nextReal}).`
        );
        console.log(`   Re-run with --align-parity to set it.`);
      }
      console.log();
      blocked++;
      continue;
    }

    console.log(`   -> intervalWeeks ${current} => ${proposed}`);
    if (isExecute) {
      await doc.ref.update({ intervalWeeks: proposed, updatedAt: new Date() });
      console.log(`   WRITTEN`);
    }
    console.log();
    changed++;
  }

  // Students with real recurring lessons but no active arrangement at all.
  // Not something to create automatically — the cadence, the room and whether
  // they are continuing are all judgement calls — but silence here is how a
  // student stops getting lessons without anyone noticing.
  const withActive = new Set(
    schedSnap.docs
      .filter((d) => (d.data().status ?? 'active') === 'active')
      .map((d) => d.data().studentId)
  );
  const orphans = [...new Set(lessons.map((l) => l.studentId))]
    .filter((id) => !withActive.has(id))
    .map((id) => {
      const mine = lessons
        .filter((l) => l.studentId === id && l.status !== 'cancelled')
        .sort((a, b) => +a.at - +b.at);
      return { id, count: mine.length, last: mine[mine.length - 1]?.at };
    })
    .filter((o) => o.count >= 2);

  if (orphans.length) {
    console.log('\n--- Lessons but NO active arrangement (needs a human) ---');
    orphans.forEach((o) =>
      console.log(
        `  ${nameById.get(o.id) ?? o.id}: ${o.count} lessons, last ${o.last ? key(o.last) : '-'}`
      )
    );
  }

  console.log(
    `\n${isExecute ? 'Wrote' : 'Would write'} ${changed}; unchanged ${unchanged}; blocked on parity ${blocked}.`
  );
  if (!isExecute && changed > 0) {
    console.log('Re-run with --execute to apply.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
