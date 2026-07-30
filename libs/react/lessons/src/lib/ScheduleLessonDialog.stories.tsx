import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { ScheduleLessonDialog } from './ScheduleLessonDialog';
import {
  mockInstructor,
  mockInstructor2,
  mockInstructorPercentage,
  mockLessonBlock,
  mockLessonBlockOtherTeacher,
} from '@maple/react/storybook-fixtures';

const instructors = [mockInstructor, mockInstructor2, mockInstructorPercentage];
// Exactly one block per selectable teacher (instructor-001 + -002) so the
// dialog auto-selects on open and on a substitute switch.
const blocks = [mockLessonBlock, mockLessonBlockOtherTeacher];

const meta = {
  component: ScheduleLessonDialog,
  title: 'Lessons/ScheduleLessonDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    onClose: fn(),
    onCreateSingle: fn().mockResolvedValue(undefined),
    onCreateSeries: fn().mockResolvedValue(undefined),
    studentId: 'student-001',
    defaultTeacherId: mockInstructor.id,
    instructors,
    blocks,
    defaultDurationMinutes: 30,
  },
} satisfies Meta<typeof ScheduleLessonDialog>;

const getDialogCanvas = () => within(document.body);

const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
      expect(
        canvas.getByRole('button', { name: /single lesson/i }),
      ).toBeInTheDocument();
    },
    { timeout: 3000 },
  );
  return canvas;
};

export default meta;
type Story = StoryObj<typeof ScheduleLessonDialog>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Closed: Story = {
  args: { open: false, isSubmitting: false },
};

export const SingleMode: Story = {
  args: { open: true, isSubmitting: false },
};

export const SeriesMode: Story = {
  args: { open: true, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();
    await userEvent.click(
      canvas.getByRole('button', { name: /recurring series/i }),
    );
    const dialog = within(canvas.getByRole('dialog'));
    await waitFor(() => {
      expect(dialog.getByText(/^Preview \(/i)).toBeInTheDocument();
    });
  },
};

export const Submitting: Story = {
  args: { open: true, isSubmitting: true },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

export const SingleLessonSuccessfulSubmit: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Single mode is the default. Submit with defaults.
    await userEvent.click(
      canvas.getByRole('button', { name: /schedule lesson/i }),
    );

    await waitFor(() => {
      expect(args.onCreateSingle).toHaveBeenCalledTimes(1);
      expect(args.onCreateSingle).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-001',
          teacherId: mockInstructor.id,
          durationMinutes: 30,
          status: 'scheduled',
          // Room selector defaults to Spruce and flows into the payload.
          room: 'spruce',
        }),
      );
    });
  },
};

export const CancelButtonClosesDialog: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.click(canvas.getByRole('button', { name: /^cancel$/i }));

    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const SwitchToSeriesShowsPreview: Story = {
  args: { open: true, isSubmitting: false },
  play: async () => {
    const canvas = await waitForDialog();

    await userEvent.click(
      canvas.getByRole('button', { name: /recurring series/i }),
    );

    const dialog = within(canvas.getByRole('dialog'));
    await waitFor(() => {
      expect(dialog.getByText(/^Preview \(/i)).toBeInTheDocument();
      // Count defaults to 8 — expect 8 preview rows
      expect(dialog.getByText(/Will create 8 lessons/i)).toBeInTheDocument();
    });
  },
};

export const SkippingPreviewDatesReducesSubmittedCount: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Switch to series mode
    await userEvent.click(
      canvas.getByRole('button', { name: /recurring series/i }),
    );

    const dialog = within(canvas.getByRole('dialog'));
    await waitFor(() => {
      expect(dialog.getByText(/Will create 8 lessons/i)).toBeInTheDocument();
    });

    // Uncheck the first two preview dates
    const checkboxes = dialog.getAllByRole('checkbox', {
      name: /include /i,
    });
    expect(checkboxes.length).toBe(8);
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);

    await waitFor(() => {
      expect(dialog.getByText(/Will create 6 lessons/i)).toBeInTheDocument();
    });

    // Submit — should call createSeries with 6 dates
    await userEvent.click(
      canvas.getByRole('button', { name: /schedule 6 lessons/i }),
    );

    await waitFor(() => {
      expect(args.onCreateSeries).toHaveBeenCalledTimes(1);
      const arg = (args.onCreateSeries as ReturnType<typeof fn>).mock
        .calls[0][0];
      expect(arg.scheduledAts.length).toBe(6);
      expect(arg.studentId).toBe('student-001');
      expect(arg.teacherId).toBe(mockInstructor.id);
      expect(arg.durationMinutes).toBe(30);
    });
  },
};

export const SubstituteTeacherSelection: Story = {
  args: { open: true, isSubmitting: false },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Open teacher dropdown
    const teacherSelect = canvas.getByLabelText(/^teacher$/i);
    await userEvent.click(teacherSelect);

    // Pick the second instructor (non-primary)
    const option = await waitFor(() =>
      canvas.getByRole('option', { name: new RegExp(mockInstructor2.name) }),
    );
    await userEvent.click(option);

    await userEvent.click(
      canvas.getByRole('button', { name: /schedule lesson/i }),
    );

    await waitFor(() => {
      expect(args.onCreateSingle).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: mockInstructor2.id,
        }),
      );
    });
  },
};
