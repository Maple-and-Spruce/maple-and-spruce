import type { Meta, StoryObj } from '@storybook/react';
import {
  fn,
  expect,
  fireEvent,
  userEvent,
  waitFor,
  within,
} from 'storybook/test';
import { StandingScheduleDialog } from './StandingScheduleDialog';
import {
  mockInstructor,
  mockInstructor2,
} from '@maple/react/storybook-fixtures';
import type { LessonBlock, StudentLessonSchedule } from '@maple/ts/domain';

const instructors = [mockInstructor, mockInstructor2];

/** Tuesdays, 3:00 PM – 6:00 PM. */
const blocks: LessonBlock[] = [
  {
    id: 'block-1',
    teacherId: mockInstructor.id,
    dayOfWeek: 2,
    startMinutes: 15 * 60,
    endMinutes: 18 * 60,
    label: 'Tuesday afternoons',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const existing: StudentLessonSchedule = {
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
};

const meta = {
  component: StandingScheduleDialog,
  title: 'Lessons/StandingScheduleDialog',
  parameters: { layout: 'centered' },
  args: {
    open: true,
    instructors,
    blocks,
    defaultTeacherId: mockInstructor.id,
    isSubmitting: false,
    error: null,
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof StandingScheduleDialog>;

export default meta;
type Story = StoryObj<typeof StandingScheduleDialog>;

export const AddNew: Story = {};

export const ChangeExisting: Story = {
  args: { schedule: existing },
};

/**
 * A time outside the block is caught here, not by a server error after saving.
 * The block is the container the arrangement has to sit inside (legacy #686).
 */
/**
 * A time outside every block still cannot be saved as-is — the legacy #686 rule is
 * intact. What changed in legacy #835 is that it is no longer a dead end: the dialog
 * offers the widening that would fit, instead of only saying no.
 */
export const OffersAWayThroughForATimeOutsideTheBlock: Story = {
  args: { schedule: existing },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    const time = canvas.getByLabelText(/start time/i);
    await userEvent.clear(time);
    await userEvent.type(time, '19:00'); // block ends at 18:00

    expect(
      await canvas.findByText(/no block covers this time/i)
    ).toBeInTheDocument();
    // Still unsaveable until she picks how to make room.
    expect(canvas.getByRole('button', { name: /save change/i })).toBeDisabled();
  },
};

/** The happy path confirms what will actually happen, in words. */
export const ConfirmsThePatternBeforeSaving: Story = {
  args: { schedule: existing },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    expect(
      await canvas.findByText(
        /lessons will be kept on the books twelve weeks ahead/i,
      ),
    ).toBeInTheDocument();
  },
};

/**
 * The weekday comes from the block rather than being asked for separately — a
 * block already *is* a weekday, and asking twice lets the two disagree.
 */
export const DerivesTheWeekdayFromTheBlock: Story = {
  args: { schedule: existing },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: /save change/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
    });
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.dayOfWeek).toBe(2); // from the block, not a separate field
    expect(input.blockId).toBe('block-1');
    expect(input.startMinutes).toBe(16 * 60);
  },
};

/** A teacher with no blocks cannot have a standing slot, and the form says why. */
export const TeacherWithNoBlocks: Story = {
  args: { defaultTeacherId: mockInstructor2.id },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    expect(
      await canvas.findByText(/this teacher has no blocks yet/i),
    ).toBeInTheDocument();
  },
};

/**
 * Katie sets a biweekly student (legacy #837). She had been expressing this by
 * hand-creating a lesson every off-week and cancelling it — roughly 26
 * cancellations a year, per student.
 */
export const SetsAnEveryOtherWeekCadence: Story = {
  args: { schedule: existing },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByLabelText('How often'));
    await userEvent.click(await canvas.findByRole('option', { name: 'Every other week' }));

    // The summary has to say which weeks, or Katie cannot tell a biweekly
    // arrangement from a weekly one at a glance.
    await waitFor(async () =>
      expect(await canvas.findByText(/Every other Tuesday/i)).toBeTruthy()
    );

    await userEvent.click(canvas.getByRole('button', { name: /save change/i }));

    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.intervalWeeks).toBe(2);
  },
};

