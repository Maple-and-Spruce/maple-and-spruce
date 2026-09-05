import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { LessonInquiryList } from './LessonInquiryList';
import type { LessonInquiry } from '@maple/ts/domain';

const DAY = 86_400_000;
const now = Date.now();

function inquiry(overrides: Partial<LessonInquiry> = {}): LessonInquiry {
  return {
    id: 'sub-1',
    formId: 'QKQb6k',
    formName: 'Suzuki interview request',
    submittedAt: new Date(now - DAY),
    contactName: 'Dana Fields',
    email: 'dana@example.com',
    phone: '+13045550101',
    studentFirstName: 'Rowan',
    studentAge: 6,
    interest: 'Suzuki violin, with Katie',
    availability: ['Weekday afternoons, after school', 'Saturday morning'],
    hopeScholarship: 'no',
    message: 'We already own a 1/8 violin.',
    status: 'new',
    attribution: { utmSource: 'fb', utmMedium: 'paid' },
    createdAt: new Date(now - DAY),
    updatedAt: new Date(now - DAY),
    ...overrides,
  } as LessonInquiry;
}

const inquiries: LessonInquiry[] = [
  inquiry(),
  inquiry({
    id: 'sub-2',
    contactName: 'Sam Okonkwo',
    email: 'sam@example.com',
    studentFirstName: 'Ada',
    studentAge: 8,
    interest: 'Suzuki guitar, with Nathan',
    hopeScholarship: 'yes',
    status: 'contacted',
    submittedAt: new Date(now - 4 * DAY),
    message: undefined,
  }),
  inquiry({
    id: 'sub-3',
    formId: 'dWPQOr',
    formName: 'Music lesson inquiry',
    contactName: 'Casey Rivers',
    email: 'casey@example.com',
    phone: undefined,
    studentFirstName: undefined,
    studentAge: undefined,
    interest: 'Old-Time Fiddle',
    availability: [],
    hopeScholarship: undefined,
    message: undefined,
    status: 'new',
    // Five days unanswered — past the follow-up promise, so it flags.
    submittedAt: new Date(now - 5 * DAY),
    attribution: {},
  }),
  inquiry({
    id: 'sub-4',
    contactName: 'Jordan Blake',
    email: 'jordan@example.com',
    status: 'enrolled',
    studentId: 'student-1',
    submittedAt: new Date(now - 30 * DAY),
  }),
];

const meta = {
  component: LessonInquiryList,
  title: 'Lessons/LessonInquiryList',
  parameters: { layout: 'padded' },
  args: {
    inquiries,
    updatingId: null,
    onUpdateStatus: fn(),
    onEnroll: fn(),
    onCreateStudent: fn(),
  },
} satisfies Meta<typeof LessonInquiryList>;

export default meta;
type Story = StoryObj<typeof LessonInquiryList>;

export const Queue: Story = {};

export const Empty: Story = {
  args: { inquiries: [] },
};

/** A row mid-save. The point is that only *that* row is frozen. */
export const RowSaving: Story = {
  args: { updatingId: 'sub-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const saving = await canvas.findByRole('button', { name: /saving/i });
    expect(saving).toBeDisabled();

    // The other new lead is still actionable. A page-wide busy flag — which is
    // what /my-day still uses — would have disabled this one too.
    const others = canvas.getAllByRole('button', { name: /mark contacted/i });
    expect(others.length).toBeGreaterThan(0);
    expect(others[0]).not.toBeDisabled();
  },
};

/** The common case is one labelled click, not an unlabelled icon. */
export const AdvancesWithOneClick: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const buttons = canvas.getAllByRole('button', { name: /mark contacted/i });
    await userEvent.click(buttons[0]);

    expect(args.onUpdateStatus).toHaveBeenCalledWith('sub-1', 'contacted');
  },
};

/** Enrolling needs the student it became, so it lives behind the overflow. */
export const EnrollFromOverflow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /more actions for dana fields/i })
    );

    const enroll = await within(document.body).findByRole('menuitem', {
      name: /mark enrolled/i,
    });
    await userEvent.click(enroll);

    expect(args.onEnroll).toHaveBeenCalled();
  },
};

/** An unanswered lead past the follow-up promise says so, in words. */
export const FlagsAnUnansweredLead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const warnings = await canvas.findAllByText(/no one has answered this yet/i);
    expect(warnings.length).toBeGreaterThan(0);
  },
};

/**
 * The path that turns this from a tracking tool into a shortcut (#819).
 *
 * "Mark enrolled…" only links to a student that already exists, which is the
 * rarer case — usually the family said yes and there is no record yet. Without
 * this the person working the queue retypes a name, an email and a phone number
 * that are already on their screen into a different page.
 */
export const CreateStudentFromOverflow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /more actions for dana fields/i })
    );

    const create = await within(document.body).findByRole('menuitem', {
      name: /create student/i,
    });
    await userEvent.click(create);

    expect(args.onCreateStudent).toHaveBeenCalled();
    // It must hand over the whole inquiry, not just an id: the caller seeds a
    // form from it and a second round-trip to re-find it would be silly.
    const [passed] = (args.onCreateStudent as ReturnType<typeof fn>).mock
      .calls[0];
    expect(passed).toMatchObject({ id: 'sub-1', email: 'dana@example.com' });
  },
};

/** Both paths stay available and stay distinct. */
export const OffersBothEnrolAndCreate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole('button', { name: /more actions for dana fields/i })
    );

    const menu = within(document.body);
    expect(
      await menu.findByRole('menuitem', { name: /create student/i })
    ).toBeInTheDocument();
    expect(
      await menu.findByRole('menuitem', { name: /mark enrolled/i })
    ).toBeInTheDocument();
  },
};
