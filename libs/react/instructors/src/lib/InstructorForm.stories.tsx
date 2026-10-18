import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, fireEvent, within, userEvent, waitFor } from 'storybook/test';
import { InstructorForm } from './InstructorForm';
import {
  mockInstructor,
  mockInstructorPercentage,
  mockInstructorMinimal,
  mockContractorNotReady,
  mockContractorNothingRecorded,
} from '@maple/react/storybook-fixtures';

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

    // Email is optional, so it is not flagged
    const emailInput = canvas.getByLabelText(/email/i);
    expect(emailInput).toHaveAttribute('aria-invalid', 'false');

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
 * An instructor can be added without an email
 */
export const SubmitsWithoutEmail: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Olive Thompson'
    );
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
    });
    const submitted = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0][0];
    expect(submitted.name).toBe('Olive Thompson');
    expect(submitted.email).toBeUndefined();
  },
};

/**
 * A percentage is typed as a percent and saved as a decimal
 */
export const PercentagePayRate: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    const body = within(document.body);

    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Olive Thompson'
    );
    await userEvent.click(canvas.getByRole('combobox', { name: /pay rate type/i }));
    await userEvent.click(
      await body.findByRole('option', { name: /percentage of class revenue/i })
    );
    await userEvent.type(canvas.getByLabelText(/percentage \(%\)/i), '70');
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ payRateType: 'percentage', payRate: 0.7 })
      );
    });
  },
};

/**
 * A blocked save says so beside the button
 */
export const BlockedSaveSaysWhy: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByRole('textbox', { name: /name/i }),
      'Olive Thompson'
    );
    await userEvent.click(canvas.getByRole('combobox', { name: /pay rate type/i }));
    await userEvent.click(
      await within(document.body).findByRole('option', { name: /flat rate/i })
    );
    // Pay rate left blank
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(
        canvas.getByText('Fix the highlighted fields to save.')
      ).toBeInTheDocument();
    });
    expect(
      canvas.getByText('Pay rate is required when pay rate type is set')
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
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

// ============================================================
// LESSON RATES
// ============================================================

/**
 * What families pay, per instrument and length, lives on the teacher. Existing
 * rates load as dollars; an instrument can be added and a length priced, and
 * the whole table is sent in cents.
 */
export const EditingLessonRates: Story = {
  args: {
    open: true,
    instructor: {
      ...mockInstructor,
      lessonRates: { violin: { '30-min-full': 4500 } },
    },
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    const violin30 = canvas.getByLabelText('Violin 30 min (full) rate');
    await expect(violin30).toHaveValue(45);
    await userEvent.clear(violin30);
    await userEvent.type(violin30, '48');

    await userEvent.click(canvas.getByLabelText('Add an instrument'));
    await userEvent.click(
      await canvas.findByRole('option', { name: 'Harp' })
    );
    await userEvent.type(canvas.getByLabelText('Harp 60 min rate'), '80');

    await userEvent.click(canvas.getByRole('button', { name: /update/i }));
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonRates: {
            violin: { '30-min-full': 4800 },
            harp: { '60-min': 8000 },
          },
        })
      );
    });
  },
};

/** Removing an instrument sends the table without it, so it is really gone. */
export const RemovingAnInstrumentsRates: Story = {
  args: {
    open: true,
    instructor: {
      ...mockInstructor,
      lessonRates: {
        violin: { '30-min-full': 4500 },
        cello: { '45-min': 6000 },
      },
    },
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove Cello rates' })
    );
    await userEvent.click(canvas.getByRole('button', { name: /update/i }));
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonRates: { violin: { '30-min-full': 4500 } },
        })
      );
    });
  },
};

