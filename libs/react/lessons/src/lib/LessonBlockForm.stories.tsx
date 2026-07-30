import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { LessonBlockForm } from './LessonBlockForm';
import {
  mockInstructor,
  mockInstructor2,
  mockLessonBlockTuesday,
} from '@maple/react/storybook-fixtures';

const instructors = [mockInstructor, mockInstructor2];

const meta = {
  component: LessonBlockForm,
  title: 'Lessons/LessonBlockForm',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn().mockResolvedValue(undefined),
    instructors,
    isSubmitting: false,
  },
} satisfies Meta<typeof LessonBlockForm>;

export default meta;
type Story = StoryObj<typeof LessonBlockForm>;

const body = () => within(document.body);

export const Create: Story = {};

export const Edit: Story = {
  args: { block: mockLessonBlockTuesday },
};

export const Submitting: Story = {
  args: { isSubmitting: true },
};

export const PicksTeacherAndSubmits: Story = {
  play: async ({ args }) => {
    const canvas = body();
    await waitFor(() => expect(canvas.getByRole('dialog')).toBeInTheDocument());
    const dialog = within(canvas.getByRole('dialog'));

    // Choose a teacher (weekday + 3:00–6:00 PM window default).
    await userEvent.click(dialog.getByLabelText(/^teacher$/i));
    await userEvent.click(
      await canvas.findByRole('option', { name: mockInstructor.name }),
    );

    await userEvent.click(dialog.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: mockInstructor.id,
          dayOfWeek: 1,
          startMinutes: 15 * 60,
          endMinutes: 18 * 60,
        }),
      );
    });
  },
};
