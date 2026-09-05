import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { LessonList } from './LessonList';
import {
  mockLessons,
  mockLessonUpcomingSingle,
  mockLessonUpcomingSeries,
  mockLessonUpcomingSubstitute,
  mockLessonPastRendered,
  mockLessonPastScheduled,
  mockLessonCancelled,
  mockInstructor,
  mockInstructor2,
} from '@maple/react/storybook-fixtures';
import type { Lesson, RequestState } from '@maple/ts/domain';

const instructors = [mockInstructor, mockInstructor2];
const fixedNow = new Date('2026-05-01T10:00:00Z');

const meta = {
  component: LessonList,
  title: 'Lessons/LessonList',
  parameters: { layout: 'padded' },
  args: {
    onEdit: fn(),
    onCancel: fn(),
    onMarkRendered: fn(),
    onMarkNoShow: fn(),
    instructors,
    primaryTeacherId: mockInstructor.id,
    now: fixedNow,
  },
} satisfies Meta<typeof LessonList>;

export default meta;
type Story = StoryObj<typeof LessonList>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Loading: Story = {
  args: {
    lessonsState: { status: 'loading' } as RequestState<Lesson[]>,
  },
};

export const ErrorState: Story = {
  args: {
    lessonsState: {
      status: 'error',
      error: 'Failed to fetch lessons.',
    } as RequestState<Lesson[]>,
  },
};

export const Empty: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [],
    } as RequestState<Lesson[]>,
  },
};

export const UpcomingAndPast: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: mockLessons,
    } as RequestState<Lesson[]>,
  },
};

export const SubstituteTeacherBadge: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSubstitute],
    } as RequestState<Lesson[]>,
  },
};

export const SeriesBadge: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSeries],
    } as RequestState<Lesson[]>,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const EditButtonCallsOnEdit: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    );
    await userEvent.click(
      await within(document.body).findByRole('menuitem', {
        name: /edit lesson/i,
      })
    );

    await waitFor(() => {
      expect(args.onEdit).toHaveBeenCalledTimes(1);
      expect(args.onEdit).toHaveBeenCalledWith(mockLessonUpcomingSingle);
    });
  },
};

export const CancelButtonCallsOnCancel: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    );
    await userEvent.click(
      await within(document.body).findByRole('menuitem', {
        name: /cancel lesson/i,
      })
    );

    await waitFor(() => {
      expect(args.onCancel).toHaveBeenCalledTimes(1);
      expect(args.onCancel).toHaveBeenCalledWith(mockLessonUpcomingSingle);
    });
  },
};

export const CancelledLessonHasNoActionButtons: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonCancelled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole('button', { name: /^actions for the lesson/i })
    ).toBeNull();
  },
};

export const RenderedLessonHasNoActionButtons: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastRendered],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole('button', { name: /^actions for the lesson/i })
    ).toBeNull();
  },
};

export const SubstituteChipAppearsWhenTeacherDiffers: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSubstitute],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(canvas.getByText(/substitute/i)).toBeInTheDocument();
    });
  },
};

// ============================================================
// MARK RENDERED (added in #282)
// ============================================================

export const MarkRenderedShownOnPastScheduledLesson: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /mark taught/i })
      ).toBeInTheDocument();
    });
  },
};

export const MarkRenderedHiddenOnUpcomingLesson: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole('button', { name: /mark taught/i })
    ).toBeNull();
    // Edit + Cancel still present
    expect(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    ).toBeInTheDocument();
  },
};

export const MarkRenderedHiddenWhenHandlerOmitted: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
    onMarkRendered: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.queryByRole('button', { name: /mark taught/i })
    ).toBeNull();
  },
};

export const MarkRenderedCallsHandler: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', {
      name: /mark taught/i,
    });
    await userEvent.click(button);
    await waitFor(() => {
      expect(args.onMarkRendered).toHaveBeenCalledTimes(1);
      expect(args.onMarkRendered).toHaveBeenCalledWith(
        mockLessonPastScheduled
      );
    });
  },
};

export const MarkRenderedHiddenOnRenderedRow: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastRendered],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Already-rendered lesson shouldn't offer the action again
    expect(
      canvas.queryByRole('button', { name: /mark taught/i })
    ).toBeNull();
  },
};


// ============================================================
// ACTION PATTERN (#805)
// ============================================================

/**
 * The most common action in the studio — "this lesson happened" — is one
 * labelled click. It used to be an unlabelled 20px green tick sitting beside an
 * unlabelled orange cross that cancels the lesson.
 */
export const PrimaryActionIsLabelled: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: /mark taught/i });
    // A real word, not a tooltip and not an aria-label a mouse user never sees.
    expect(button).toHaveTextContent(/mark taught/i);
  },
};

/** Everything else moves behind one overflow, the way StudentList already does. */
export const SecondaryActionsLiveInTheOverflow: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    );

    const menu = within(document.body);
    expect(
      await menu.findByRole('menuitem', { name: /edit lesson/i })
    ).toBeInTheDocument();
    expect(
      menu.getByRole('menuitem', { name: /cancel lesson/i })
    ).toBeInTheDocument();
  },
};

/**
 * A row mid-save says so on the control that was pressed, and the other rows
 * stay live. Before this there was no busy state at all: the page tracked
 * `isSubmitting` and never passed it down.
 */
export const PendingRowShowsProgressAndDoesNotFreezeOthers: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled, mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
    pendingAction: {
      lessonId: mockLessonPastScheduled.id,
      action: 'mark-rendered',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const marking = await canvas.findByRole('button', { name: /marking/i });
    expect(marking).toBeDisabled();

    // The other row's overflow is untouched.
    const triggers = canvas.getAllByRole('button', {
      name: /^actions for the lesson/i,
    });
    expect(triggers.some((t) => !(t as HTMLButtonElement).disabled)).toBe(true);
  },
};

/**
 * A no-show lives in the overflow rather than as a second primary button:
 * "it happened" is the overwhelmingly common answer, and two competing
 * primaries on every past row would slow the common case down to help the rare
 * one.
 */
export const NoShowLivesInTheOverflow: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    );
    await userEvent.click(
      await within(document.body).findByRole('menuitem', {
        name: /nobody came/i,
      })
    );

    await waitFor(() => {
      expect(args.onMarkNoShow).toHaveBeenCalledWith(mockLessonPastScheduled);
    });
  },
};

/** You cannot know nobody came until the time has passed. */
export const NoShowHiddenOnUpcomingLesson: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /^actions for the lesson/i })
    );

    const menu = within(document.body);
    expect(await menu.findByRole('menuitem', { name: /edit lesson/i })).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /nobody came/i })).toBeNull();
  },
};
