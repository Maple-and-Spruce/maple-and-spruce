import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
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
 * The block is the container the arrangement has to sit inside (#686).
 */
export const RefusesATimeOutsideTheBlock: Story = {
  args: { schedule: existing },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    const time = canvas.getByLabelText(/start time/i);
    await userEvent.clear(time);
    await userEvent.type(time, '19:00'); // block ends at 18:00

    expect(await canvas.findByText(/does not fit inside/i)).toBeInTheDocument();
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
