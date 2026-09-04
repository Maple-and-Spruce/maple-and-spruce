import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { HopeQueue } from './HopeQueue';
import { summarizeHopeQueue } from '@maple/ts/domain';
import type {
  HopeQueueEntry,
  HopeSubmission,
  HopeSubmissionStatus,
  Lesson,
} from '@maple/ts/domain';

function lesson(id: string, iso: string): Lesson {
  return {
    id,
    studentId: 'student-1',
    scheduledAt: new Date(iso),
    durationMinutes: 30,
    teacherId: 'teacher-1',
    status: 'rendered',
    createdAt: new Date(iso),
    updatedAt: new Date(iso),
  } as Lesson;
}

function submission(
  lessonId: string,
  status: HopeSubmissionStatus,
  extra: Partial<HopeSubmission> = {}
): HopeSubmission {
  return {
    id: lessonId,
    lessonId,
    studentId: 'student-1',
    teacherId: 'teacher-1',
    lessonDate: new Date('2026-08-01T15:00:00Z'),
    status,
    rateCents: 4125,
    submittedAt: new Date('2026-08-05T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  };
}

function entry(
  id: string,
  iso: string,
  overrides: Partial<HopeQueueEntry> = {}
): HopeQueueEntry {
  return {
    lesson: lesson(id, iso),
    studentId: 'student-1',
    studentName: 'Rowan Fields',
    registeredLessonLength: '30-min-full',
    rateCents: 4125,
    ...overrides,
  };
}

const entries: HopeQueueEntry[] = [
  entry('l-1', '2026-07-07T19:00:00Z'),
  entry('l-2', '2026-07-14T19:00:00Z'),
  entry('l-3', '2026-07-21T19:00:00Z', {
    submission: submission('l-3', 'submitted'),
  }),
  entry('l-4', '2026-07-28T19:00:00Z', {
    submission: submission('l-4', 'paid', { paidAt: new Date() }),
  }),
  entry('l-5', '2026-08-04T19:00:00Z', {
    submission: submission('l-5', 'rejected', {
      rejectionReason: 'Provider not yet approved for guitar',
    }),
  }),
];

const meta = {
  component: HopeQueue,
  title: 'Lessons/HopeQueue',
  parameters: { layout: 'padded' },
  args: {
    entries,
    totals: summarizeHopeQueue(entries),
    recording: new Set<string>(),
    onRecord: fn(),
  },
} satisfies Meta<typeof HopeQueue>;

export default meta;
type Story = StoryObj<typeof HopeQueue>;

export const Queue: Story = {};

export const Empty: Story = {
  args: { entries: [], totals: summarizeHopeQueue([]) },
};

/**
 * The number Katie actually needs: taught and not yet paid for. A rejected
 * claim counts toward it, because the studio still has not been paid.
 */
export const ShowsWhatIsStillOwed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // 2 never claimed + 1 rejected = 3 lessons at $41.25 = $123.75
    expect(await canvas.findByText('$123.75')).toBeInTheDocument();
    expect(canvas.getByText(/3 lessons/i)).toBeInTheDocument();
    expect(canvas.getByText(/1 rejected/i)).toBeInTheDocument();
  },
};

/** Submitting is bulk, because Katie works a term at a time. */
export const SelectsEverythingUnclaimedAtOnce: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /select all not submitted \(3\)/i })
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /mark 3 submitted/i })
    );

    await waitFor(() => {
      expect(args.onRecord).toHaveBeenCalledTimes(1);
    });
    const [lessonIds, status] = (args.onRecord as ReturnType<typeof fn>).mock
      .calls[0];
    // The rejected one is included: it is still owed.
    expect([...lessonIds].sort()).toEqual(['l-1', 'l-2', 'l-5']);
    expect(status).toBe('submitted');
  },
};

/** A rejection has to say why, or nobody can fix it before resubmitting. */
export const ShowsWhyEmaRefused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/provider not yet approved for guitar/i)
    ).toBeInTheDocument();
  },
};

export const RecordingInProgress: Story = {
  args: { recording: new Set(['l-1', 'l-2']) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The rows being written show progress instead of a checkbox.
    expect(
      canvas.queryByRole('checkbox', { name: /rowan fields on jul 7/i })
    ).toBeNull();
    expect(
      canvas.getByRole('checkbox', { name: /rowan fields on jul 21/i })
    ).toBeInTheDocument();
  },
};
