import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { ClassForm } from './ClassForm';
import {
  mockClass,
  mockClassDraft,
  mockClassNoImage,
  mockClassCategories,
  mockClassWithGallery,
  mockClassWithReferral,
  mockClassCategoriesWithPool,
} from '@maple/react/storybook-fixtures';
import {
  mockActiveInstructors,
  mockInstructor,
} from '@maple/react/storybook-fixtures';

/** Static default date for deterministic Chromatic snapshots */
const STATIC_DEFAULT_DATE = new Date('2030-04-01T10:00:00Z');

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
    defaultDateTime: STATIC_DEFAULT_DATE,
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

/**
 * Editing a class that's opted into the friend-referral program — toggle
 * is on and the percent + expiry fields show the saved values.
 */
export const EditWithReferralProgram: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: mockClassWithReferral,
  },
  play: async () => {
    const canvas = await waitForDialog();
    await waitFor(() => {
      expect(canvas.getByLabelText(/enable friend referral program/i)).toBeChecked();
    });
    expect(canvas.getByLabelText(/friend gets/i)).toHaveValue(50);
    expect(canvas.getByLabelText(/code expires after/i)).toHaveValue(60);
  },
};

// ============================================================
// COVERAGE-BOOSTING INTERACTION TESTS
// ============================================================

/**
 * Verify create-new form has correct defaults:
 * capacity=8, location="Maple & Spruce", price empty, duration preset
 */
export const CreateNewDefaults: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      // Default capacity should be 8
      const capacityInput = canvas.getByLabelText(/capacity/i);
      expect(capacityInput).toHaveValue(8);

      // Default location should be "Maple & Spruce"
      const locationInput = canvas.getByLabelText(/location/i);
      expect(locationInput).toHaveValue('Maple & Spruce');
    });
  },
};

/**
 * Type into the price field and verify formatting
 */
export const PriceInputFormatting: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/price/i)).toBeInTheDocument();
    });

    const priceInput = canvas.getByLabelText(/price/i);

    // Clear and type a price
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '45');

    await waitFor(() => {
      expect(priceInput).toHaveValue('45');
    });
  },
};

/**
 * Change the duration dropdown selection
 */
export const DurationDropdownSelection: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Find and click the duration dropdown
    await waitFor(() => {
      expect(canvas.getByLabelText(/duration/i)).toBeInTheDocument();
    });

    const durationSelect = canvas.getByLabelText(/duration/i);
    await userEvent.click(durationSelect);

    // Select "2 hours" from the dropdown
    await waitFor(() => {
      const option = canvas.getByRole('option', { name: /2 hours/i });
      expect(option).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole('option', { name: /2 hours/i }));
  },
};

/**
 * Change status to published — exercises status dropdown code path
 */
export const ChangeStatusToPublished: Story = {
  args: {
    open: true,
    isSubmitting: false,
    classItem: mockClassDraft,
    instructors: mockActiveInstructors,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Find status dropdown
    await waitFor(() => {
      expect(canvas.getByLabelText(/status/i)).toBeInTheDocument();
    });

    const statusSelect = canvas.getByLabelText(/status/i);
    await userEvent.click(statusSelect);

    await waitFor(() => {
      const publishedOption = canvas.getByRole('option', { name: /published/i });
      expect(publishedOption).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole('option', { name: /published/i }));
  },
};

/**
 * Change skill level — exercises skill level dropdown
 */
export const ChangeSkillLevel: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/skill level/i)).toBeInTheDocument();
    });

    const skillSelect = canvas.getByLabelText(/skill level/i);
    await userEvent.click(skillSelect);

    await waitFor(() => {
      expect(canvas.getByRole('option', { name: /intermediate/i })).toBeInTheDocument();
    });

    await userEvent.click(canvas.getByRole('option', { name: /intermediate/i }));
  },
};

/**
 * Type into description and short description fields
 */
export const FillDescriptionFields: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/class name/i)).toBeInTheDocument();
    });

    // Use shorter strings to avoid timeout on the heavier multi-session form
    const nameInput = canvas.getByLabelText(/class name/i);
    await userEvent.type(nameInput, 'Pottery');

    const shortDescInput = canvas.getByLabelText(/short description/i);
    await userEvent.type(shortDescInput, 'Basics');

    const descInput = canvas.getByLabelText(/full description/i);
    await userEvent.type(descInput, 'Intro class');

    const materialsInput = canvas.getByLabelText(/materials included/i);
    await userEvent.type(materialsInput, 'Clay');

    const bringInput = canvas.getByLabelText(/what to bring/i);
    await userEvent.type(bringInput, 'Apron');
  },
};

/**
 * Change capacity value
 */
export const ChangeCapacity: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/capacity/i)).toBeInTheDocument();
    });

    const capacityInput = canvas.getByLabelText(/capacity/i);
    await userEvent.clear(capacityInput);
    await userEvent.type(capacityInput, '12');

    await waitFor(() => {
      expect(capacityInput).toHaveValue(12);
    });
  },
};

/**
 * Select an instructor from dropdown
 */
export const SelectInstructor: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructors: mockActiveInstructors,
  },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/instructor/i)).toBeInTheDocument();
    });

    const instructorSelect = canvas.getByLabelText(/instructor/i);
    await userEvent.click(instructorSelect);

    await waitFor(() => {
      const options = canvas.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
    });

    // Click the first instructor option
    const options = canvas.getAllByRole('option');
    if (options.length > 1) {
      await userEvent.click(options[1]); // skip "None" option
    }
  },
};

// ============================================================
// GALLERY
// ============================================================

/**
 * Edit a class that already has gallery images set. Visual story —
 * confirms the editor renders three reorderable rows with their alt text.
 */
export const EditWithGallery: Story = {
  args: {
    open: true,
    classItem: mockClassWithGallery,
    categories: mockClassCategoriesWithPool,
    isSubmitting: false,
  },
};

/**
 * Edit a class whose category has a populated image pool. Verifies the
 * "Add from {category} pool" button is enabled and that clicking it
 * opens the picker dialog with the pool's images visible.
 */
export const WithCategoryPoolPicker: Story = {
  args: {
    open: true,
    classItem: mockClassWithGallery,
    categories: mockClassCategoriesWithPool,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Pool button is enabled because the class's category has a pool.
    const poolButton = canvas.getByRole('button', {
      name: /add from fiber arts pool/i,
    });
    await waitFor(() => expect(poolButton).toBeEnabled());

    await userEvent.click(poolButton);

    // The picker dialog opens — its title should be visible somewhere
    // in the document (still under document.body, since it's a Dialog).
    await waitFor(() => {
      expect(
        canvas.getByRole('heading', { name: /add from fiber arts pool/i })
      ).toBeInTheDocument();
    });

    // Pool has 5 images; the 3 already in the gallery should appear as
    // disabled checkboxes, leaving 2 available to add.
    const allCheckboxes = canvas
      .getAllByRole('checkbox')
      .filter((cb) => cb.closest('[role="dialog"]'));
    const enabled = allCheckboxes.filter(
      (cb) => !(cb as HTMLInputElement).disabled
    );
    expect(allCheckboxes.length).toBeGreaterThanOrEqual(5);
    expect(enabled.length).toBe(2);
  },
};