/** An existing arrangement opens showing the cadence it already has. */
export const ShowsTheExistingCadence: Story = {
  args: { schedule: { ...existing, intervalWeeks: 2 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await waitFor(async () =>
      expect(await canvas.findByText(/Every other Tuesday/i)).toBeTruthy()
    );
  },
};

/** Weekly stays the default, and reads as plain "Every Tuesday". */
export const DefaultsToWeekly: Story = {
  args: { schedule: existing },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await waitFor(async () =>
      expect(await canvas.findByText(/Every Tuesday/i)).toBeTruthy()
    );

    await userEvent.click(canvas.getByRole('button', { name: /save change/i }));
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.intervalWeeks).toBe(1);
  },
};

// ============================================================
// legacy #835 — no block covers the time: offer a way through
// ============================================================

/**
 * Devin Marlowe's real case. Katie's Tuesday block runs 11:00–18:00 and his
 * lesson is 18:00–18:30, so it falls just off the end.
 *
 * This used to be a dead end: the dialog said it did not fit, and she had to
 * leave, widen the block on the Lesson Blocks page, and come back.
 */
export const OffersToExtendTheBlockWhenNothingFits: Story = {
  args: {
    schedule: {
      ...existing,
      startMinutes: 18 * 60,
      durationMinutes: 30,
    } as StudentLessonSchedule,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    expect(await canvas.findByText(/no block covers this time/i)).toBeTruthy();
    // Named in Katie's terms, and honest that it changes every Tuesday.
    expect(await canvas.findByText(/Extend Tuesdays to/i)).toBeTruthy();
    expect(
      await canvas.findByText(/changes every Tuesday, not just this one/i)
    ).toBeTruthy();
  },
};

/** Nothing can be saved until a way through is chosen. */
export const CannotSaveUntilAChoiceIsMade: Story = {
  args: {
    schedule: {
      ...existing,
      startMinutes: 18 * 60,
      durationMinutes: 30,
    } as StudentLessonSchedule,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    const save = await canvas.findByRole('button', { name: /save change/i });
    expect(save).toBeDisabled();

    await userEvent.click(await canvas.findByRole('radio', { name: /Extend Tuesdays to/i }));
    expect(save).toBeEnabled();

    await userEvent.click(save);
    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));

    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.blockStrategy).toMatchObject({
      mode: 'extend',
      scope: 'weekly',
    });
  },
};

/**
 * A standing arrangement is never offered a one-off block: every week after
 * the first would come back unattributed.
 */
export const NeverOffersAOneOffBlockForAStandingSlot: Story = {
  args: {
    schedule: {
      ...existing,
      startMinutes: 18 * 60,
      durationMinutes: 30,
    } as StudentLessonSchedule,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByText(/no block covers this time/i);
    expect(canvas.queryByText(/just this Tuesday/i)).toBeNull();
  },
};

/**
 * Too far from any block to extend, so a new one is offered instead — capped
 * at an hour's gap so a block is never stretched across an evening nobody
 * teaches.
 */
export const OffersANewBlockWhenNothingIsNear: Story = {
  args: {
    schedule: {
      ...existing,
      startMinutes: 21 * 60,
      durationMinutes: 30,
    } as StudentLessonSchedule,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    expect(await canvas.findByText(/Add a new Tuesday block/i)).toBeTruthy();
    expect(canvas.queryByText(/Extend Tuesdays to/i)).toBeNull();
  },
};

/** A time already covered says nothing — there is no decision to make. */
export const SaysNothingWhenABlockAlreadyFits: Story = {
  args: { schedule: existing },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /save change/i });
    expect(canvas.queryByText(/no block covers this time/i)).toBeNull();
  },
};

// ============================================================
// A new slot with no block picked saves the weekday it was offered
// ============================================================

