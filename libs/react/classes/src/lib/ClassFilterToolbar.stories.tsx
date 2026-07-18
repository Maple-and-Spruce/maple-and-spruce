import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { ClassFilterToolbar } from './ClassFilterToolbar';
import { mockClassCategories } from '@maple/react/storybook-fixtures';
import { mockActiveInstructors } from '@maple/react/storybook-fixtures';

const meta = {
  component: ClassFilterToolbar,
  title: 'Classes/ClassFilterToolbar',
  parameters: {
    layout: 'padded',
  },
  args: {
    onFiltersChange: fn(),
    instructors: mockActiveInstructors,
    categories: mockClassCategories,
  },
} satisfies Meta<typeof ClassFilterToolbar>;

export default meta;
type Story = StoryObj<typeof ClassFilterToolbar>;

// ============================================================
// VISUAL STATES
// ============================================================

/**
 * No filters selected
 */
export const NoFilters: Story = {
  args: {
    filters: {},
  },
};

/**
 * Status filter selected
 */
export const WithStatusFilter: Story = {
  args: {
    filters: {
      status: 'published',
    },
  },
};

/**
 * Category filter selected
 */
export const WithCategoryFilter: Story = {
  args: {
    filters: {
      categoryId: 'cat-fiber',
    },
  },
};

/**
 * Instructor filter selected
 */
export const WithInstructorFilter: Story = {
  args: {
    filters: {
      instructorId: 'instructor-001',
    },
  },
};

/**
 * Upcoming toggle enabled
 */
export const UpcomingOnly: Story = {
  args: {
    filters: {
      upcoming: true,
    },
  },
};

/**
 * Hide-full toggle enabled
 */
export const HideFull: Story = {
  args: {
    filters: {
      hideFull: true,
    },
  },
};

/**
 * Default Katie view: upcoming + not full
 */
export const DefaultAdminView: Story = {
  args: {
    filters: {
      upcoming: true,
      hideFull: true,
    },
  },
};

/**
 * Multiple filters selected
 */
export const MultipleFilters: Story = {
  args: {
    filters: {
      status: 'published',
      categoryId: 'cat-fiber',
      upcoming: true,
      hideFull: true,
    },
  },
};

/**
 * Without instructor/category options
 */
export const WithoutOptions: Story = {
  args: {
    filters: {},
    instructors: [],
    categories: [],
  },
};

/**
 * All statuses filtered
 */
export const DraftStatus: Story = {
  args: {
    filters: {
      status: 'draft',
    },
  },
};

export const CancelledStatus: Story = {
  args: {
    filters: {
      status: 'cancelled',
    },
  },
};

export const CompletedStatus: Story = {
  args: {
    filters: {
      status: 'completed',
    },
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/**
 * Toggling upcoming switch calls onFiltersChange
 */
export const UpcomingToggleChange: Story = {
  args: {
    filters: {},
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    // Find and click the switch
    const upcomingSwitch = canvas.getByRole('checkbox', { name: /upcoming only/i });
    await userEvent.click(upcomingSwitch);

    // onFiltersChange should have been called with upcoming: true
    await waitFor(() => {
      expect(args.onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          upcoming: true,
        })
      );
    });
  },
};
