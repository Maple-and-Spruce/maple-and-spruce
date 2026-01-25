import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, within, userEvent } from 'storybook/test';
import { SyncConflictDataTable } from './SyncConflictDataTable';
import {
  mockSyncConflicts,
  mockPendingConflicts,
  mockResolvedConflicts,
  mockQuantityMismatchConflict,
  mockPriceMismatchConflict,
  mockMissingExternalConflict,
  mockMissingLocalConflict,
} from '../../../.storybook/fixtures/sync-conflicts';

const meta = {
  component: SyncConflictDataTable,
  title: 'Sync/SyncConflictDataTable',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    onResolve: fn(),
  },
} satisfies Meta<typeof SyncConflictDataTable>;

export default meta;
type Story = StoryObj<typeof SyncConflictDataTable>;

/**
 * Loading state - shows loading skeleton
 */
export const Loading: Story = {
  args: {
    conflictsState: { status: 'loading' },
  },
};

/**
 * Empty state - no conflicts (all in sync)
 */
export const Empty: Story = {
  args: {
    conflictsState: { status: 'success', data: [] },
  },
};

/**
 * With all conflict types - mixed pending and resolved
 */
export const WithConflicts: Story = {
  args: {
    conflictsState: { status: 'success', data: mockSyncConflicts },
  },
};

/**
 * Only pending conflicts - action buttons visible
 */
export const PendingOnly: Story = {
  args: {
    conflictsState: { status: 'success', data: mockSyncConflicts },
    filteredConflicts: mockPendingConflicts,
  },
};

/**
 * Only resolved conflicts - no action buttons
 */
export const ResolvedOnly: Story = {
  args: {
    conflictsState: { status: 'success', data: mockSyncConflicts },
    filteredConflicts: mockResolvedConflicts,
  },
};

/**
 * Quantity mismatch conflicts
 */
export const QuantityMismatch: Story = {
  args: {
    conflictsState: {
      status: 'success',
      data: [mockQuantityMismatchConflict],
    },
  },
};

/**
 * Price mismatch conflicts
 */
export const PriceMismatch: Story = {
  args: {
    conflictsState: {
      status: 'success',
      data: [mockPriceMismatchConflict],
    },
  },
};

/**
 * Missing external conflicts (deleted from Square)
 */
export const MissingExternal: Story = {
  args: {
    conflictsState: {
      status: 'success',
      data: [mockMissingExternalConflict],
    },
  },
};

/**
 * Missing local conflicts (not tracked in Firestore)
 */
export const MissingLocal: Story = {
  args: {
    conflictsState: {
      status: 'success',
      data: [mockMissingLocalConflict],
    },
  },
};

/**
 * Error state - shows error message
 */
export const ErrorState: Story = {
  args: {
    conflictsState: { status: 'error', error: 'Failed to load sync conflicts' },
  },
};

// ============ Interaction Tests ============

/**
 * Click resolve button - opens resolution dialog
 */
export const ClickToResolve: Story = {
  args: {
    conflictsState: { status: 'success', data: mockPendingConflicts },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Wait for the DataGrid to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find all resolve buttons (one per pending row) and click the first one
    const resolveButtons = canvas.getAllByRole('button', { name: /resolve/i });
    expect(resolveButtons.length).toBeGreaterThan(0);
    await userEvent.click(resolveButtons[0]);

    // Verify onResolve was called with the first pending conflict
    expect(args.onResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: mockPendingConflicts[0].id,
        status: 'pending',
      })
    );
  },
};

/**
 * Sort by detected date column
 */
export const SortByDate: Story = {
  args: {
    conflictsState: { status: 'success', data: mockSyncConflicts },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for the DataGrid to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find the "Detected" column header and click to toggle sort
    const detectedHeader = canvas.getByRole('columnheader', { name: /detected/i });
    await userEvent.click(detectedHeader);

    // Verify sort indicator appears (aria-sort attribute changes)
    await expect(detectedHeader).toHaveAttribute('aria-sort');
  },
};

/**
 * Sort by type column
 */
export const SortByType: Story = {
  args: {
    conflictsState: { status: 'success', data: mockSyncConflicts },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for the DataGrid to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Find the "Type" column header and click to sort
    const typeHeader = canvas.getByRole('columnheader', { name: /type/i });
    await userEvent.click(typeHeader);

    // Verify sort indicator appears
    await expect(typeHeader).toHaveAttribute('aria-sort');
  },
};

/**
 * Resolved conflicts don't show resolve button
 */
export const ResolvedNoAction: Story = {
  args: {
    conflictsState: { status: 'success', data: mockResolvedConflicts },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Wait for the DataGrid to render
    await new Promise((resolve) => setTimeout(resolve, 500));

    // There should be no resolve buttons for resolved conflicts
    const resolveButtons = canvas.queryAllByRole('button', { name: /resolve/i });
    expect(resolveButtons.length).toBe(0);
  },
};