/**
 * Fill in a brand-new slot the way Katie did: no block picked from the list, a
 * Tuesday start date, and a time just past the Tuesday block.
 */
async function fillNewTuesdaySlotPastTheBlock(
  canvas: ReturnType<typeof within>
): Promise<void> {
  // 2026-09-08 is a Tuesday. Set outright: the default is today, whose weekday
  // depends on when the test runs.
  fireEvent.change(canvas.getByLabelText(/starting/i), {
    target: { value: '2026-09-08' },
  });
  const time = canvas.getByLabelText(/start time/i);
  await userEvent.clear(time);
  await userEvent.type(time, '18:00'); // block ends at 18:00
  await canvas.findByText(/no block covers this time/i);
}

/**
 * The offer said "Extend Tuesdays", so Tuesday is what is sent. With no block
 * picked this used to fall back to weekday 0, and the server — planning from
 * a Sunday — could not find the Tuesday block it had been asked to extend.
 */
export const ExtendingSavesTheOfferedWeekday: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await fillNewTuesdaySlotPastTheBlock(canvas);

    await userEvent.click(
      await canvas.findByRole('radio', { name: /Extend Tuesdays to/i })
    );
    await userEvent.click(canvas.getByRole('button', { name: /add slot/i }));

    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.dayOfWeek).toBe(2);
    expect(input.blockStrategy).toMatchObject({
      mode: 'extend',
      blockId: 'block-1',
      scope: 'weekly',
    });
  },
};

/**
 * The same fall-back on "Add a new Tuesday block" derived a Sunday block and
 * put every lesson on Sundays.
 */
export const AddingABlockSavesTheOfferedWeekday: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await fillNewTuesdaySlotPastTheBlock(canvas);

    await userEvent.click(
      await canvas.findByRole('radio', { name: /Add a new Tuesday block/i })
    );
    await userEvent.click(canvas.getByRole('button', { name: /add slot/i }));

    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.dayOfWeek).toBe(2);
    expect(input.blockStrategy).toEqual({ mode: 'create' });
  },
};

/**
 * A picked block decides the weekday, not the start date. Starting on a Monday
 * with the Tuesday block chosen plans — and offers — Tuesdays.
 */
export const APickedBlockDecidesTheWeekday: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByLabelText('Which block'));
    await userEvent.click(
      await canvas.findByRole('option', { name: /Tuesday afternoons/i })
    );
    fireEvent.change(canvas.getByLabelText(/starting/i), {
      target: { value: '2026-09-07' }, // a Monday
    });
    const time = canvas.getByLabelText(/start time/i);
    await userEvent.clear(time);
    await userEvent.type(time, '18:00');

    expect(await canvas.findByText(/Extend Tuesdays to/i)).toBeTruthy();
    expect(canvas.queryByText(/Monday/i)).toBeNull();
  },
};

/**
 * A choice made while nothing fit is dropped once the time moves back inside
 * the block. Sending it anyway asks the server to widen a block that already
 * fits, which it refuses.
 */
export const DropsAStaleChoiceOnceTheTimeFitsAgain: Story = {
  args: {
    schedule: {
      ...existing,
      startMinutes: 18 * 60,
      durationMinutes: 30,
    } as StudentLessonSchedule,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await canvas.findByRole('radio', { name: /Extend Tuesdays to/i })
    );
    const time = canvas.getByLabelText(/start time/i);
    await userEvent.clear(time);
    await userEvent.type(time, '16:00'); // inside 15:00–18:00

    await waitFor(() =>
      expect(canvas.queryByText(/no block covers this time/i)).toBeNull()
    );
    await userEvent.click(canvas.getByRole('button', { name: /save change/i }));

    await waitFor(() => expect(args.onSubmit).toHaveBeenCalledTimes(1));
    const [input] = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0];
    expect(input.blockStrategy).toBeUndefined();
    expect(input.blockId).toBe('block-1');
    expect(input.dayOfWeek).toBe(2);
  },
};
