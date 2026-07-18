import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { EtsyImportDialog } from './EtsyImportDialog';
import {
  mockArtist,
  mockArtist2,
  mockCategoryPottery,
  mockCategoryTextiles,
} from '@maple/react/storybook-fixtures';

const meta = {
  component: EtsyImportDialog,
  title: 'EtsyImport/EtsyImportDialog',
  parameters: { layout: 'centered', a11y: { disable: true } },
  args: {
    onClose: fn(),
    onSubmit: fn().mockResolvedValue(undefined),
    artists: [mockArtist, mockArtist2],
    categories: [mockCategoryPottery, mockCategoryTextiles],
    selectionCount: 3,
    isSubmitting: false,
  },
} satisfies Meta<typeof EtsyImportDialog>;

export default meta;
type Story = StoryObj<typeof EtsyImportDialog>;

const waitForDialog = async () => {
  const canvas = within(document.body);
  await waitFor(
    () => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
    },
    { timeout: 3000 }
  );
  return canvas;
};

export const Closed: Story = {
  args: { open: false },
};

export const OpenWithThreeSelected: Story = {
  args: { open: true, selectionCount: 3 },
};

export const SingleSelection: Story = {
  args: { open: true, selectionCount: 1 },
};

export const Submitting: Story = {
  args: { open: true, isSubmitting: true },
};

export const SubmitBlockedWithoutArtist: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();
    // Button is disabled until artist is chosen.
    const submit = canvas.getByRole('button', { name: /import 3/i });
    expect(submit).toBeDisabled();
    expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const SubmitWithArtistAndDefaults: Story = {
  args: { open: true },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Open the Artist select and pick the first artist.
    const artistSelect = canvas.getByLabelText(/artist/i);
    await userEvent.click(artistSelect);
    const artistOption = await waitFor(() =>
      within(document.body).getByRole('option', { name: mockArtist.name })
    );
    await userEvent.click(artistOption);

    const submit = canvas.getByRole('button', { name: /import 3/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    await userEvent.click(submit);

    await waitFor(() => {
      expect(args.onSubmit).toHaveBeenCalledTimes(1);
      const arg = (args.onSubmit as ReturnType<typeof fn>).mock.calls[0][0];
      expect(arg.artistId).toBe(mockArtist.id);
      expect(arg.status).toBe('active');
      expect(arg.categoryId).toBeUndefined();
      expect(arg.customCommissionRate).toBeUndefined();
    });
  },
};

export const RejectsInvalidCommissionRate: Story = {
  args: { open: true },
  play: async () => {
    const canvas = await waitForDialog();

    const artistSelect = canvas.getByLabelText(/artist/i);
    await userEvent.click(artistSelect);
    const artistOption = await waitFor(() =>
      within(document.body).getByRole('option', { name: mockArtist.name })
    );
    await userEvent.click(artistOption);

    const commissionField = canvas.getByLabelText(/commission override/i);
    await userEvent.type(commissionField, '1.5');

    await waitFor(() => {
      expect(
        canvas.getByText(/must be between 0 and 1/i)
      ).toBeInTheDocument();
    });

    // Submit should be disabled while validation error is live
    const submit = canvas.getByRole('button', { name: /import 3/i });
    expect(submit).toBeDisabled();
  },
};