/** A zero price would bill a family nothing; the form refuses it. */
export const AZeroRateIsRefused: Story = {
  args: {
    open: true,
    instructor: { ...mockInstructor, lessonRates: { violin: {} } },
    isSubmitting: false,
    onSubmit: fn(),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.type(
      canvas.getByLabelText('Violin 30 min (full) rate'),
      '0'
    );
    await userEvent.click(canvas.getByRole('button', { name: /update/i }));
    await expect(
      await canvas.findByText('Lesson rates must be positive amounts')
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

// ============================================================
// CONTRACTOR READINESS
// ============================================================

/**
 * A new instructor starts as a contractor, and a save with nothing recorded
 * goes through (warned, not blocked) with an empty readiness record.
 */
export const CreateNewDefaultsToContractor: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await expect(canvas.getByRole('switch', { name: /paid contractor/i })).toBeChecked();
    await expect(canvas.getByText(/not ready: missing contractor agreement/i)).toBeInTheDocument();

    await userEvent.type(canvas.getByRole('textbox', { name: /name/i }), 'Robin Ashfield');
    await userEvent.type(canvas.getByLabelText(/email/i), 'robin@example.com');
    await userEvent.click(canvas.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ isContractor: true, readiness: {} })
      );
    });
  },
};

/**
 * Editing a contractor partway through onboarding: record the background
 * check and payment setup, and the save carries the whole record.
 */
export const EditRecordsReadiness: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructor: mockContractorNotReady,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await expect(
      canvas.getByText(/missing background check and payment setup/i)
    ).toBeInTheDocument();

    fireEvent.change(canvas.getByLabelText(/date cleared/i), {
      target: { value: '2026-09-27' },
    });
    fireEvent.change(canvas.getByLabelText(/date completed/i), {
      target: { value: '2026-09-28' },
    });
    await userEvent.click(canvas.getByLabelText(/how they're paid/i));
    await userEvent.click(canvas.getByRole('option', { name: /square payroll/i }));

    await expect(canvas.getByText(/ready to teach/i)).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /update/i }));
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          isContractor: true,
          readiness: {
            contractorAgreement: { signedOn: '2026-09-20' },
            backgroundCheck: { clearedOn: '2026-09-27' },
            paymentSetup: { completedOn: '2026-09-28', method: 'square-payroll' },
          },
        })
      );
    });
  },
};

/**
 * A payment method with no date is reported, not silently dropped.
 */
export const HalfFilledPaymentSetupIsReported: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructor: mockContractorNotReady,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.click(canvas.getByLabelText(/how they're paid/i));
    await userEvent.click(canvas.getByRole('option', { name: /w-9 on file/i }));
    await userEvent.click(canvas.getByRole('button', { name: /update/i }));

    await expect(
      await canvas.findByText('Date completed must be a valid date')
    ).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Stand-in for the agreement panel the instructors page supplies: a button
 * that reports a signature, the way the panel does when one lands while the
 * form is open.
 */
const agreementActions = fn(
  (_instructor, form: { recordSigned: (a: { signedOn: string; reference?: string }) => void }) => (
    <button
      type="button"
      onClick={() =>
        form.recordSigned({
          signedOn: '2026-10-12',
          reference: 'Signed online, agreement sa-1',
        })
      }
    >
      Simulate signature
    </button>
  )
);

/**
 * A signature that lands while the form is open is filled into the form, so
 * saving does not clear it (the update replaces the whole readiness record).
 */
export const SignatureWhileOpenIsKept: Story = {
  args: {
    open: true,
    isSubmitting: false,
    instructor: mockContractorNothingRecorded,
    onSubmit: fn().mockResolvedValue(undefined),
    renderAgreementActions: agreementActions,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(canvas.getByRole('button', { name: /simulate signature/i }));

    await expect(canvas.getByLabelText(/date signed/i)).toHaveValue('2026-10-12');

    await userEvent.click(canvas.getByRole('button', { name: /update/i }));
    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          readiness: {
            contractorAgreement: {
              signedOn: '2026-10-12',
              reference: 'Signed online, agreement sa-1',
            },
          },
        })
      );
    });
  },
};

/** A new instructor has no record to send an agreement against yet. */
export const CreateNewHasNoAgreementActions: Story = {
  args: {
    open: true,
    isSubmitting: false,
    renderAgreementActions: agreementActions,
  },
  play: async () => {
    const canvas = await waitForDialog();
    await expect(
      canvas.getByRole('heading', { name: /^contractor agreement$/i })
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /simulate signature/i })
    ).not.toBeInTheDocument();
  },
};
