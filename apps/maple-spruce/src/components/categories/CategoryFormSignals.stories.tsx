import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { CategoryFormSignals } from './CategoryFormSignals';
import { mockCategoryPottery } from '../../../.storybook/fixtures';

const meta = {
  component: CategoryFormSignals,
  title: 'Categories/CategoryFormSignals',
  parameters: {
    layout: 'centered',
    // Disable a11y for these tests to focus on interaction testing
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    nextOrder: 0,
  },
} satisfies Meta<typeof CategoryFormSignals>;

/**
 * Helper to get the dialog content which renders in a portal (document.body)
 */
const getDialogCanvas = () => within(document.body);

/**
 * Helper to wait for dialog to be fully rendered with form content
 */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(() => {
    // Wait for both dialog and form content to be present
    expect(canvas.getByRole('dialog')).toBeInTheDocument();
    expect(canvas.getByLabelText(/category name/i)).toBeInTheDocument();
  });
  return canvas;
};

export default meta;
type Story = StoryObj<typeof CategoryFormSignals>;

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
 * Create new category - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
    nextOrder: 6,
  },
};

/**
 * Edit existing category - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isSubmitting: true,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/**
 * Validation errors appear when submitting empty form
 */
export const ValidationErrorsOnEmptySubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Click Add button without filling in any fields
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // Wait for validation errors to appear
    await waitFor(() => {
      // Name field should show error
      const nameInput = canvas.getByLabelText(/category name/i);
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    // onSubmit should not have been called
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Errors clear as user types valid input
 */
export const ErrorsClearOnValidInput: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Submit to trigger validation
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // Wait for error to appear
    await waitFor(() => {
      expect(canvas.getByLabelText(/category name/i)).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    // Type valid name (at least 2 characters)
    const nameInput = canvas.getByLabelText(/category name/i);
    await userEvent.type(nameInput, 'Pottery');

    // Error should clear (with signals, validation updates automatically)
    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'false');
    });
  },
};

/**
 * Form fills in all fields and submits successfully
 */
export const SuccessfulSubmission: Story = {
  args: {
    open: true,
    isSubmitting: false,
    nextOrder: 10,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Fill in name
    await userEvent.type(
      canvas.getByLabelText(/category name/i),
      'Glass Art'
    );

    // Fill in optional description
    await userEvent.type(
      canvas.getByLabelText(/description/i),
      'Blown and fused glass artwork'
    );

    // Submit the form
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // onSubmit should have been called with the form data
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Glass Art',
          description: 'Blown and fused glass artwork',
          order: 10,
        })
      );
    });
  },
};

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
    category: mockCategoryPottery,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Wait for the form to be populated
    await waitFor(() => {
      const nameInput = canvas.getByLabelText(/category name/i);
      expect(nameInput).toHaveValue(mockCategoryPottery.name);
    });

    // Check description
    expect(canvas.getByLabelText(/description/i)).toHaveValue(
      mockCategoryPottery.description
    );
  },
};

/**
 * Name must be at least 2 characters
 */
export const NameMinLengthValidation: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Type a single character
    const nameInput = canvas.getByLabelText(/category name/i);
    await userEvent.type(nameInput, 'A');

    // Submit
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // Name field should show error (min 2 chars)
    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    // onSubmit should not be called
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Edit mode shows Update button instead of Add
 */
export const EditModeShowsUpdateButton: Story = {
  args: {
    open: true,
    category: mockCategoryPottery,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Should show Update button in edit mode
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /update/i })
      ).toBeInTheDocument();
    });

    // Should not show Add button
    expect(
      canvas.queryByRole('button', { name: /^add$/i })
    ).not.toBeInTheDocument();
  },
};
