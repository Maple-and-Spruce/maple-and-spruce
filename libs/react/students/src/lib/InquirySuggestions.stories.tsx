import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within } from 'storybook/test';
import { InquirySuggestions } from './InquirySuggestions';
import type { LessonInquiry, Student } from '@maple/ts/domain';

const DAY = 86_400_000;
const now = Date.now();

function inquiry(overrides: Partial<LessonInquiry> = {}): LessonInquiry {
  return {
    id: 'sub-1',
    formId: 'dWPQOr',
    formName: 'Music lesson inquiry',
    submittedAt: new Date(now - DAY),
    contactName: 'Lace Haggerty',
    email: 'lace@example.com',
    phone: '+13045550101',
    interest: 'Old-Time Fiddle',
    availability: [],
    status: 'new',
    attribution: {},
    createdAt: new Date(now - DAY),
    updatedAt: new Date(now - DAY),
    ...overrides,
  } as LessonInquiry;
}

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 'stu-1',
    name: 'Andrew Marvin',
    instrument: 'fiddle',
    isAdultStudent: true,
    primaryTeacherId: 'ins-1',
    isHopeScholarship: false,
    primaryContactName: 'Andrew Marvin',
    primaryContactEmail: 'andrew@example.com',
    status: 'active',
    createdAt: new Date(now - 30 * DAY),
    updatedAt: new Date(now - 30 * DAY),
    ...overrides,
  } as Student;
}

const inquiries: LessonInquiry[] = [
  inquiry(),
  inquiry({
    id: 'sub-2',
    contactName: 'Tosha Smith',
    email: 'tosha@example.com',
    status: 'contacted',
    submittedAt: new Date(now - 3 * DAY),
  }),
  // Already became a student — offering it again is how you get two records
  // for one child.
  inquiry({
    id: 'sub-3',
    contactName: 'Sarah Flowers',
    email: 'sarah@example.com',
    status: 'enrolled',
  }),
  // Closed out. Nobody is turning this into a student.
  inquiry({
    id: 'sub-4',
    contactName: 'Barb Baxter',
    email: 'barb@example.com',
    status: 'lost',
  }),
  // Open, but this email is already a student's contact: the same family back
  // for a second instrument, which is an edit and not a new record.
  inquiry({
    id: 'sub-5',
    contactName: 'Andrew Marvin',
    email: 'andrew@example.com',
    status: 'contacted',
  }),
];

const meta = {
  component: InquirySuggestions,
  title: 'Students/InquirySuggestions',
  parameters: { layout: 'padded' },
  args: {
    inquiries,
    students: [student()],
    onPick: fn(),
  },
} satisfies Meta<typeof InquirySuggestions>;

export default meta;
type Story = StoryObj<typeof InquirySuggestions>;

export const Default: Story = {};

/**
 * THE POINT: only inquiries that could actually become a *new* student.
 *
 * Five inquiries in, two out: the enrolled one already has its student, the
 * lost one is closed, and the fifth shares an email with an existing student,
 * which is a family coming back rather than a new household.
 */
export const FiltersOutWhatCannotBecomeAStudent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const button = await canvas.findByRole('button', {
      name: /start from an inquiry \(2\)/i,
    });
    await userEvent.click(button);

    const menu = within(document.body);
    expect(await menu.findByText('Lace Haggerty')).toBeInTheDocument();
    expect(await menu.findByText('Tosha Smith')).toBeInTheDocument();
    expect(menu.queryByText('Sarah Flowers')).toBeNull();
    expect(menu.queryByText('Barb Baxter')).toBeNull();
    expect(menu.queryByText('Andrew Marvin')).toBeNull();
  },
};

export const HandsBackTheWholeInquiry: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /start from an inquiry/i })
    );
    await userEvent.click(await within(document.body).findByText('Lace Haggerty'));

    expect(args.onPick).toHaveBeenCalled();
    const [passed] = (args.onPick as ReturnType<typeof fn>).mock.calls[0];
    expect(passed).toMatchObject({ id: 'sub-1', email: 'lace@example.com' });
  },
};

/**
 * Nothing to suggest renders nothing at all.
 *
 * A permanently disabled button teaches people to stop looking at that corner
 * of the screen, and most students arrive by word of mouth with no form at all.
 */
export const HidesItselfWhenThereIsNothingToSuggest: Story = {
  args: { inquiries: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole('button')).toBeNull();
  },
};
