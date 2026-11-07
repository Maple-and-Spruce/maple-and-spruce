import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { applyAgreementVariables, type AgreementSection } from '@maple/ts/domain';
import { PrintableAgreement } from './PrintableAgreement';

const template: AgreementSection[] = [
  {
    id: 'contractor',
    title: '1. Independent contractor',
    content: '<p>By initialing each statement below, you acknowledge that you:</p>',
    responseType: 'acknowledgment',
    acknowledgmentItems: [
      'Provide services as an independent contractor.',
      'Will not be treated as an employee.',
      "Will not receive workers' compensation or unemployment benefits through Maple & Spruce.",
      'Are responsible for your own income taxes, and nothing will be withheld.',
      'Are responsible for your own supplies and expenses.',
    ],
  },
  {
    id: 'pay',
    title: '3. Pay',
    content: '<p>You receive {{instructorSharePercent}}% of what students pay; we keep {{studioSharePercent}}%.</p>',
  },
  {
    id: 'safety',
    title: '6. Safety and conduct',
    content: '<p>Follow the posted studio rules.</p>',
    responseType: 'acknowledgment',
  },
];

const meta = {
  title: 'Agreements/PrintableAgreement',
  component: PrintableAgreement,
  parameters: { layout: 'padded' },
  args: {
    templateName: 'Class Instructor Agreement (1099)',
    sections: applyAgreementVariables(template, {
      instructorSharePercent: '75',
      studioSharePercent: '25',
    }).sections,
    signerName: 'Robin Ashfield',
  },
} satisfies Meta<typeof PrintableAgreement>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each acknowledgment is its own initial line; the pay split is filled in. */
export const ContractorAgreement: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/prepared for robin ashfield/i)).toBeInTheDocument();
    await expect(canvas.getAllByTestId('initial-line')).toHaveLength(6);
    await expect(
      canvas.getByText(/you receive 75% of what students pay; we keep 25%/i)
    ).toBeInTheDocument();
    await expect(canvas.getByText(/for maple & spruce folk arts collective llc/i)).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain('{{');
  },
};
