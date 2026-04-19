import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { EtsyImportTable } from './EtsyImportTable';
import {
  mockEtsyListings,
  mockEtsyListingAvailable,
  mockEtsyListingImported,
  mockEtsyListingMultiVariant,
} from '../../../.storybook/fixtures';

const meta = {
  component: EtsyImportTable,
  title: 'EtsyImport/EtsyImportTable',
  parameters: { layout: 'fullscreen' },
  args: {
    selection: [],
    onSelectionChange: fn(),
    loading: false,
    hideImported: true,
  },
} satisfies Meta<typeof EtsyImportTable>;

export default meta;
type Story = StoryObj<typeof EtsyImportTable>;

export const Empty: Story = {
  args: { rows: [] },
};

export const Loading: Story = {
  args: { rows: [], loading: true },
};

export const OnlyAvailable: Story = {
  args: { rows: [mockEtsyListingAvailable] },
};

export const MixOfStates: Story = {
  args: { rows: mockEtsyListings, hideImported: false },
};

export const HideImportedEnabled: Story = {
  args: { rows: mockEtsyListings, hideImported: true },
};

export const MultiVariantDisabled: Story = {
  args: {
    rows: [mockEtsyListingAvailable, mockEtsyListingMultiVariant],
    hideImported: false,
  },
};

export const AllImported: Story = {
  args: {
    rows: [mockEtsyListingImported],
    hideImported: false,
  },
};
