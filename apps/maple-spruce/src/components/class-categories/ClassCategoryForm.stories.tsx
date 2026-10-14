import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent, waitFor } from 'storybook/test';
import { ClassCategoryForm } from './ClassCategoryForm';
import { mockClassCategoryWithDefaults } from '@maple/react/storybook-fixtures';

const meta = {
  component: ClassCategoryForm,
  title: 'Class Categories/ClassCategoryForm',
  parameters: {
    layout: 'centered',
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    open: true,
    nextOrder: 30,
  },
} satisfies Meta<typeof ClassCategoryForm>;

export default meta;
type Story = StoryObj<typeof ClassCategoryForm>;

/** The dialog renders in a portal, so query the whole document. */
const waitForDialog = async () => {
  const canvas = within(document.body);
  await waitFor(() => {
    expect(canvas.getByRole('dialog')).toBeInTheDocument();
    expect(canvas.getByLabelText(/category name/i)).toBeInTheDocument();
  });
  return canvas;
};

/** Create a category with both material defaults filled in. */
export const CreateWithMaterialDefaults: Story = {
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    await userEvent.type(canvas.getByLabelText(/category name/i), 'Test Craft');
    await userEvent.type(
      canvas.getByRole('textbox', { name: /default materials included/i }),
      'Paper and glue'
    );
    await userEvent.type(
      canvas.getByRole('textbox', { name: /default what to bring/i }),
      'An apron'
    );

    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Craft',
          defaultMaterialsIncluded: 'Paper and glue',
          defaultWhatToBring: 'An apron',
        })
      )
    );
  },
};

/** Editing loads the saved defaults, and clearing one sends '' to clear it. */
export const EditClearsADefault: Story = {
  args: {
    category: mockClassCategoryWithDefaults,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    const materials = canvas.getByRole('textbox', {
      name: /default materials included/i,
    });
    const bring = canvas.getByRole('textbox', {
      name: /default what to bring/i,
    });
    await waitFor(() =>
      expect(materials).toHaveValue('Clay, glazes, and two firings')
    );
    expect(bring).toHaveValue('Clothes that can get muddy');

    await userEvent.clear(bring);
    await userEvent.click(canvas.getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultMaterialsIncluded: 'Clay, glazes, and two firings',
          defaultWhatToBring: '',
        })
      )
    );
  },
};
