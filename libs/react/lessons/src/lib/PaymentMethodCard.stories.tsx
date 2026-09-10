import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { PaymentMethodCard } from './PaymentMethodCard';
import type { SquareCardOnFile, Student } from '@maple/ts/domain';

/** The three cards actually on the live account, in their real shapes. */
const delphine: SquareCardOnFile = {
  cardId: 'ccof:delphine',
  customerId: 'cus_adele',
  cardBrand: 'VISA',
  last4: '1112',
  cardholderName: 'Delphine Cray',
  customerGivenName: 'Delphine',
  customerFamilyName: 'Cray',
  customerEmail: 'delphine.cray@example.com',
  customerPhone: '+15555550142',
  expMonth: 12,
  expYear: 2031,
  enabled: true,
};

const sasha: SquareCardOnFile = {
  cardId: 'ccof:sasha',
  customerId: 'cus_lark',
  cardBrand: 'VISA',
  last4: '1113',
  cardholderName: 'Sasha Marlowe',
  customerGivenName: 'Sasha',
  customerFamilyName: 'Marlowe',
  customerEmail: 'sasha.marlowe@example.com',
  expMonth: 1,
  expYear: 2031,
  enabled: true,
};

/** A retail customer with a card, belonging to no student. */
const stranger: SquareCardOnFile = {
  cardId: 'ccof:stranger',
  customerId: 'cus_stranger',
  cardBrand: 'VISA',
  last4: '1114',
  cardholderName: 'Quinn Vasser',
  customerGivenName: 'Quinn',
  customerFamilyName: 'Vasser',
  expMonth: 9,
  expYear: 2031,
  enabled: true,
};

function student(over: Partial<Student> = {}): Student {
  return {
    id: 'stu-1',
    name: 'Delphine Cray',
    instrument: 'violin',
    isAdultStudent: true,
    primaryTeacherId: 'instructor-1',
    isHopeScholarship: false,
    primaryContactName: 'Delphine Cray',
    primaryContactEmail: 'delphine.cray@example.com',
    primaryContactPhone: '555-555-0142',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Student;
}

const meta = {
  component: PaymentMethodCard,
  title: 'Lessons/PaymentMethodCard',
  parameters: { layout: 'padded' },
  args: {
    student: student(),
    cards: [stranger, sasha, delphine],
    linkedTo: {},
    isLoading: false,
    isSaving: false,
    error: null,
    onLink: fn(),
    onUnlink: fn(),
  },
} satisfies Meta<typeof PaymentMethodCard>;

export default meta;
type Story = StoryObj<typeof PaymentMethodCard>;

/** An adult student, whose card is in their own name. */
export const SuggestsTheMatchingCard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText('Visa ••1112')).toBeTruthy();
    // The reason matters more than the match: Katie has to be able to check it.
    expect(await canvas.findByText(/same email as this student/i)).toBeTruthy();
    // A stranger's card is not offered.
    expect(canvas.queryByText('Visa ••1114')).toBeNull();
  },
};

/**
 * The case that makes name matching useless: Devin's card is in his mother's
 * name and shares nothing with his. The bridge is her email.
 */
export const SuggestsAParentsCardForAChild: Story = {
  args: {
    student: student({
      id: 'stu-devin',
      name: 'Devin Marlowe',
      isAdultStudent: false,
      primaryContactName: 'Sasha Marlowe',
      primaryContactEmail: 'sasha.marlowe@example.com',
      primaryContactPhone: '+15555550177',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText('Visa ••1113')).toBeTruthy();
    expect(await canvas.findByText('Sasha Marlowe')).toBeTruthy();
    expect(await canvas.findByText(/same email as this student/i)).toBeTruthy();
  },
};

export const LinksACard: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Link' }));

    expect(args.onLink).toHaveBeenCalledWith('ccof:delphine');
  },
};

/** A card already on file reads back plainly, and can be detached. */
export const ShowsTheLinkedCard: Story = {
  args: {
    student: student({
      squareCustomerId: 'cus_adele',
      squareCardId: 'ccof:delphine',
      cardBrand: 'VISA',
      cardLast4: '1112',
      cardLinkedAt: new Date(),
    }),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText('Visa ••1112')).toBeTruthy();
    expect(await canvas.findByText('On file')).toBeTruthy();

    await userEvent.click(canvas.getByRole('button', { name: /unlink/i }));
    expect(args.onUnlink).toHaveBeenCalledTimes(1);
  },
};

/** An expiring card is worth replacing before a charge fails. */
export const WarnsAboutAnExpiringCard: Story = {
  args: {
    student: student({
      squareCustomerId: 'cus_adele',
      squareCardId: 'ccof:soon',
      cardBrand: 'VISA',
      cardLast4: '1112',
    }),
    cards: [
      {
        ...delphine,
        cardId: 'ccof:soon',
        expMonth: new Date().getUTCMonth() + 2,
        expYear: new Date().getUTCFullYear(),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/before a charge fails/i)).toBeTruthy();
  },
};

/** Nothing matches: say so, and offer the full list rather than a bad guess. */
export const NoMatchOffersEveryCard: Story = {
  args: {
    student: student({
      id: 'stu-pip',
      name: '"Pip" (Rosalind) Vance',
      isAdultStudent: false,
      primaryContactName: 'Marnie Underhill',
      primaryContactEmail: 'marnie.underhill@example.com',
      primaryContactPhone: undefined,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    expect(await canvas.findByText(/no card in square matches/i)).toBeTruthy();

    await userEvent.click(
      canvas.getByRole('button', { name: /show every card on file/i })
    );
    expect(await canvas.findByText('Visa ••1114')).toBeTruthy();
  },
};

/** A card already claimed by another student is never offered here. */
export const HidesACardLinkedToSomeoneElse: Story = {
  args: {
    linkedTo: { 'ccof:delphine': { id: 'stu-other', name: 'Someone Else' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/no card in square matches/i)).toBeTruthy();
    expect(canvas.queryByText('Visa ••1112')).toBeNull();
  },
};

/** Hope students bill through EMA, so a card on file would never be charged. */
export const HiddenForHopeStudents: Story = {
  args: { student: student({ isHopeScholarship: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText(/payment method/i)).toBeNull();
  },
};
