import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, screen, userEvent, within } from 'storybook/test';
import { BillingRulesCard } from './BillingRulesCard';
import type { LessonBillingRule, Student } from '@maple/ts/domain';

const NOW = new Date('2026-09-24T12:00:00Z');

function rule(over: Partial<LessonBillingRule> = {}): LessonBillingRule {
  return {
    id: 'rule-standard',
    name: 'Standard 4-lesson block',
    cadence: 'every-n-lessons',
    lessonsPerCharge: 4,
    anchor: 'before-first',
    anchorOffsetDays: -1,
    isDefault: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function student(over: Partial<Student> = {}): Student {
  return {
    id: `stu-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Student',
    status: 'active',
    isHopeScholarship: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Student;
}

const meta = {
  component: BillingRulesCard,
  title: 'Lessons/BillingRulesCard',
  parameters: { layout: 'padded' },
  args: {
    rules: [rule()],
    students: [student(), student(), student({ billingRuleId: 'rule-other' })],
    isLoading: false,
    pendingId: null,
    error: null,
    onSave: fn(),
  },
} satisfies Meta<typeof BillingRulesCard>;

export default meta;
type Story = StoryObj<typeof BillingRulesCard>;

/**
 * The default rule bills everyone with no rule of their own, which is the number
 * that surprises people — so the card counts it rather than implying it.
 */
export const StatesTheRuleAndWhoItBills: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/Every 4 lessons, charged 1 day before the first lesson/)
    ).toBeTruthy();
    expect(await canvas.findByText('Studio default')).toBeTruthy();
    // Two students have no rule of their own; the third is on another rule.
    expect(
      await canvas.findByText(/2 students, including everyone with no rule of their own/)
    ).toBeTruthy();
  },
};

/** Nothing configured is the state the studio starts in, and it must be loud. */
export const NoRulesMeansNobodyIsCharged: Story = {
  args: { rules: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/nothing is charged automatically/i)
    ).toBeTruthy();
  },
};

/** Rules but no default: a student is only billed once put on one by hand. */
export const RulesWithNoDefaultSayWhatThatMeans: Story = {
  args: { rules: [rule({ isDefault: false })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/only billed automatically once they are put on a rule/i)
    ).toBeTruthy();
  },
};

/** A flat-amount rule charges the same regardless of lesson length. Say so. */
export const AFlatAmountIsSpelledOut: Story = {
  args: { rules: [rule({ flatAmountCents: 12000 })] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/a flat \$120\.00/)).toBeTruthy();
  },
};

/** Retired rules stay visible for the students still on them. */
export const RetiredRulesAreKeptAndLabelled: Story = {
  args: {
    rules: [
      rule(),
      rule({ id: 'rule-old', name: 'Old monthly', isDefault: false, archived: true }),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('Retired rules')).toBeTruthy();
    // …and the row itself carries the chip.
    expect(await canvas.findByText('Retired')).toBeTruthy();
    expect(
      await canvas.findByText(/cannot be picked for anybody new/i)
    ).toBeTruthy();
  },
};

/** Creating a rule: the form validates with the server's own suite. */
export const RefusesARuleWithNoName: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'New rule' }));

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Create rule' }));

    expect(await dialog.findByText('A rule needs a name')).toBeTruthy();
    expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** The offset limit is the one that stops a typo billing months out of step. */
export const RefusesAChargeMilesFromTheTeaching: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'New rule' }));

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Name'), 'Way off');
    const offset = dialog.getByLabelText('Days from that lesson');
    await userEvent.clear(offset);
    await userEvent.type(offset, '-90');

    await userEvent.click(dialog.getByRole('button', { name: 'Create rule' }));
    expect(await dialog.findByText(/within 14 days/i)).toBeTruthy();
    expect(args.onSave).not.toHaveBeenCalled();
  },
};

/** The happy path, and the shape the page gets handed. */
export const CreatesARule: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'New rule' }));

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.type(dialog.getByLabelText('Name'), 'Termly block');
    await userEvent.click(dialog.getByRole('button', { name: 'Create rule' }));

    expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Termly block',
        cadence: 'every-n-lessons',
        lessonsPerCharge: 4,
        anchor: 'before-first',
        anchorOffsetDays: -1,
        isDefault: false,
        flatAmountCents: undefined,
      })
    );
  },
};

/**
 * Taking the studio default off another rule changes who every unassigned
 * student is billed by, so the dialog names the rule losing it first.
 */
export const WarnsBeforeStealingTheStudioDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'New rule' }));

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(
      dialog.getByRole('switch', { name: /studio default/i })
    );

    expect(
      await dialog.findByText(/is the studio default now/i)
    ).toBeTruthy();
    expect(
      await dialog.findByText(/starts being billed by this one instead/i)
    ).toBeTruthy();
  },
};

/** Editing loads the rule's own values rather than a blank form. */
export const EditingLoadsTheRule: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Change' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(
      (dialog.getByLabelText('Name') as HTMLInputElement).value
    ).toBe('Standard 4-lesson block');
    expect(dialog.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  },
};

/** Retiring says what it does and does not do, because it does less than it sounds. */
export const RetiringExplainsWhatItLeavesBehind: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Change' }));

    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('switch', { name: /retire this rule/i }));

    expect(
      await dialog.findByText(/keep being billed by it/i)
    ).toBeTruthy();
  },
};

/** Loading is a skeleton, not an empty list that reads as "no rules". */
export const LoadingIsNotEmpty: Story = {
  args: { isLoading: true, rules: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/nothing is charged automatically/i)).toBeNull();
  },
};
