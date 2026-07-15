import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { MusicTogetherSection } from '@maple/ts/domain';
import { SectionFormDialog } from './SectionFormDialog';

// The dialog renders in a portal, so query document.body.
const dialog = () => within(document.body);
async function waitForDialog() {
  const canvas = dialog();
  await waitFor(
    () => expect(canvas.getByRole('dialog')).toBeInTheDocument(),
    { timeout: 5000 }
  );
  return canvas;
}

const mockSection: MusicTogetherSection = {
  id: 'sec-1',
  name: 'Spring 2026 — Tuesdays 10am',
  description: 'A joyful early-childhood music term.',
  sessions: [
    { dateTime: new Date('2030-04-02T14:00:00Z') },
    { dateTime: new Date('2030-04-09T14:00:00Z') },
  ],
  capacityFamilies: 8,
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2030-04-02T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2030-04-30T14:00:00Z') },
  ],
  visible: true,
  enrollmentActive: true,
  location: 'Studio',
  room: 'spruce',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-01T00:00:00Z'),
};

const meta = {
  component: SectionFormDialog,
  title: 'MusicTogether/SectionFormDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    open: true,
    onClose: fn(),
    onSubmit: fn(),
    isSubmitting: false,
  },
} satisfies Meta<typeof SectionFormDialog>;

export default meta;
type Story = StoryObj<typeof SectionFormDialog>;

/** New section — defaults prefilled ($252 full, capacity 8), empty schedule. */
export const Create: Story = {};

/** Editing an existing section — all fields + a 2× installment plan populated. */
export const Edit: Story = {
  args: { section: mockSection },
};

export const Submitting: Story = {
  args: { section: mockSection, isSubmitting: true },
};

// ============================================================
// INTERACTIONS (exercised automatically in CI)
// ============================================================

/**
 * Fill the required name and submit — asserts the form builds the right
 * CreateMusicTogetherSectionInput (prefilled defaults: $252 full, cap 8, draft).
 */
export const CreateSubmits: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    const nameInput = canvas.getByLabelText(/section name/i);
    await userEvent.type(nameInput, 'Fall 2026');

    const save = canvas.getByRole('button', { name: /save/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fall 2026',
          visible: false,
          enrollmentActive: false,
          capacityFamilies: 8,
          priceFullCents: 25200,
          sessions: [],
        })
      )
    );
  },
};

/** Save stays disabled until a name is entered (required-field guard). */
export const SaveDisabledWithoutName: Story = {
  play: async () => {
    const canvas = await waitForDialog();
    await expect(
      canvas.getByRole('button', { name: /save/i })
    ).toBeDisabled();
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
