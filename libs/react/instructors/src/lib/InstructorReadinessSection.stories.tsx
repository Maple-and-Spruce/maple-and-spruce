import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import {
  mockContractorNotReady,
  mockContractorReady,
  mockInstructorMinimal,
} from '@maple/react/storybook-fixtures';
import { InstructorReadinessSection } from './InstructorReadinessSection';
import { readinessFormValuesFrom, type ReadinessFormValues } from './readiness-form';

/**
 * Stateful wrapper so the play functions can drive the section the way the
 * form does: every change patches the values and re-renders.
 */
function Harness({
  initial,
  onChange,
}: {
  initial: ReadinessFormValues;
  onChange?: (patch: Partial<ReadinessFormValues>) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <div style={{ width: 560 }}>
      <InstructorReadinessSection
        values={values}
        onChange={(patch) => {
          onChange?.(patch);
          setValues((v) => ({ ...v, ...patch }));
        }}
      />
    </div>
  );
}

const meta = {
  title: 'Instructors/InstructorReadinessSection',
  component: Harness,
  parameters: { layout: 'centered' },
  args: { onChange: fn() },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A contractor with nothing recorded: every item is listed as missing. */
export const NothingRecorded: Story = {
  args: { initial: readinessFormValuesFrom() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        /missing contractor agreement, background check and payment setup/i
      )
    ).toBeInTheDocument();
    await expect(canvas.getByRole('switch', { name: /paid contractor/i })).toBeChecked();
  },
};

/** Agreement signed; background check and payment still outstanding. */
export const PartlyRecorded: Story = {
  args: { initial: readinessFormValuesFrom(mockContractorNotReady) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/missing background check and payment setup/i)
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText(/date signed/i)).toHaveValue('2026-09-20');
  },
};

/** Every item recorded. */
export const Ready: Story = {
  args: { initial: readinessFormValuesFrom(mockContractorReady) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/ready to teach/i)).toBeInTheDocument();
    await expect(canvas.queryByText(/not ready/i)).not.toBeInTheDocument();
  },
};

/** Staff or an unpaid instructor: nothing is tracked, so nothing is shown. */
export const NotAContractor: Story = {
  args: { initial: readinessFormValuesFrom(mockInstructorMinimal) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('switch', { name: /paid contractor/i })
    ).not.toBeChecked();
    await expect(canvas.queryByLabelText(/date cleared/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/not ready/i)).not.toBeInTheDocument();
  },
};

/** Recording the two outstanding items flips the status to ready. */
export const CompletingOnboarding: Story = {
  args: { initial: readinessFormValuesFrom(mockContractorNotReady) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    fireEvent.change(canvas.getByLabelText(/date cleared/i), {
      target: { value: '2026-09-27' },
    });
    await expect(
      canvas.getByText(/missing payment setup/i)
    ).toBeInTheDocument();

    fireEvent.change(canvas.getByLabelText(/date completed/i), {
      target: { value: '2026-09-28' },
    });
    await userEvent.click(canvas.getByLabelText(/how they're paid/i));
    await userEvent.click(body.getByRole('option', { name: /w-9 on file/i }));

    await expect(canvas.getByText(/ready to teach/i)).toBeInTheDocument();
    await expect(args.onChange).toHaveBeenCalledWith({
      paymentSetupMethod: 'w9-on-file',
    });
  },
};

/** Turning the switch off hides the checklist. */
export const TogglingContractorOff: Story = {
  args: { initial: readinessFormValuesFrom() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: /paid contractor/i }));
    await expect(args.onChange).toHaveBeenCalledWith({ isContractor: false });
    await expect(canvas.queryByLabelText(/date signed/i)).not.toBeInTheDocument();
  },
};
