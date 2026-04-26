import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { GalleryImage } from '@maple/ts/domain';
import { CategoryGalleryPickerDialog } from './CategoryGalleryPickerDialog';

const POOL: GalleryImage[] = [
  {
    url: 'https://picsum.photos/seed/pool-1/600/400',
    alt: 'Hands at the loom weaving a pattern',
  },
  {
    url: 'https://picsum.photos/seed/pool-2/600/400',
    alt: 'Yarn skeins in earthy natural-dyed tones',
  },
  {
    url: 'https://picsum.photos/seed/pool-3/600/400',
    alt: 'Finished tapestry hanging in the studio',
  },
  {
    url: 'https://picsum.photos/seed/pool-4/600/400',
    alt: 'Close-up of a rigid heddle threaded for warp',
  },
];

const meta = {
  component: CategoryGalleryPickerDialog,
  title: 'Classes/CategoryGalleryPickerDialog',
  parameters: {
    layout: 'fullscreen',
    a11y: { disable: true },
  },
  args: {
    open: true,
    categoryName: 'Fiber Arts',
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof CategoryGalleryPickerDialog>;

export default meta;
type Story = StoryObj<typeof CategoryGalleryPickerDialog>;

/** MUI Dialog portals out of the canvas — query document.body. */
const dialog = () => within(document.body);

/** Pool is empty — admin needs to upload pool images first. */
export const EmptyPool: Story = {
  args: {
    pool: [],
    alreadyAdded: new Set<string>(),
    remainingCapacity: 10,
  },
};

/** Full pool, nothing already added, plenty of capacity. */
export const Populated: Story = {
  args: {
    pool: POOL,
    alreadyAdded: new Set<string>(),
    remainingCapacity: 10,
  },
};

/** Two pool images already in the gallery — they show as checked + disabled. */
export const WithSomeAlreadyAdded: Story = {
  args: {
    pool: POOL,
    alreadyAdded: new Set<string>([POOL[0].url, POOL[2].url]),
    remainingCapacity: 8,
  },
};

/** Only one slot left — selecting a second should surface the over-capacity warning. */
export const AtCapacityRemaining: Story = {
  args: {
    pool: POOL,
    alreadyAdded: new Set<string>(),
    remainingCapacity: 1,
  },
};

/**
 * Interaction test: pick two pool images and confirm.
 *
 * Verifies the dialog enables/disables the confirm button correctly and
 * fires `onConfirm` with the matching `GalleryImage` objects.
 */
export const SelectAndConfirm: Story = {
  args: {
    pool: POOL,
    alreadyAdded: new Set<string>(),
    remainingCapacity: 10,
  },
  play: async ({ args }) => {
    const canvas = dialog();

    await waitFor(() => {
      expect(canvas.getByRole('dialog')).toBeInTheDocument();
    });

    // Confirm button is initially disabled (nothing selected).
    const confirmInitial = canvas.getByRole('button', { name: /add .*image/i });
    expect(confirmInitial).toBeDisabled();

    // Select the first two pool images via their checkboxes.
    const checkboxes = canvas.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(POOL.length);
    await userEvent.click(checkboxes[0]);
    await userEvent.click(checkboxes[1]);

    // Confirm button should now read "Add 2 images" and be enabled.
    await waitFor(() => {
      expect(
        canvas.getByRole('button', { name: /add 2 images/i })
      ).toBeEnabled();
    });

    await userEvent.click(
      canvas.getByRole('button', { name: /add 2 images/i })
    );

    await waitFor(() => {
      expect(args.onConfirm).toHaveBeenCalledTimes(1);
    });

    const picks = (args.onConfirm as ReturnType<typeof fn>).mock.calls[0][0];
    expect(picks).toHaveLength(2);
    expect(picks[0].url).toBe(POOL[0].url);
    expect(picks[1].url).toBe(POOL[1].url);
  },
};
