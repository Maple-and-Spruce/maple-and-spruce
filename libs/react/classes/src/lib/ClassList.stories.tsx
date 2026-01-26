import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor } from 'storybook/test';
import { ClassList } from './ClassList';
import {
  mockClasses,
  mockPublishedClasses,
  mockUpcomingClasses,
  mockClass,
  mockClassDraft,
  mockClassCancelled,
  mockClassCompleted,
  mockClassCategories,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';
import { mockActiveInstructors } from '../../../../../apps/maple-spruce/.storybook/fixtures';
import type { RequestState, Class } from '@maple/ts/domain';

const meta = {
  component: ClassList,
  title: 'Classes/ClassList',
  parameters: {
    layout: 'padded',
  },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    instructors: mockActiveInstructors,
    categories: mockClassCategories,
  },
} satisfies Meta<typeof ClassList>;

export default meta;
type Story = StoryObj<typeof ClassList>;

// ============================================================
// VISUAL STATES
// ============================================================

/**
 * Idle state - nothing loaded yet
 */
export const Idle: Story = {
  args: {
    classesState: { status: 'idle' } as RequestState<Class[]>,
  },
};

/**
 * Loading state - skeleton cards shown
 */
export const Loading: Story = {
  args: {
    classesState: { status: 'loading' } as RequestState<Class[]>,
  },
};

/**
 * Error state - error message shown
 */
export const Error: Story = {
  args: {
    classesState: {
      status: 'error',
      error: 'Failed to fetch classes from the server.',
    } as RequestState<Class[]>,
  },
};

/**
 * Empty state - no classes yet
 */
export const Empty: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [],
    } as RequestState<Class[]>,
  },
};

/**
 * With data - multiple classes displayed
 */
export const WithData: Story = {
  args: {
    classesState: {
      status: 'success',
      data: mockClasses,
    } as RequestState<Class[]>,
  },
};

/**
 * Only published classes
 */
export const PublishedClassesOnly: Story = {
  args: {
    classesState: {
      status: 'success',
      data: mockPublishedClasses,
    } as RequestState<Class[]>,
  },
};

/**
 * Upcoming classes only
 */
export const UpcomingClasses: Story = {
  args: {
    classesState: {
      status: 'success',
      data: mockUpcomingClasses,
    } as RequestState<Class[]>,
  },
};

/**
 * Single class
 */
export const SingleClass: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass],
    } as RequestState<Class[]>,
  },
};

/**
 * Classes with mixed statuses
 */
export const MixedStatuses: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass, mockClassDraft, mockClassCancelled, mockClassCompleted],
    } as RequestState<Class[]>,
  },
};

/**
 * Classes without instructor/category lookups
 */
export const WithoutLookups: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass],
    } as RequestState<Class[]>,
    instructors: [],
    categories: [],
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/**
 * Edit button calls onEdit with the class
 */
export const EditButtonCallsOnEdit: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass],
    } as RequestState<Class[]>,
  },
  play: async ({ args, canvasElement }) => {
    const { within } = await import('storybook/test');
    const canvas = within(canvasElement);

    // Find and click the edit button
    const editButton = canvas.getByRole('button', { name: /edit/i });
    await userEvent.click(editButton);

    // onEdit should have been called with the class
    await waitFor(() => {
      expect(args.onEdit).toHaveBeenCalledTimes(1);
      expect(args.onEdit).toHaveBeenCalledWith(mockClass);
    });
  },
};

/**
 * Delete button calls onDelete with the class
 */
export const DeleteButtonCallsOnDelete: Story = {
  args: {
    classesState: {
      status: 'success',
      data: [mockClass],
    } as RequestState<Class[]>,
  },
  play: async ({ args, canvasElement }) => {
    const { within } = await import('storybook/test');
    const canvas = within(canvasElement);

    // Find and click the delete button
    const deleteButton = canvas.getByRole('button', { name: /delete/i });
    await userEvent.click(deleteButton);

    // onDelete should have been called with the class
    await waitFor(() => {
      expect(args.onDelete).toHaveBeenCalledTimes(1);
      expect(args.onDelete).toHaveBeenCalledWith(mockClass);
    });
  },
};
