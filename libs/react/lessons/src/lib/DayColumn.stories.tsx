import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { DayColumn } from './DayColumn';
import { buildDayColumn } from '@maple/ts/domain';
import type { LessonBlock, StudentLessonSchedule } from '@maple/ts/domain';

const TEACHER = 'teacher-katie';
/** A Tuesday, midday UTC so it reads as that date in shop time. */
const FROM = new Date('2026-09-08T12:00:00Z');

/** Tuesdays 11:00–18:30 — the shape of Katie's real teaching day. */
const block: LessonBlock = {
  id: 'blk-tue',
  teacherId: TEACHER,
  dayOfWeek: 2,
  startMinutes: 11 * 60,
  endMinutes: 18 * 60 + 30,
  label: 'Tuesdays',
  createdAt: new Date(),
  updatedAt: new Date(),
};

let seq = 0;
const slot = (
  studentId: string,
  startMinutes: number,
  durationMinutes: number,
  intervalWeeks = 1,
  startsOn = FROM
): StudentLessonSchedule =>
  ({
    id: `sched-${++seq}`,
    studentId,
    teacherId: TEACHER,
    blockId: 'blk-tue',
    dayOfWeek: 2,
    startMinutes,
    durationMinutes,
    intervalWeeks,
    status: 'active',
    startsOn,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as StudentLessonSchedule;

/** Katie's actual Tuesday, from her spreadsheet. */
const schedules = [
  slot('pip', 11 * 60, 60, 2),
  slot('tobias', 12 * 60, 60),
  slot('elowen', 14 * 60, 60, 2),
  slot('delphine', 15 * 60, 60),
  slot('marisol', 17 * 60, 60, 2),
  slot('odette', 17 * 60, 60, 2, new Date('2026-09-15T12:00:00Z')),
  slot('devin', 18 * 60, 30),
];

const studentNames = {
  pip: '"Pip" (Rosalind) Vance',
  tobias: 'Tobias Pike',
  elowen: 'Elowen Ridley',
  delphine: 'Delphine Cray (virtual)',
  marisol: 'Marisol Hale',
  odette: 'Odette Bramble',
  devin: 'Devin Marlowe',
};

const meta = {
  component: DayColumn,
  title: 'Lessons/DayColumn',
  parameters: { layout: 'padded' },
  args: {
    weekday: 2,
    rows: buildDayColumn(2, [block], schedules, { from: FROM }),
    studentNames,
    onScheduleInto: fn(),
    onOpenSlot: fn(),
  },
} satisfies Meta<typeof DayColumn>;

export default meta;
type Story = StoryObj<typeof DayColumn>;

/** The whole day, exactly as Katie keeps it by hand. */
export const KatiesTuesday: Story = {};

export const Empty: Story = {
  args: { rows: [] },
};

export const Loading: Story = {
  args: { isLoading: true },
};

/**
 * The distinction the spreadsheet makes and a busy/free view cannot: a
 * biweekly student's hour is half sellable; two interleaved biweekly students
 * fill the hour completely.
 */
export const ShowsWhichOpeningsAreOnlyEveryOtherWeek: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Pip (11am) and Elowen (2pm) are both biweekly, so each of their hours is
    // open on the alternate week — two openings, each sellable to exactly one
    // more biweekly student.
    expect(await canvas.findAllByText(/open every other week/i)).toHaveLength(2);

    // Marisol and Odette alternate in the 5 o'clock hour, so it is not open at
    // all — selling it would double-book the room.
    const rows = canvas.getAllByText(/5:00 PM–6:00 PM/);
    expect(rows).toHaveLength(2); // two lessons, no opening
  },
};

/** Openings are actionable: the row is where Katie books from. */
export const SchedulesIntoAnOpening: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    const buttons = await canvas.findAllByRole('button', { name: /schedule/i });
    await userEvent.click(buttons[0]);

    expect(args.onScheduleInto).toHaveBeenCalledTimes(1);
    const [row] = (args.onScheduleInto as ReturnType<typeof fn>).mock.calls[0];
    expect(row.kind).toBe('open');
  },
};

/** A standing slot opens for editing. */
export const OpensAnExistingSlot: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByText('Tobias Pike'));

    expect(args.onOpenSlot).toHaveBeenCalledTimes(1);
  },
};

/** Read-only: no callbacks, no buttons. */
export const ReadOnly: Story = {
  args: { onScheduleInto: undefined, onOpenSlot: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('button', { name: /schedule/i })).toBeNull();
  },
};

/** A day shared by two teachers names them; Katie's own day does not. */
export const NamesTeachersOnlyWhenSeveralShareTheDay: Story = {
  args: {
    rows: buildDayColumn(
      2,
      [block, { ...block, id: 'blk-n', teacherId: 'teacher-nathan' }],
      [
        slot('tobias', 12 * 60, 60),
        {
          ...slot('devin', 13 * 60, 30),
          teacherId: 'teacher-nathan',
          blockId: 'blk-n',
        } as StudentLessonSchedule,
      ],
      { from: FROM }
    ),
    teacherNames: { [TEACHER]: 'Katie', 'teacher-nathan': 'Nathan' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Katie')).toBeTruthy();
    expect(await canvas.findByText('Nathan')).toBeTruthy();
  },
};
