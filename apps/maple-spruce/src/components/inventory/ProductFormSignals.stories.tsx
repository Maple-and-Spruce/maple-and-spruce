import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, waitFor } from 'storybook/test';
import { ProductFormSignals } from './ProductFormSignals';
import {
  mockProduct,
  mockArtists,
  mockCategories,
} from '../../../.storybook/fixtures';

const meta = {
  component: ProductFormSignals,
  title: 'Inventory/ProductFormSignals',
  parameters: {
    layout: 'centered',
    // Disable a11y for these tests to focus on interaction testing
    a11y: { disable: true },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
    artists: mockArtists,
    categories: mockCategories,
  },
} satisfies Meta<typeof ProductFormSignals>;

/**
 * Helper to get the dialog content which renders in a portal (document.body)
 */
const getDialogCanvas = () => within(document.body);

/**
 * Helper to wait for dialog to be fully rendered with form content
 */
const waitForDialog = async () => {
  const canvas = getDialogCanvas();
  await waitFor(() => {
    // Wait for both dialog and form content to be present
    expect(canvas.getByRole('dialog')).toBeInTheDocument();
    expect(canvas.getByLabelText(/product name/i)).toBeInTheDocument();
  });
  return canvas;
};

export default meta;
type Story = StoryObj<typeof ProductFormSignals>;

// ============================================================
// VISUAL STORIES (for Chromatic snapshots)
// ============================================================

/**
 * Dialog is closed (not visible)
 */
export const Closed: Story = {
  args: {
    open: false,
    isSubmitting: false,
  },
};

/**
 * Create new product - empty form
 */
export const CreateNew: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
};

/**
 * Edit existing product - form pre-filled
 */
export const EditExisting: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: false,
  },
};

/**
 * Form is submitting - buttons disabled
 */
export const Submitting: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: true,
  },
};

// ============================================================
// INTERACTION TESTS (play functions)
// ============================================================

/**
 * Test: Shows validation errors when submitting empty form
 *
 * This test verifies the signals-based validation:
 * 1. Initially no errors shown
 * 2. Click Add button
 * 3. Validation errors appear for required fields
 */
export const ValidationErrorsOnEmptySubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Initially, no error messages should be visible
    // (errors only show after first submit attempt)
    const nameInput = canvas.getByLabelText(/product name/i);
    expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');

    // Click the Add button to trigger validation
    const addButton = canvas.getByRole('button', { name: /add/i });
    await userEvent.click(addButton);

    // Now validation errors should appear
    // Name field should show error
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    // onSubmit should NOT have been called (form is invalid)
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/**
 * Test: Errors clear as user types
 *
 * Demonstrates the key benefit of signals-based validation:
 * errors update automatically as the user types.
 */
export const ErrorsClearOnInput: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Trigger validation by clicking Add
    const addButton = canvas.getByRole('button', { name: /add/i });
    await userEvent.click(addButton);

    // Name field should have error
    const nameInput = canvas.getByLabelText(/product name/i);
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    // Type a valid name
    await userEvent.type(nameInput, 'Handmade Pottery Bowl');

    // Error should be cleared automatically (no manual clearing needed!)
    await expect(nameInput).not.toHaveAttribute('aria-invalid', 'true');
  },
};

/**
 * Test: Fill form and submit successfully
 *
 * Complete flow: fill all required fields, submit, verify callback.
 */
