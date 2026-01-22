import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { ArtistForm } from './ArtistForm';
import { mockArtist } from '../../../.storybook/fixtures';

const meta = {
  component: ArtistForm,
  title: 'Artists/ArtistForm',
  parameters: {
    layout: 'centered',
    // Disable a11y for these tests to focus on interaction testing
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof ArtistForm>;

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
    expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
  });
  return canvas;
};

export default meta;
type Story = StoryObj<typeof ArtistForm>;

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
 * Create new artist - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Edit existing artist - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    artist: mockArtist,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    artist: mockArtist,
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
      const nameInput = canvas.getByRole('textbox', { name: /name/i });
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });

    // Email field should show error
    const emailInput = canvas.getByLabelText(/email/i);
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');

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
      expect(canvas.getByRole('textbox', { name: /name/i })).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    // Type valid name
    const nameInput = canvas.getByRole('textbox', { name: /name/i });
    await userEvent.type(nameInput, 'John Doe');

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
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Fill in required fields
    await userEvent.type(canvas.getByRole('textbox', { name: /name/i }), 'Jane Artist');
    await userEvent.type(
      canvas.getByLabelText(/email/i),
      'jane@example.com'
    );

    // Optional phone
    await userEvent.type(canvas.getByLabelText(/phone/i), '555-123-4567');

    // Submit the form
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // onSubmit should have been called with the form data
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Artist',
          email: 'jane@example.com',
          phone: '555-123-4567',
          defaultCommissionRate: 0.4, // default
          status: 'active', // default
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
    artist: mockArtist,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Wait for the form to be populated
    await waitFor(() => {
      const nameInput = canvas.getByRole('textbox', { name: /name/i });
      expect(nameInput).toHaveValue(mockArtist.name);
    });

    // Check other fields
    expect(canvas.getByLabelText(/email/i)).toHaveValue(mockArtist.email);
    expect(canvas.getByLabelText(/phone/i)).toHaveValue(mockArtist.phone);

    // Commission rate shows as percentage (40)
    const commissionInput = canvas.getByLabelText(/commission rate/i);
    expect(commissionInput).toHaveValue(
      Math.round(mockArtist.defaultCommissionRate * 100)
    );
  },
};

/**
 * Email validation shows error for invalid email format
 */
export const EmailValidation: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Fill name to pass that validation
    await userEvent.type(canvas.getByRole('textbox', { name: /name/i }), 'Test Artist');

    // Enter invalid email
    await userEvent.type(canvas.getByLabelText(/email/i), 'not-an-email');

    // Submit
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    // Email field should show error
    await waitFor(() => {
      const emailInput = canvas.getByLabelText(/email/i);
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    });

    // onSubmit should not be called
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Commission rate helper text shows split calculation
 */
export const CommissionRateHelperText: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // The helper text contains the full message in one element
    // Look for text that includes both store and artist percentages
    await waitFor(() => {
      const helperText = canvas.getByText(/Store keeps 40%, artist gets 60%/i);
      expect(helperText).toBeInTheDocument();
    });

    // Change commission rate to 30%
    const commissionInput = canvas.getByLabelText(/commission rate/i);
    await userEvent.clear(commissionInput);
    await userEvent.type(commissionInput, '30');

    // Helper text should update
    await waitFor(() => {
      const helperText = canvas.getByText(/Store keeps 30%, artist gets 70%/i);
      expect(helperText).toBeInTheDocument();
    });
  },
};
