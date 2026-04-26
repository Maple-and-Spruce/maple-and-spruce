import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import type { GalleryImage } from '@maple/ts/domain';
import { GalleryEditor } from './GalleryEditor';

/**
 * Inline fixtures — pure UI library convention (see ImageUpload.stories.tsx).
 */
const SAMPLE_IMAGES: GalleryImage[] = [
  {
    url: 'https://picsum.photos/seed/g-1/600/400',
    alt: 'Hands shaping wet clay on a wheel',
  },
  {
    url: 'https://picsum.photos/seed/g-2/600/400',
    alt: 'A row of finished bowls cooling on a shelf',
  },
  {
    url: 'https://picsum.photos/seed/g-3/600/400',
    alt: 'Studio bench with tools laid out before class',
  },
];

const FULL_TEN: GalleryImage[] = Array.from({ length: 10 }, (_, i) => ({
  url: `https://picsum.photos/seed/full-${i}/600/400`,
  alt: `Studio scene number ${i + 1}`,
}));

/**
 * Render helper that holds gallery state so the editor behaves like it
 * does in a real form. Without this, alt edits and reorders wouldn't
 * be visible because the component is controlled.
 */
function ControlledGalleryEditor(props: {
  initial: GalleryImage[];
  onUploadFile?: (file: File) => Promise<string>;
  onPickFromPool?: () => void;
  pickFromPoolLabel?: string;
  pickFromPoolDisabled?: boolean;
  pickFromPoolDisabledHint?: string;
  error?: string;
  label?: string;
}) {
  const [images, setImages] = useState<GalleryImage[]>(props.initial);
  return (
    <div style={{ width: 720, padding: 16 }}>
      <GalleryEditor
        value={images}
        onChange={setImages}
        onUploadFile={
          props.onUploadFile ??
          ((file: File) =>
            Promise.resolve(`https://example.com/uploaded/${file.name}`))
        }
        onPickFromPool={props.onPickFromPool}
        pickFromPoolLabel={props.pickFromPoolLabel}
        pickFromPoolDisabled={props.pickFromPoolDisabled}
        pickFromPoolDisabledHint={props.pickFromPoolDisabledHint}
        error={props.error}
        label={props.label}
      />
    </div>
  );
}

const meta = {
  component: GalleryEditor,
  title: 'UI/GalleryEditor',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onChange: fn(),
    onUploadFile: fn().mockImplementation((file: File) =>
      Promise.resolve(`https://example.com/uploaded/${file.name}`)
    ),
  },
} satisfies Meta<typeof GalleryEditor>;

export default meta;
type Story = StoryObj<typeof GalleryEditor>;

/** Empty gallery, prompting the admin to upload their first image. */
export const Empty: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={[]}
      onUploadFile={args.onUploadFile}
      label={args.label}
    />
  ),
};

/** Three images of ten — the typical state mid-curation. */
export const Partial: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={SAMPLE_IMAGES}
      onUploadFile={args.onUploadFile}
      label={args.label}
    />
  ),
};

/** Ten images — upload + pool buttons should be disabled. */
export const AtCapacity: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={FULL_TEN}
      onUploadFile={args.onUploadFile}
      label={args.label}
    />
  ),
};

/** Validation error from the parent's Vest suite (e.g. missing alt text). */
export const WithError: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={SAMPLE_IMAGES}
      onUploadFile={args.onUploadFile}
      error="Every gallery image needs a URL and a description for accessibility"
      label={args.label}
    />
  ),
};

/** ClassForm variant: a category is selected and its pool has images. */
export const WithPoolButton: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={SAMPLE_IMAGES}
      onUploadFile={args.onUploadFile}
      onPickFromPool={fn()}
      pickFromPoolLabel="Add from Fiber Arts pool"
      label={args.label}
    />
  ),
};

/** ClassForm variant: pool button visible but disabled (no category set). */
export const WithPoolButtonDisabled: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={SAMPLE_IMAGES}
      onUploadFile={args.onUploadFile}
      onPickFromPool={fn()}
      pickFromPoolLabel="Add from category pool"
      pickFromPoolDisabled
      pickFromPoolDisabledHint="Select a category to access its image pool"
      label={args.label}
    />
  ),
};

/**
 * Interaction test: edit alt text, remove an image, watch the counter.
 *
 * Skips drag-to-reorder and file upload — both are difficult to drive
 * reliably from Playwright (HTML5 DnD + portal'd file pickers). Those
 * are exercised manually + visually.
 */
export const InteractiveEdit: Story = {
  render: (args) => (
    <ControlledGalleryEditor
      initial={SAMPLE_IMAGES}
      onUploadFile={args.onUploadFile}
      label={args.label}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getByText(/3 \/ 10 images/i)).toBeInTheDocument();
    });

    // Edit the first alt text input — append a tweak.
    const altInputs = canvas.getAllByLabelText(/image description/i);
    expect(altInputs.length).toBe(3);
    await userEvent.click(altInputs[0]);
    await userEvent.keyboard(' (updated)');
    await waitFor(() => {
      expect(altInputs[0]).toHaveValue(
        'Hands shaping wet clay on a wheel (updated)'
      );
    });

    // Remove the second image; count should drop to 2/10.
    const removeButtons = canvas.getAllByRole('button', {
      name: /remove image/i,
    });
    expect(removeButtons.length).toBe(3);
    await userEvent.click(removeButtons[1]);
    await waitFor(() => {
      expect(canvas.getByText(/2 \/ 10 images/i)).toBeInTheDocument();
    });

    // Only two alt inputs remain.
    await waitFor(() => {
      expect(canvas.getAllByLabelText(/image description/i).length).toBe(2);
    });
  },
};
