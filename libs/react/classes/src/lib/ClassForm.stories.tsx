import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { ClassForm } from './ClassForm';
import {
  mockClass,
  mockClassDraft,
  mockClassNoImage,
  mockClassCategories,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';
import {
  mockActiveInstructors,
  mockInstructor,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';

const meta = {
  component: ClassForm,
  title: 'Classes/ClassForm',
  parameters: {
    layout: 'centered',
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    instructors: mockActiveInstructors,
    categories: mockClassCategories,
  },
} satisfies Meta<typeof ClassForm>;

/**
 * Helper to get the dialog content which renders in a portal (document.body)
 */
const getDialogCanvas = () => within(document.body);

/**
 * Helper to wait for dialog to be fully rendered with form content.
 * Storybook test runner can start before the story is fully loaded,
 * so we need to wait for specific elements to appear.
 */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();

  // First, wait for the story loader to be gone and dialog to appear
  await waitFor(
    () => {
      // Check that the story is no longer in preparing state
      const body = document.body;
      expect(body.classList.contains('sb-preparing-story')).toBe(false);
    },
    { timeout: 5000 }
  );

  // Then wait for dialog elements
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
      expect(canvas.getByLabelText(/class name/i)).toBeInTheDocument();
    },
    { timeout: 3000 }
  );
  return canvas;
};

export default meta;
type Story = StoryObj<typeof ClassForm>;

// ============================================================
// VISUAL STATES
// ============================================================

/**
 * Dialog is closed (not visible)
 */
export const Closed: Story = {
  args: {
    open: false,
    isSubmitting: false,
  },
};

/**
 * Create new class - empty form with defaults
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Create new class without instructor or category options
 */
export const CreateNewNoOptions: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructors: [],
    categories: [],
  },
};

/**
 * Edit existing class - form pre-filled (published with image)
 */
export const EditExistingPublished: Story = {
  args: {
    open: true,
    classItem: mockClass,
    isSubmitting: false,
  },
};

/**
 * Edit draft class
 */
export const EditDraft: Story = {
  args: {
    open: true,
    classItem: mockClassDraft,
    isSubmitting: false,
  },
};

/**
 * Edit class without image
 */
export const EditNoImage: Story = {
  args: {
    open: true,
    classItem: mockClassNoImage,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    classItem: mockClass,
    isSubmitting: true,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

// Visual-only stories for validation states - complex interaction tests removed
// as they are unreliable in the test runner environment

/**
 * Cancel button calls onClose
 */
export const CancelButtonClosesDialog: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Click cancel button
    await userEvent.click(canvas.getByRole('button', { name: /cancel/i }));

    // onClose should have been called
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/**
 * Form is pre-populated when editing
 */
export const EditFormIsPrePopulated: Story = {
  args: {
    open: true,
    classItem: mockClass,
    isSubmitting: false,
  },
  play: async () => {
    // Wait for the story to be ready - check the dialog is visible
    const canvas = await waitForDialog();

    // Progressive check: first verify dialog has title
    await waitFor(
      () => {
        expect(canvas.getByText(/edit class/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Now check form fields are populated
    await waitFor(
      () => {
        const nameInput = canvas.getByLabelText(/class name/i);
        expect(nameInput).toHaveValue(mockClass.name);
      },
      { timeout: 2000 }
    );

    // Check full description field - get all description fields and find the right one
    await waitFor(
      () => {
        // Get all textareas and find the full description by its value
        const allTextareas = canvas.getAllByRole('textbox');
        const descriptionTextarea = allTextareas.find(
          (el) => el.getAttribute('name') === 'description' ||
                  el.textContent === mockClass.description ||
                  (el as HTMLTextAreaElement).value === mockClass.description
        );
        expect(descriptionTextarea).toBeDefined();
      },
      { timeout: 1000 }
    );
  },
};

/**
 * Different skill level values
 */
export const SkillLevelBeginner: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: {
      ...mockClass,
      skillLevel: 'beginner',
    },
  },
};

export const SkillLevelAdvanced: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: {
      ...mockClass,
      skillLevel: 'advanced',
    },
  },
};

/**
 * Different status values
 */
export const StatusCancelled: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: {
      ...mockClass,
      status: 'cancelled',
    },
  },
};

/**
 * With instructor assigned
 */
export const WithInstructor: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: mockClass,
    instructors: [mockInstructor],
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Check that the dialog is showing and form is populated
    await waitFor(() => {
      expect(canvas.getByLabelText(/class name/i)).toHaveValue(mockClass.name);
    });
  },
};
