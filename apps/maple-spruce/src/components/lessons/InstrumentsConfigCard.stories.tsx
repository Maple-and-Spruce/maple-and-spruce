import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { DEFAULT_INSTRUMENT_OPTIONS } from '@maple/ts/domain';
import { InstrumentsConfigCard } from './InstrumentsConfigCard';

const meta = {
  title: 'Settings/InstrumentsConfigCard',
  component: InstrumentsConfigCard,
  parameters: { layout: 'padded' },
  args: {
    instrumentsState: { status: 'success', data: DEFAULT_INSTRUMENT_OPTIONS },
    isSaving: false,
    onSave: fn(async () => undefined),
  },
} satisfies Meta<typeof InstrumentsConfigCard>;
export default meta;
type Story = StoryObj<typeof InstrumentsConfigCard>;

/** The studio's four, and nothing to save until something changes. */
export const TheStudiosInstruments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const label of ['Violin', 'Fiddle', 'Guitar', 'Harp']) {
      await expect(canvas.getByDisplayValue(label)).toBeInTheDocument();
    }
    await expect(
      canvas.getByRole('button', { name: 'Save instruments' })
    ).toBeDisabled();
  },
};

/** Adding one makes its key from the name; renaming keeps the key. */
export const AddAndRename: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Add an instrument'), 'Mountain Dulcimer{Enter}');
    const fiddle = canvas.getByLabelText('Name of fiddle');
    await userEvent.clear(fiddle);
    await userEvent.type(fiddle, 'Old-Time Fiddle');
    await userEvent.click(canvas.getByRole('button', { name: 'Save instruments' }));

    await expect(args.onSave).toHaveBeenCalledWith([
      { key: 'violin', label: 'Violin' },
      { key: 'fiddle', label: 'Old-Time Fiddle' },
      { key: 'guitar', label: 'Guitar' },
      { key: 'harp', label: 'Harp' },
      { key: 'mountain-dulcimer', label: 'Mountain Dulcimer' },
    ]);
    await expect(await canvas.findByText('Saved.')).toBeInTheDocument();
  },
};

export const RemoveOne: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Guitar' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save instruments' }));
    await expect(args.onSave).toHaveBeenCalledWith([
      { key: 'violin', label: 'Violin' },
      { key: 'fiddle', label: 'Fiddle' },
      { key: 'harp', label: 'Harp' },
    ]);
  },
};

/** A list that cannot be saved says why, and cannot be saved. */
export const DuplicateIsRefused: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Add an instrument'), 'Violin{Enter}');
    await expect(canvas.getByText(/listed twice/)).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Save instruments' })
    ).toBeDisabled();
  },
};

export const SaveFails: Story = {
  args: {
    onSave: fn(async () => {
      throw new Error('Keep at least one instrument.');
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove Harp' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save instruments' }));
    await expect(
      await canvas.findByText('Keep at least one instrument.')
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { instrumentsState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Save instruments' })
    ).not.toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  args: { instrumentsState: { status: 'error', error: 'network down' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Could not load instruments: network down')
    ).toBeInTheDocument();
  },
};
