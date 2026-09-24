import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, within } from 'storybook/test';
import { RunBillingCard } from './RunBillingCard';
import type { RunLessonBillingResult } from '@maple/ts/firebase/api-types';

function result(over: Partial<RunLessonBillingResult> = {}): RunLessonBillingResult {
  return {
    studentsConsidered: 9,
    chargesPlanned: 2,
    chargesAlreadyPlanned: 4,
    skippedNoRate: 0,
    lessonsAlreadyCovered: 26,
    planningFailed: 0,
    charged: 0,
    chargeFailed: 0,
    skippedNoCard: 0,
    dryRun: true,
    ...over,
  } as RunLessonBillingResult;
}

const meta = {
  component: RunBillingCard,
  title: 'Lessons/RunBillingCard',
  parameters: { layout: 'padded' },
  args: {
    pendingId: null,
    error: null,
    hasRules: true,
    onRun: fn(async () => result()),
  },
} satisfies Meta<typeof RunBillingCard>;

export default meta;
type Story = StoryObj<typeof RunBillingCard>;

/**
 * Preview is the safe half and leads: it writes nothing and reports the same
 * counters, which is how a new rule gets checked without charging anybody.
 */
export const PreviewTakesNoMoney: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview' }));

    expect(args.onRun).toHaveBeenCalledWith({ dryRun: true });
    expect(await canvas.findByText('What a run would do')).toBeTruthy();
    expect(await canvas.findByText('Charges planned')).toBeTruthy();
  },
};

/** A real run moves money, so it is behind a confirmation that says so. */
export const RunningForRealAsksFirst: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Run it now' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/Cards will be charged/i)).toBeTruthy();
    expect(dialog.getByText(/no undo/i)).toBeTruthy();
    expect(args.onRun).not.toHaveBeenCalled();
  },
};

/** Backing out of that confirmation must run nothing. */
export const BackingOutRunsNothing: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Run it now' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }));

    expect(args.onRun).not.toHaveBeenCalled();
  },
};

export const ConfirmingRunsItForReal: Story = {
  args: { onRun: fn(async () => result({ dryRun: false, charged: 3 })) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Run it now' }));
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Run it now' }));

    expect(args.onRun).toHaveBeenCalledWith({ dryRun: false });
    expect(await canvas.findByText('What the run did')).toBeTruthy();
  },
};

/**
 * A charge that priced at nothing is the quiet failure this whole readout
 * exists for: nobody is billing that student and no error was raised.
 */
export const SkippedForNoRateIsCalledOut: Story = {
  args: { onRun: fn(async () => result({ skippedNoRate: 3 })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview' }));

    expect(
      await canvas.findByText(/nobody is billing them/i)
    ).toBeTruthy();
  },
};

/** A student whose planning threw did not stop the run, and says so. */
export const PlanningFailuresAreReported: Story = {
  args: { onRun: fn(async () => result({ planningFailed: 1 })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Preview' }));

    expect(
      await canvas.findByText(/The rest of the run went ahead/i)
    ).toBeTruthy();
  },
};

/** With no rules a run would consider nobody, so neither button pretends. */
export const NoRulesDisablesBoth: Story = {
  args: { hasRules: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/a run would consider nobody/i)).toBeTruthy();
    expect(canvas.getByRole('button', { name: 'Preview' })).toBeDisabled();
    expect(canvas.getByRole('button', { name: 'Run it now' })).toBeDisabled();
  },
};

/** A refusal belongs on the card, not in a toast that scrolls away. */
export const ShowsAFailure: Story = {
  args: { error: 'The billing job could not be reached' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText('The billing job could not be reached')
    ).toBeTruthy();
  },
};
