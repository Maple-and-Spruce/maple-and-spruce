import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor } from 'storybook/test';
import { InstructorList } from './InstructorList';
import {
  mockInstructors,
  mockActiveInstructors,
  mockInstructor,
  mockInstructorInactive,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';
import type { RequestState } from '@maple/ts/domain';
import type { Instructor } from '@maple/ts/domain';

const meta = {
  component: InstructorList,
  title: 'Instructors/InstructorList',
  parameters: {
    layout: 'padded',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof InstructorList>;

export default meta;
type Story = StoryObj<typeof InstructorList>;

// ============================================================
// VISUAL STATES
// ============================================================

/**
 * Idle state - nothing loaded yet
 */
export const Idle: Story = {
  args: {
    instructorsState: { status: 'idle' } as RequestState<Instructor[]>,
  },
};

/**
 * Loading state - skeleton cards shown
 */
export const Loading: Story = {
  args: {
    instructorsState: { status: 'loading' } as RequestState<Instructor[]>,
  },
};

/**
 * Error state - error message shown
 */
export const Error: Story = {
  args: {
    instructorsState: {
      status: 'error',
      error: 'Failed to fetch instructors from the server.',
    } as RequestState<Instructor[]>,
  },
};

/**
 * Empty state - no instructors yet
 */
export const Empty: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [],
    } as RequestState<Instructor[]>,
  },
};

/**
 * With data - multiple instructors displayed
 */
export const WithData: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: mockInstructors,
    } as RequestState<Instructor[]>,
  },
};

/**
 * Only active instructors
 */
export const ActiveInstructorsOnly: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: mockActiveInstructors,
    } as RequestState<Instructor[]>,
  },
};

/**
 * Single instructor
 */
export const SingleInstructor: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [mockInstructor],
    } as RequestState<Instructor[]>,
  },
};

/**
 * Instructors with mixed statuses
 */
export const MixedStatuses: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [mockInstructor, mockInstructorInactive],
    } as RequestState<Instructor[]>,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/**
 * Edit button calls onEdit with the instructor
 */
export const EditButtonCallsOnEdit: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [mockInstructor],
    } as RequestState<Instructor[]>,
  },
  play: async ({ args, canvasElement }) => {
    const { within } = await import('storybook/test');
    const canvas = within(canvasElement);

    // Find and click the edit button
    const editButton = canvas.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    // onEdit should have been called with the instructor
    await waitFor(() => {
      expect(args.onEdit).toHaveBeenCalledTimes(1);
      expect(args.onEdit).toHaveBeenCalledWith(mockInstructor);
    });
  },
};

/**
 * Delete button calls onDelete with the instructor
 */
export const DeleteButtonCallsOnDelete: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [mockInstructor],
    } as RequestState<Instructor[]>,
  },
  play: async ({ args, canvasElement }) => {
    const { within } = await import('storybook/test');
    const canvas = within(canvasElement);

    // Find and click the delete button
    const deleteButton = canvas.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    // onDelete should have been called with the instructor
    await waitFor(() => {
      expect(args.onDelete).toHaveBeenCalledTimes(1);
      expect(args.onDelete).toHaveBeenCalledWith(mockInstructor);
    });
  },
};
