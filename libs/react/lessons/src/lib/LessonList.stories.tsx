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

    const editButton = canvas.getByRole('button', { name: /edit lesson/i });
    await userEvent.click(editButton);

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

    const cancelButton = canvas.getByRole('button', {
      name: /cancel lesson/i,
    });
    await userEvent.click(cancelButton);

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
      canvas.queryByRole('button', { name: /edit lesson/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /cancel lesson/i })
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
      canvas.queryByRole('button', { name: /edit lesson/i })
    ).toBeNull();
    expect(
      canvas.queryByRole('button', { name: /cancel lesson/i })
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
        canvas.getByRole('button', { name: /mark lesson as rendered/i })
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
      canvas.queryByRole('button', { name: /mark lesson as rendered/i })
    ).toBeNull();
    // Edit + Cancel still present
    expect(
      canvas.getByRole('button', { name: /edit lesson/i })
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
      canvas.queryByRole('button', { name: /mark lesson as rendered/i })
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
      name: /mark lesson as rendered/i,
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
      canvas.queryByRole('button', { name: /mark lesson as rendered/i })
    ).toBeNull();
  },
};
