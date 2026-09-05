import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { StandingScheduleCard } from './StandingScheduleCard';
import {
  mockInstructor,
  mockInstructor2,
} from '@maple/react/storybook-fixtures';
import type { StudentLessonSchedule } from '@maple/ts/domain';

const instructors = [mockInstructor, mockInstructor2];

function schedule(
  overrides: Partial<StudentLessonSchedule> = {},
): StudentLessonSchedule {
  return {
    id: 'sched-1',
    studentId: 'student-1',
    teacherId: mockInstructor.id,
    blockId: 'block-1',
    dayOfWeek: 2,
    startMinutes: 16 * 60,
    durationMinutes: 30,
    // Midday shop time — what the dialog and the backfill both produce.
    startsOn: new Date('2026-01-06T17:00:00Z'),
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const meta = {
  component: StandingScheduleCard,
  title: 'Lessons/StandingScheduleCard',
  parameters: { layout: 'padded' },
  args: {
    schedules: [schedule()],
    instructors,
    pendingId: null,
    onAdd: fn(),
    onEdit: fn(),
    onEnd: fn(),
  },
} satisfies Meta<typeof StandingScheduleCard>;

export default meta;
type Story = StoryObj<typeof StandingScheduleCard>;

export const OneStandingSlot: Story = {};

/**
 * The arrangement is stated the way a person says it, not as a row of fields.
 * This is the whole point: Katie reads "Tuesdays at 4:00 PM", not twelve dates.
 */
export const ReadsLikeASentence: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/Tuesdays at 4:00 PM/i)).toBeInTheDocument();
  },
};

/** Moving a student is one edit — the card offers exactly that. */
export const ChangeIsOneAction: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^change$/i }));
    await waitFor(() => {
      expect(args.onEdit).toHaveBeenCalledTimes(1);
    });
  },
};

/**
 * A student with no arrangement is the state that used to be invisible — and
 * the one whose lessons quietly run out.
 */
export const NoStandingSchedule: Story = {
  args: { schedules: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/nothing keeps them on the books/i),
    ).toBeInTheDocument();
  },
};

/**
 * An ended arrangement stays visible as history rather than vanishing — that is
 * how a slot handed from one student to another reads correctly.
 */
export const EndedArrangementShownAsHistory: Story = {
  args: {
    schedules: [
      schedule(),
      schedule({
        id: 'sched-old',
        status: 'ended',
        startMinutes: 13 * 60,
        endsOn: new Date('2026-05-26T00:00:00Z'),
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/previously/i)).toBeInTheDocument();
    expect(canvas.getByText(/Tuesdays at 1:00 PM/i)).toBeInTheDocument();
    // The ended one offers no actions — it is not something to change.
    expect(canvas.getAllByRole('button', { name: /^change$/i })).toHaveLength(
      1,
    );
  },
};

/** Saving one arrangement must not freeze the others (#805's pattern). */
export const SavingOneSlot: Story = {
  args: {
    schedules: [schedule(), schedule({ id: 'sched-2', startMinutes: 17 * 60 })],
    pendingId: 'sched-1',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole('button', { name: /saving/i }),
    ).toBeDisabled();
    expect(
      canvas.getByRole('button', { name: /^change$/i }),
    ).not.toBeDisabled();
  },
};

/**
 * The card says that changing the pattern does not move lessons already on the
 * calendar. Otherwise "I changed the day and next week didn't move" is a
 * mystery rather than a documented rule.
 */
export const ExplainsThatExistingLessonsStay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(
        /lessons already on the calendar stay where they are/i,
      ),
    ).toBeInTheDocument();
  },
};

/**
 * Dates are read in the SHOP timezone, not the viewer's.
 *
 * `startsOn` is a date-only fact stored as a timestamp, so formatting it with
 * the browser's zone shows a different date depending on where you open the
 * portal from — and in the dialog, where the same value is written back on
 * save, that would quietly walk a schedule's start date backwards one edit at
 * a time.
 */
export const DatesAreReadInShopTime: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 2026-01-06T17:00Z is midday Jan 6 in America/New_York.
    expect(await canvas.findByText(/Since Jan 6, 2026/i)).toBeInTheDocument();
  },
};
