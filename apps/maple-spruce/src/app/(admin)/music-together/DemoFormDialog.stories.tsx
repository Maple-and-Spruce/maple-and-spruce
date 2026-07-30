import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { MusicTogetherDemo } from '@maple/ts/domain';
import { DemoFormDialog } from './DemoFormDialog';

// The dialog renders in a portal, so query document.body.
const dialog = () => within(document.body);
async function waitForDialog() {
  const canvas = dialog();
  await waitFor(() => expect(canvas.getByRole('dialog')).toBeInTheDocument(), {
    timeout: 5000,
  });
  return canvas;
}

const mockDemo: MusicTogetherDemo = {
  id: 'demo-1',
  dateTime: new Date('2030-08-03T14:00:00Z'),
  location: 'Morgantown Public Library',
  capacityFamilies: 8,
  durationMinutes: 45,
  notes: 'Bring a shaker!',
  visible: true,
  createdAt: new Date('2030-07-01T00:00:00Z'),
};

const meta = {
  component: DemoFormDialog,
  title: 'MusicTogether/DemoFormDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof DemoFormDialog>;

export default meta;
type Story = StoryObj<typeof DemoFormDialog>;

/** New demo — capacity prefilled to 8, hidden by default. */
export const Create: Story = {};

/** Editing an existing demo — all fields populated. */
export const Edit: Story = {
  args: { demo: mockDemo },
};

export const Submitting: Story = {
  args: { demo: mockDemo, isSubmitting: true },
};

// ============================================================
// INTERACTIONS (exercised automatically in CI)
// ============================================================

/**
 * Fill the required date + location and submit — asserts the form builds the
 * right CreateMusicTogetherDemoInput.
 */
export const CreateSubmits: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    const dateInput = canvas.getByLabelText(/demo date and time/i);
    await userEvent.type(dateInput, '2030-08-03T10:00');
    const locationInput = canvas.getByLabelText(/^location/i);
    await userEvent.type(locationInput, 'Morgantown Public Library');

    const save = canvas.getByRole('button', { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          location: 'Morgantown Public Library',
          capacityFamilies: 8,
          visible: false,
        })
      )
    );
  },
};

/** Save stays disabled until a date + location are entered. */
export const SaveDisabledWhenIncomplete: Story = {
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
