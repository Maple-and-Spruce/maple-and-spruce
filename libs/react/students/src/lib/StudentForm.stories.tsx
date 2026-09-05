import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { StudentForm } from './StudentForm';
import {
  mockStudent,
  mockStudentHope,
  mockStudentAdult,
  mockInstructor,
  mockInstructor2,
  mockInstructorPercentage,
} from '@maple/react/storybook-fixtures';

const instructors = [mockInstructor, mockInstructor2, mockInstructorPercentage];

const meta = {
  component: StudentForm,
  title: 'Students/StudentForm',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    instructors,
  },
} satisfies Meta<typeof StudentForm>;

/** Dialog renders in a portal; query against document.body. */
const getDialogCanvas = () => within(document.body);

/** Wait for dialog content to be fully rendered. */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
      expect(canvas.getByLabelText(/student name/i)).toBeInTheDocument();
    },
    { timeout: 3000 }
  );
  return canvas;
};

export default meta;
type Story = StoryObj<typeof StudentForm>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Closed: Story = {
  args: { open: false, isSubmitting: false },
};

export const CreateNew: Story = {
  args: { open: true, isSubmitting: false },
};

export const EditExisting: Story = {
  args: { open: true, student: mockStudent, isSubmitting: false },
};

export const EditHopeScholarship: Story = {
  args: { open: true, student: mockStudentHope, isSubmitting: false },
};

export const EditAdultStudent: Story = {
  args: { open: true, student: mockStudentAdult, isSubmitting: false },
};

export const Submitting: Story = {
  args: { open: true, student: mockStudent, isSubmitting: true },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const ValidationErrorsOnEmptySubmit: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Submit without filling required fields
    await userEvent.click(canvas.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(canvas.getByLabelText(/student name/i)).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    // Primary contact fields should also be flagged
    expect(canvas.getByLabelText(/primary contact name/i)).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(canvas.getByLabelText(/primary contact email/i)).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const SuccessfulSubmission: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByLabelText(/student name/i),
      'Iris Park'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact name/i),
      'Lee Park'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact email/i),
      'lee@example.com'
    );

    // Instrument already defaults to piano; pick the primary teacher
    const teacherSelect = canvas.getByLabelText(/primary teacher/i);
    await userEvent.click(teacherSelect);
    const teacherOption = await waitFor(() =>
      canvas.getByRole('option', { name: mockInstructor.name })
    );
    await userEvent.click(teacherOption);

    await userEvent.click(canvas.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Iris Park',
          instrument: 'piano',
          primaryTeacherId: mockInstructor.id,
          primaryContactName: 'Lee Park',
          primaryContactEmail: 'lee@example.com',
          isAdultStudent: false,
          isHopeScholarship: false,
          status: 'active',
        })
      );
    });
  },
};

export const VenmoUsernameStrippedOfAtOnSubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByLabelText(/student name/i),
      'Juniper Nguyen'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact name/i),
      'Casey Nguyen'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact email/i),
      'casey@example.com'
    );
    // Enter the Venmo handle WITH a leading @ — it should be stored stripped.
    await userEvent.type(
      canvas.getByLabelText(/venmo username/i),
      '@casey-nguyen'
    );

    const teacherSelect = canvas.getByLabelText(/primary teacher/i);
    await userEvent.click(teacherSelect);
    const teacherOption = await waitFor(() =>
      canvas.getByRole('option', { name: mockInstructor.name })
    );
    await userEvent.click(teacherOption);

    await userEvent.click(canvas.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ venmoUsername: 'casey-nguyen' })
      );
    });
  },
};

export const AutoInvoiceAndLessonRateSubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByLabelText(/student name/i),
      'Ravi Patel'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact name/i),
      'Anita Patel'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact email/i),
      'anita@example.com'
    );

    // Flip auto-invoice on and set a $41.25 rate → 4125 cents.
    await userEvent.click(
      canvas.getByRole('switch', { name: /automatically invoice after each lesson/i })
    );
    await userEvent.type(
      canvas.getByLabelText(/lesson rate override/i),
      '41.25'
    );

    const teacherSelect = canvas.getByLabelText(/primary teacher/i);
    await userEvent.click(teacherSelect);
    const teacherOption = await waitFor(() =>
      canvas.getByRole('option', { name: mockInstructor.name })
    );
    await userEvent.click(teacherOption);

    await userEvent.click(canvas.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ autoInvoice: true, lessonRateCents: 4125 })
      );
    });
  },
};

export const HopeScholarshipDisablesAutoInvoice: Story = {
  args: { open: true, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();
    // Auto-invoice must not be available for Hope students (they bill via EMA).
    await userEvent.click(
      canvas.getByRole('switch', { name: /hope scholarship/i })
    );
    await waitFor(() => {
      expect(
        canvas.getByRole('switch', { name: /automatically invoice after each lesson/i })
      ).toBeDisabled();
    });
  },
};

