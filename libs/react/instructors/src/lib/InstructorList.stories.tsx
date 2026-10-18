import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { InstructorList } from './InstructorList';
import {
  mockInstructors,
  mockActiveInstructors,
  mockInstructor,
  mockInstructorInactive,
  mockContractorReady,
  mockContractorNotReady,
} from '@maple/react/storybook-fixtures';
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
  // Idle is "not fetched yet": drawn as loading, never as "no instructors".
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading instructors')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/no instructors yet/i)).not.toBeInTheDocument();
  },
};

/**
 * Loading state - skeleton cards shown
 */
export const Loading: Story = {
  args: {
    instructorsState: { status: 'loading' } as RequestState<Instructor[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading instructors')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByText(/no instructors yet/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText('Not ready')).not.toBeInTheDocument();
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

/**
 * A contract instructor who is not cleared to teach gets a "Not ready" chip;
 * a cleared contractor and a non-contractor do not.
 */
export const NotReadyChip: Story = {
  args: {
    instructorsState: {
      status: 'success',
      data: [mockContractorNotReady, mockContractorReady, mockInstructor],
    } as RequestState<Instructor[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chips = canvas.getAllByText('Not ready');
    await expect(chips).toHaveLength(1);

    const card = canvas
      .getByRole('heading', { name: mockContractorNotReady.name })
      .closest('.MuiCard-root') as HTMLElement;
    await expect(
      within(card).getByLabelText(
        'Not ready to teach: missing background check and payment setup'
      )
    ).toBeInTheDocument();
  },
};
