import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import {
  mockContractorNotReady,
  mockContractorReady,
  mockInstructor,
} from '@maple/react/storybook-fixtures';
import { InstructorReadinessChip } from './InstructorReadinessChip';

const meta = {
  title: 'Instructors/InstructorReadinessChip',
  component: InstructorReadinessChip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof InstructorReadinessChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotReady: Story = {
  args: { instructor: mockContractorNotReady },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText(
        'Not ready to teach: missing background check and payment setup'
      )
    ).toHaveTextContent('Not ready');
  },
};

export const ReadyShowsNothing: Story = {
  args: { instructor: mockContractorReady },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Not ready')).not.toBeInTheDocument();
  },
};

export const NotAContractorShowsNothing: Story = {
  args: { instructor: mockInstructor },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Not ready')).not.toBeInTheDocument();
  },
};
