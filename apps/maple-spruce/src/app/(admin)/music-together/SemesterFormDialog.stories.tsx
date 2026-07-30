import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor, fireEvent } from 'storybook/test';
import type { MusicTogetherSemester } from '@maple/ts/domain';
import { SemesterFormDialog } from './SemesterFormDialog';

// The dialog renders in a portal, so query document.body.
const dialog = () => within(document.body);
async function waitForDialog() {
  const canvas = dialog();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeInTheDocument(), {
    timeout: 5000,
  });
  return canvas;
}

const mockSemester: MusicTogetherSemester = {
  id: 'sem-1',
  name: 'Winter 2026–2027',
  season: 'winter',
  year: 2026,
  startDate: new Date('2026-12-03T00:00:00'),
  endDate: new Date('2027-02-18T00:00:00'),
  weeks: 10,
  breaks: [
    {
      label: 'Holiday break',
      startDate: new Date('2026-12-18T00:00:00'),
      endDate: new Date('2027-01-06T00:00:00'),
    },
  ],
  weatherMakeupDates: [
    new Date('2027-02-25T00:00:00'),
    new Date('2027-03-04T00:00:00'),
  ],
  enrollmentOpensAt: new Date('2026-11-12T00:00:00'),
  notes: 'Two snow makeup days built in.',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const meta = {
  component: SemesterFormDialog,
  title: 'MusicTogether/SemesterFormDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof SemesterFormDialog>;

export default meta;
type Story = StoryObj<typeof SemesterFormDialog>;

/** New semester — season Fall, 10 weeks prefilled, planned. */
export const Create: Story = {};

/** Editing a term — dates, a break, and weather makeup dates populated. */
export const Edit: Story = {
  args: { semester: mockSemester },
};

export const Submitting: Story = {
  args: { semester: mockSemester, isSubmitting: true },
};

// ============================================================
// INTERACTIONS (exercised automatically in CI)
// ============================================================

/** Fill the name and submit — builds the right CreateMusicTogetherSemesterInput. */
export const CreateSubmits: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(canvas.getByLabelText(/semester name/i), 'Fall 2026');

    const save = canvas.getByRole('button', { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fall 2026',
          season: 'fall',
          weeks: 10,
        })
      )
    );
  },
};

/** Choosing Summer prefills the week count to 6 (season default). */
export const SeasonPrefillsWeeks: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(canvas.getByLabelText(/semester name/i), 'Summer 2027');

    // Open the Season select and pick Summer.
    await userEvent.click(canvas.getByRole('combobox', { name: /season/i }));
    await userEvent.click(canvas.getByRole('option', { name: 'Summer' }));

    await userEvent.click(canvas.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ season: 'summer', weeks: 6 })
      )
    );
  },
};

/** Save stays disabled until a name is entered. */
export const SaveDisabledWithoutName: Story = {
  play: async () => {
    const canvas = await waitForDialog();
    await expect(canvas.getByRole('button', { name: /save/i })).toBeDisabled();
  },
};

/** Cancel closes without submitting. */
export const CancelCloses: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(canvas.getByRole('button', { name: /cancel/i }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Adds a break and a weather makeup date, edits them, and removes both —
 * exercising the dynamic-list add/edit/remove handlers.
 */
export const EditsBreaksAndWeatherDates: Story = {
  play: async () => {
    const canvas = await waitForDialog();

    // Add + edit a break.
    await userEvent.click(canvas.getByRole('button', { name: /add break/i }));
    const breakLabel = canvas.getByLabelText(/break 1 label/i);
    await userEvent.type(breakLabel, 'Holiday break');
    await expect(breakLabel).toHaveValue('Holiday break');
    fireEvent.change(canvas.getByLabelText(/break 1 start/i), {
      target: { value: '2026-12-18' },
    });

    // Add + edit a weather makeup date.
    await userEvent.click(canvas.getByRole('button', { name: /add date/i }));
    fireEvent.change(canvas.getByLabelText('Weather makeup date 1'), {
      target: { value: '2027-02-25' },
    });

    // Remove both.
    await userEvent.click(
      canvas.getByRole('button', { name: /remove weather makeup date 1/i })
    );
    await userEvent.click(
      canvas.getByRole('button', { name: /remove break 1/i })
    );
    await expect(canvas.queryByLabelText(/break 1 label/i)).toBeNull();
  },
};

/**
 * Regression: removing a semester's only break must submit `breaks: []`, not
 * `undefined` — otherwise the partial update omits the field and the deleted
 * break stays stranded in Firestore ("the edit didn't save").
 */
export const ClearingABreakSubmitsEmptyArray: Story = {
  args: { semester: mockSemester },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    await userEvent.click(
      canvas.getByRole('button', { name: /remove break 1/i })
    );
    await expect(canvas.queryByLabelText(/break 1 label/i)).toBeNull();
    const save = canvas.getByRole('button', { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ breaks: [] })
      )
    );
  },
};

/** Touch every field, then submit — exercises each field's change handler. */
export const FillsAllFields: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(canvas.getByLabelText(/semester name/i), 'Spring 2027');

    const year = canvas.getByLabelText('Year');
    await userEvent.clear(year);
    await userEvent.type(year, '2027');

    const weeks = canvas.getByLabelText('Weeks');
    await userEvent.clear(weeks);
    await userEvent.type(weeks, '10');

    fireEvent.change(canvas.getByLabelText('Start date'), {
      target: { value: '2027-03-11' },
    });
    fireEvent.change(canvas.getByLabelText('End date'), {
      target: { value: '2027-05-13' },
    });
    fireEvent.change(canvas.getByLabelText(/re-enrollment opens/i), {
      target: { value: '2027-02-18' },
    });
    await userEvent.type(canvas.getByLabelText('Notes'), 'Spring term.');

    await userEvent.click(canvas.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spring 2027',
          year: 2027,
          weeks: 10,
          notes: 'Spring term.',
        })
      )
    );
  },
};

/** A failing submit surfaces the error message (handleSubmit catch path). */
export const SubmitShowsError: Story = {
  args: {
    onSubmit: fn(() => Promise.reject(new Error('Save failed on the server'))),
  },
  play: async () => {
    const canvas = await waitForDialog();
    await userEvent.type(canvas.getByLabelText(/semester name/i), 'Fall 2026');
    await userEvent.click(canvas.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(canvas.getByText(/save failed on the server/i)).toBeInTheDocument()
    );
  },
};