export const CancelButtonClosesDialog: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.click(canvas.getByRole('button', { name: /cancel/i }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const EditFormIsPrePopulated: Story = {
  args: { open: true, student: mockStudent, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();

    await waitFor(() => {
      expect(canvas.getByLabelText(/student name/i)).toHaveValue(
        mockStudent.name
      );
    });

    expect(canvas.getByLabelText(/primary contact name/i)).toHaveValue(
      mockStudent.primaryContactName
    );
    expect(canvas.getByLabelText(/primary contact email/i)).toHaveValue(
      mockStudent.primaryContactEmail
    );
  },
};

export const AdultStudentTogglesContactSectionHeader: Story = {
  args: { open: true, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();

    // Defaults to minor — "Parent / guardian" section header visible
    expect(canvas.getByText(/parent.*guardian/i)).toBeInTheDocument();

    // Toggle adult switch
    await userEvent.click(
      canvas.getByRole('switch', { name: /adult student/i })
    );

    // Section header flips to "Contact"
    await waitFor(() => {
      // Use queryAllByText since "Secondary contact" also contains "contact"
      const headers = canvas.queryAllByText(/^contact$/i);
      expect(headers.length).toBeGreaterThan(0);
    });
  },
};

export const InvalidPrimaryContactEmailBlocksSubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(
      canvas.getByLabelText(/student name/i),
      'Test Student'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact name/i),
      'Test Parent'
    );
    await userEvent.type(
      canvas.getByLabelText(/primary contact email/i),
      'not-an-email'
    );

    // Select teacher so that's not what blocks submit
    const teacherSelect = canvas.getByLabelText(/primary teacher/i);
    await userEvent.click(teacherSelect);
    const teacherOption = await waitFor(() =>
      canvas.getByRole('option', { name: mockInstructor.name })
    );
    await userEvent.click(teacherOption);

    await userEvent.click(canvas.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(canvas.getByLabelText(/primary contact email/i)).toHaveAttribute(
        'aria-invalid',
        'true'
      );
    });

    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const HopeScholarshipToggles: Story = {
  args: { open: true, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();

    const hopeToggle = canvas.getByRole('switch', {
      name: /hope scholarship/i,
    });
    expect(hopeToggle).not.toBeChecked();

    await userEvent.click(hopeToggle);

    await waitFor(() => {
      expect(hopeToggle).toBeChecked();
    });
  },
};

// ============================================================
// PREFILL FROM AN INQUIRY (#819)
// ============================================================

/**
 * THE POINT: the form arrives already knowing what the family told us.
 *
 * Everything here was on the `/leads` screen a second earlier. Retyping it was
 * three chances to typo an email address.
 */
export const PrefilledFromInquiry: Story = {
  args: {
    open: true,
    isSubmitting: false,
    prefill: {
      name: 'Milo Ashfield',
      instrument: 'fiddle',
      isAdultStudent: false,
      primaryContactName: 'Robin Ashfield',
      primaryContactEmail: 'robin@example.com',
      primaryContactPhone: '+13045550101',
      notes: 'From the Music lesson inquiry form, submitted Aug 25, 2026.',
    },
    prefillNote:
      "Prefilled from Robin Ashfield's inquiry. Saving also marks that inquiry enrolled.",
  },
  play: async ({ canvasElement }) => {
    await waitForDialog();
    const canvas = getDialogCanvas();

    expect(canvas.getByLabelText(/student name/i)).toHaveValue('Milo Ashfield');
    expect(canvas.getByLabelText(/primary contact name/i)).toHaveValue(
      'Robin Ashfield'
    );
    expect(canvas.getByLabelText(/primary contact email/i)).toHaveValue(
      'robin@example.com'
    );

    // A form that mysteriously has content in it has to say where it came from,
    // and warn that saving does a second thing.
    expect(
      canvas.getByText(/prefilled from robin ashfield/i)
    ).toBeInTheDocument();
    expect(
      canvas.getByText(/marks that inquiry enrolled/i)
    ).toBeInTheDocument();
  },
};

/**
 * A prefill is a draft, not a decision.
 *
 * Teacher and lesson length are Katie's calls and cannot be read off any form,
 * so they stay empty and the form stays invalid until she picks. Defaulting
 * them would look like a decision somebody made.
 */
export const PrefillLeavesTheRealDecisionsOpen: Story = {
  args: {
    open: true,
    isSubmitting: false,
    prefill: {
      name: 'Nora Bell',
      instrument: 'fiddle',
      isAdultStudent: true,
      primaryContactName: 'Nora Bell',
      primaryContactEmail: 'nora@example.com',
    },
  },
  play: async ({ canvasElement }) => {
    await waitForDialog();
    const canvas = getDialogCanvas();

    // MUI Select renders its value as text, so an unset one simply names no
    // instructor. The prefill supplied every contact detail and still left this
    // for Katie.
    const teacher = canvas.getByLabelText(/primary teacher/i);
    expect(teacher).not.toHaveTextContent(mockInstructor.name);
    expect(teacher).not.toHaveTextContent(mockInstructor2.name);
  },
};
