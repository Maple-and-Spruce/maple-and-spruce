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
    // Most stories below are about a row's actions, and several of those rows
    // are in the past. Show them, so each story keeps asserting what it always
    // did; the stories under "PAST LESSONS SWITCH" turn this back off to test
    // the real default.
    defaultShowPast: true,
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
// MARK RENDERED (added in legacy #282)
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
// ACTION PATTERN (legacy #805)
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

// ============================================================
// PAST LESSONS SWITCH, DEFAULT SORT, PINNING
// ============================================================

/**
 * The table opens on what is coming. Past lessons with an outcome — taught,
 * no-show, cancelled — are history, one switch away.
 */
export const PastLessonsHiddenUntilSwitchedOn: Story = {
  args: {
    defaultShowPast: false,
    lessonsState: {
      status: 'success',
      data: mockLessons,
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await canvas.findByRole('button', { name: /mark taught/i });
    expect(canvas.queryByText('taught')).toBeNull();
    expect(canvas.queryByText('cancelled')).toBeNull();

    // The taught and the cancelled lesson are the two being hidden.
    await userEvent.click(canvas.getByLabelText(/show past lessons \(2\)/i));

    expect(await canvas.findByText('taught')).toBeInTheDocument();
    expect(canvas.getByText('cancelled')).toBeInTheDocument();
  },
};

/**
 * A past lesson nobody has marked yet is still a job to do, so it stays on
 * screen with the switch off — hiding it would hide "Mark taught" itself.
 */
export const UnmarkedPastLessonStaysVisible: Story = {
  args: {
    defaultShowPast: false,
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByRole('button', { name: /mark taught/i })
    ).toBeInTheDocument();
  },
};

export const EmptyUpcomingPointsAtTheSwitch: Story = {
  args: {
    defaultShowPast: false,
    lessonsState: {
      status: 'success',
      data: [mockLessonPastRendered],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/no upcoming lessons/i)
    ).toBeInTheDocument();
  },
};

/**
 * The overdue lesson's primary action works with the switch at its real
 * default. The older action stories run with past lessons shown, so this is
 * the one that proves the everyday path.
 */
export const MarkTaughtWorksWithPastHidden: Story = {
  args: {
    defaultShowPast: false,
    lessonsState: {
      status: 'success',
      data: [
        mockLessonPastScheduled,
        mockLessonPastRendered,
        mockLessonUpcomingSingle,
      ],
    } as RequestState<Lesson[]>,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /mark taught/i })
    );
    await waitFor(() => {
      expect(args.onMarkRendered).toHaveBeenCalledWith(mockLessonPastScheduled);
    });
  },
};

export const LoadingShowsSkeletons: Story = {
  args: {
    lessonsState: { status: 'loading' } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector('.MuiSkeleton-root')).toBeTruthy();
    });
  },
};

export const LoadErrorIsShown: Story = {
  args: {
    lessonsState: {
      status: 'error',
      error: 'Failed to fetch lessons.',
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/failed to load lessons: failed to fetch lessons/i)
    ).toBeInTheDocument();
  },
};

/** Clicking the date header flips the order to latest first. */
export const ClickingDateHeaderReversesOrder: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [
        mockLessonPastScheduled,
        mockLessonUpcomingSingle,
        mockLessonUpcomingSubstitute,
      ],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const label = (lesson: Lesson) =>
      lesson.scheduledAt.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    const firstRowText = () =>
      canvas.getAllByRole('row')[1].textContent ?? '';

    await waitFor(() => {
      expect(firstRowText()).toContain(label(mockLessonPastScheduled));
    });

    const header = canvas.getByRole('columnheader', { name: /date \/ time/i });
    await userEvent.click(within(header).getByText('Date / Time'));

    await waitFor(() => {
      expect(firstRowText()).toContain(label(mockLessonUpcomingSubstitute));
    });
  },
};

/** Opens in date order, soonest first. */
export const OpensSortedByDateTime: Story = {
  args: {
    lessonsState: {
      status: 'success',
      // Deliberately out of order.
      data: [
        mockLessonUpcomingSubstitute,
        mockLessonPastScheduled,
        mockLessonUpcomingSingle,
        mockLessonPastRendered,
      ],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('taught');

    const rows = canvas.getAllByRole('row').slice(1);
    const order = [
      mockLessonPastScheduled,
      mockLessonPastRendered,
      mockLessonUpcomingSingle,
      mockLessonUpcomingSubstitute,
    ].map((lesson) =>
      rows.findIndex((row) =>
        row.textContent?.includes(
          lesson.scheduledAt.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        )
      )
    );

    expect(order).toEqual([0, 1, 2, 3]);
  },
};

/** When the lesson is, and what can be done about it, survive a scroll. */
export const PinsDateLeftAndActionsRight: Story = {
  args: {
    lessonsState: {
      status: 'success',
      data: [mockLessonPastScheduled, mockLessonUpcomingSingle],
    } as RequestState<Lesson[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const position = async (name: RegExp) =>
      getComputedStyle(await canvas.findByRole('columnheader', { name }))
        .position;

    expect(await position(/^Date \/ Time/)).toBe('sticky');
    expect(await position(/^Actions/)).toBe('sticky');
    expect(await position(/^Notes/)).not.toBe('sticky');

    const pinnedCell = canvasElement.ownerDocument.querySelector(
      '.MuiTableContainer-root tbody td[data-pinned="true"]'
    );
    expect(getComputedStyle(pinnedCell as Element).opacity).toBe('1');
  },
};
