import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { InstructorForm } from './InstructorForm';
import {
  mockInstructor,
  mockInstructorPercentage,
  mockInstructorMinimal,
} from '../../../../../apps/maple-spruce/.storybook/fixtures';

const meta = {
  component: InstructorForm,
  title: 'Instructors/InstructorForm',
  parameters: {
    layout: 'centered',
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof InstructorForm>;

/**
 * Helper to get the dialog content which renders in a portal (document.body)
 */
const getDialogCanvas = () => within(document.body);

/**
 * Helper to wait for dialog to be fully rendered with form content
 */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
      expect(canvas.getByLabelText(/email/i)).toBeInTheDocument();
    },
    { timeout: 3000 }
  );
  return canvas;
};

export default meta;
type Story = StoryObj<typeof InstructorForm>;

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
 * Create new instructor - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Edit existing instructor - form pre-filled with flat rate
 */
export const EditExistingFlatRate: Story = {
  args: {
    open: true,
    instructor: mockInstructor,
    isSubmitting: false,
  },
};

/**
 * Edit existing instructor - form pre-filled with percentage rate
 */
export const EditExistingPercentage: Story = {
  args: {
    open: true,
    instructor: mockInstructorPercentage,
    isSubmitting: false,
  },
};

/**
 * Edit minimal instructor - only required fields
 */
export const EditMinimal: Story = {
  args: {
    open: true,
    instructor: mockInstructorMinimal,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    instructor: mockInstructor,
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
    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Jane Instructor'
    );
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
          name: 'Jane Instructor',
          email: 'jane@example.com',
          phone: '555-123-4567',
          status: 'active',
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
    instructor: mockInstructor,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Wait for the form to be populated
    await waitFor(() => {
      const nameInput = canvas.getByRole('textbox', { name: /name/i });
      expect(nameInput).toHaveValue(mockInstructor.name);
    });

    // Check other fields
    expect(canvas.getByLabelText(/email/i)).toHaveValue(mockInstructor.email);
    expect(canvas.getByLabelText(/phone/i)).toHaveValue(mockInstructor.phone);
  },
};

/**
 * Pay rate field appears when pay rate type is already set
 * (Visual test - no interaction needed)
 */
export const WithPayRateTypeSet: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructor: {
      ...mockInstructor,
      payRateType: 'flat',
      payRate: 5000, // $50
    },
  },
  // No play function - just a visual test to see the pay rate field
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
    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Test Instructor'
    );

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