export const FillAndSubmit: Story = {
  args: {
    open: true,
    isSubmitting: false,
    onSubmit: fn().mockResolvedValue(undefined),
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Fill in product name
    const nameInput = canvas.getByLabelText(/product name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Handmade Pottery Bowl');

    // Select an artist from dropdown
    // MUI Select renders as a combobox - find it by looking for comboboxes then selecting the first one
    // which should be the Artist select (appears before Category select in the form)
    const comboboxes = canvas.getAllByRole('combobox');
    const artistCombobox = comboboxes[0]; // First combobox is the Artist select
    await userEvent.click(artistCombobox);
    // Select first active artist option from the dropdown
    const artistOption = await canvas.findByRole('option', {
      name: /sarah johnson/i,
    });
    await userEvent.click(artistOption);

    // Fill in price
    const priceInput = canvas.getByLabelText(/price/i);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '45.00');

    // Fill in quantity
    const quantityInput = canvas.getByLabelText(/quantity/i);
    await userEvent.clear(quantityInput);
    await userEvent.type(quantityInput, '5');

    // Submit the form
    const addButton = canvas.getByRole('button', { name: /add/i });
    await userEvent.click(addButton);

    // Verify onSubmit was called
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);

    // Verify the submitted data structure
    const submittedData = (args.onSubmit as ReturnType<typeof fn>).mock
      .calls[0][0];
    await expect(submittedData).toMatchObject({
      name: 'Handmade Pottery Bowl',
      artistId: expect.any(String),
      priceCents: 4500, // $45.00 converted to cents
      quantity: 5,
      status: 'active',
    });
  },
};

/**
 * Test: Cancel button closes dialog
 */
export const CancelClosesDialog: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async ({ args }) => {
    const canvas = await waitForDialog();

    // Click cancel
    const cancelButton = canvas.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelButton);

    // Verify onClose was called
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

/**
 * Test: Edit mode pre-fills form with product data
 */
export const EditModePreFillsData: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Verify form is pre-filled with product data
    const nameInput = canvas.getByLabelText(
      /product name/i
    ) as HTMLInputElement;
    await expect(nameInput.value).toBe(mockProduct.squareCache.name);

    // Verify price is converted from cents to dollars
    const priceInput = canvas.getByLabelText(/price/i) as HTMLInputElement;
    const expectedPrice = (mockProduct.squareCache.priceCents / 100).toString();
    await expect(priceInput.value).toBe(expectedPrice);

    // Verify quantity
    const quantityInput = canvas.getByLabelText(
      /quantity/i
    ) as HTMLInputElement;
    await expect(quantityInput.value).toBe(
      mockProduct.squareCache.quantity.toString()
    );

    // Button should say "Update" not "Add"
    const updateButton = canvas.getByRole('button', { name: /update/i });
    await expect(updateButton).toBeInTheDocument();
  },
};

/**
 * Test: Commission rate field accepts percentage input
 */
export const CommissionRateInput: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Find commission rate input
    const commissionInput = canvas.getByLabelText(/custom commission rate/i);

    // Enter 35%
    await userEvent.type(commissionInput, '35');

    // Verify value (should be stored as percentage for display)
    await expect(commissionInput).toHaveValue(35);
  },
};

// ============================================================
// IMAGE UPLOAD ON CREATE STORIES
// ============================================================

/**
 * Create mode shows image upload component (not the old "add after creation" alert)
 *
 * This verifies the UX improvement where users can select an image
 * during product creation, not just when editing.
 */
export const CreateModeShowsImageUpload: Story = {
  args: {
    open: true,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // The ImageUpload component should be present with its drop zone
    // Look for the upload area text (not the old "can be added after creation" alert)
    const uploadArea = canvas.getByText(/drag.*drop|click to upload/i);
    await expect(uploadArea).toBeInTheDocument();

    // The old info alert should NOT be present
    const alerts = canvas.queryAllByRole('alert');
    const addAfterCreationAlert = alerts.find((alert) =>
      alert.textContent?.includes('after creation')
    );
    await expect(addAfterCreationAlert).toBeUndefined();
  },
};

/**
 * Edit mode also shows image upload (existing behavior preserved)
 */
export const EditModeShowsImageUpload: Story = {
  args: {
    open: true,
    product: mockProduct,
    isSubmitting: false,
  },
  play: async () => {
    const canvas = await waitForDialog();

    // Should show the existing image from the product
    const existingImage = canvas.getByRole('img');
    await expect(existingImage).toBeInTheDocument();
    await expect(existingImage).toHaveAttribute(
      'src',
      expect.stringContaining('picsum')
    );
  },
};
