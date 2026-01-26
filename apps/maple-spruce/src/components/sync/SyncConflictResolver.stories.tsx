import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, screen, waitFor } from 'storybook/test';
import { SyncConflictResolver } from './SyncConflictResolver';
import {
  mockQuantityMismatchConflict,
  mockPriceMismatchConflict,
  mockMissingExternalConflict,
  mockMissingLocalConflict,
} from '../../../.storybook/fixtures/sync-conflicts';

const meta = {
  component: SyncConflictResolver,
  title: 'Sync/SyncConflictResolver',
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onClose: fn(),
    onResolve: fn(),
    isResolving: false,
  },
} satisfies Meta<typeof SyncConflictResolver>;

export default meta;
type Story = StoryObj<typeof SyncConflictResolver>;

/**
 * Quantity mismatch - most common conflict type
 */
export const QuantityMismatch: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
};

/**
 * Price mismatch conflict
 */
export const PriceMismatch: Story = {
  args: {
    conflict: mockPriceMismatchConflict,
  },
};

/**
 * Missing external - product deleted from Square
 */
export const MissingExternal: Story = {
  args: {
    conflict: mockMissingExternalConflict,
  },
};

/**
 * Missing local - product exists in Square but not tracked
 */
export const MissingLocal: Story = {
  args: {
    conflict: mockMissingLocalConflict,
  },
};

/**
 * With notes pre-filled
 */
export const WithNotes: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click the Manual resolution button
    const manualButton = screen.getByRole('button', { name: /manual/i });
    await userEvent.click(manualButton);

    // Fill in the notes field
    const notesField = screen.getByRole('textbox', { name: /notes/i });
    await userEvent.type(notesField, 'Counted physical inventory and updated both systems');
  },
};

/**
 * Submitting state - shows loading indicator
 */
export const Submitting: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
    isResolving: true,
  },
};

/**
 * Dialog closed
 */
export const Closed: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
    open: false,
  },
};

// ============ Interaction Tests ============

/**
 * Select "Use Local" resolution
 */
export const SelectUseLocal: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click "Use Local" button
    const useLocalBtn = screen.getByRole('button', { name: /use local/i });
    await userEvent.click(useLocalBtn);

    // Verify it's selected (pressed state)
    await expect(useLocalBtn).toHaveAttribute('aria-pressed', 'true');
  },
};

/**
 * Select "Use Square" resolution
 */
export const SelectUseExternal: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click "Use Square" button
    const useExternalBtn = screen.getByRole('button', { name: /use square/i });
    await userEvent.click(useExternalBtn);

    // Verify it's selected
    await expect(useExternalBtn).toHaveAttribute('aria-pressed', 'true');
  },
};

/**
 * Manual resolution requires notes - shows error when submitting without notes
 */
export const ManualRequiresNotes: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select "Manual" resolution
    const manualBtn = screen.getByRole('button', { name: /manual/i });
    await userEvent.click(manualBtn);

    // Try to submit without notes
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmBtn);

    // Verify error message appears
    await waitFor(() => {
      expect(screen.getByText(/please describe what you did/i)).toBeInTheDocument();
    });
  },
};

/**
 * Manual resolution with notes succeeds
 */
export const ManualWithNotes: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async ({ args }) => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select "Manual" resolution
    const manualBtn = screen.getByRole('button', { name: /manual/i });
    await userEvent.click(manualBtn);

    // Fill in notes
    const notesField = screen.getByRole('textbox', { name: /notes/i });
    await userEvent.type(notesField, 'Fixed manually');

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmBtn);

    // Verify onResolve was called with correct params
    expect(args.onResolve).toHaveBeenCalledWith('manual', 'Fixed manually');
  },
};

/**
 * Submit "Use Local" resolution
 */
export const SubmitUseLocal: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async ({ args }) => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select resolution
    const useLocalBtn = screen.getByRole('button', { name: /use local/i });
    await userEvent.click(useLocalBtn);

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmBtn);

    // Verify onResolve callback was called
    expect(args.onResolve).toHaveBeenCalledWith('use_local', undefined);
  },
};

/**
 * Submit "Use External" with optional notes
 */
export const SubmitWithOptionalNotes: Story = {
  args: {
    conflict: mockPriceMismatchConflict,
  },
  play: async ({ args }) => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Select resolution
    const useExternalBtn = screen.getByRole('button', { name: /use square/i });
    await userEvent.click(useExternalBtn);

    // Add optional notes
    const notesField = screen.getByRole('textbox', { name: /notes/i });
    await userEvent.type(notesField, 'Price was updated in Square');

    // Click confirm
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await userEvent.click(confirmBtn);

    // Verify onResolve callback was called with notes
    expect(args.onResolve).toHaveBeenCalledWith('use_external', 'Price was updated in Square');
  },
};

/**
 * Cancel closes the dialog
 */
export const CancelClosesDialog: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async ({ args }) => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);

    // Verify onClose was called
    expect(args.onClose).toHaveBeenCalled();
  },
};

/**
 * Confirm button disabled until resolution selected
 */
export const ConfirmDisabledWithoutSelection: Story = {
  args: {
    conflict: mockQuantityMismatchConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Confirm button should be disabled initially
    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    await expect(confirmBtn).toBeDisabled();
  },
};

/**
 * Missing local hides "Use Local" option
 */
export const MissingLocalHidesUseLocal: Story = {
  args: {
    conflict: mockMissingLocalConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // "Use Local" button should not exist for missing_local conflicts
    const useLocalBtn = screen.queryByRole('button', { name: /use local/i });
    expect(useLocalBtn).not.toBeInTheDocument();

    // But "Use Square" should exist
    const useExternalBtn = screen.getByRole('button', { name: /use square/i });
    await expect(useExternalBtn).toBeInTheDocument();
  },
};

/**
 * Missing external hides "Use Square" option
 */
export const MissingExternalHidesUseExternal: Story = {
  args: {
    conflict: mockMissingExternalConflict,
  },
  play: async () => {
    // MUI Dialog renders in a portal, use screen to query the whole document
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // "Use Square" button should not exist for missing_external conflicts
    const useExternalBtn = screen.queryByRole('button', { name: /use square/i });
    expect(useExternalBtn).not.toBeInTheDocument();

    // But "Use Local" should exist
    const useLocalBtn = screen.getByRole('button', { name: /use local/i });
    await expect(useLocalBtn).toBeInTheDocument();
  },
};
