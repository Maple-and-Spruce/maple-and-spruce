import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, within, screen } from 'storybook/test';
import { PrepayLessonsCard } from './PrepayLessonsCard';
import type {
  Lesson,
  LessonScheduledCharge,
  Student,
} from '@maple/ts/domain';

const NOW = new Date('2026-09-10T12:00:00Z');
const DAY = 86_400_000;
const RATE = 4125;

const student: Student = {
  id: 'stu-1',
  name: 'Delphine Cray',
  instrument: 'violin',
  status: 'active',
  registeredLessonLength: '30-min-full',
  primaryContactName: 'Marguerite Cray',
  primaryContactEmail: 'marguerite@example.com',
  squareCustomerId: 'sq-cust-1',
  squareCardId: 'sq-card-1',
  createdAt: NOW,
  updatedAt: NOW,
} as Student;

function lesson(n: number): Lesson {
  return {
    id: `lesson-${n}`,
    studentId: 'stu-1',
    teacherId: 'teacher-1',
    scheduledAt: new Date(NOW.getTime() + n * 7 * DAY),
    durationMinutes: 30,
    status: 'scheduled',
    createdAt: NOW,
    updatedAt: NOW,
  } as Lesson;
}

const lessons = Array.from({ length: 8 }, (_, i) => lesson(i + 1));

const meta = {
  component: PrepayLessonsCard,
  title: 'Lessons/PrepayLessonsCard',
  parameters: { layout: 'padded' },
  args: {
    student,
    lessons,
    charges: [],
    rateByLength: { '30-min-full': RATE },
    now: NOW,
    isCharging: false,
    error: null,
    onCharge: fn(),
  },
} satisfies Meta<typeof PrepayLessonsCard>;

export default meta;
type Story = StoryObj<typeof PrepayLessonsCard>;

/** The default: four lessons, priced from the studio rate table. */
export const NextFourLessons: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 now/ })
    ).toBeEnabled();
    await expect(canvas.getByText('4 lessons')).toBeInTheDocument();
  },
};

/**
 * The whole point of the confirmation: the dates are stated, the finality is
 * stated, and only then does the money move — with the amount that was shown.
 */
export const ConfirmsBeforeTakingMoney: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /Charge \$165\.00 now/ })
    );

    const dialog = within(await screen.findByRole('dialog'));
    await expect(
      dialog.getByText(/no refund from here/i)
    ).toBeInTheDocument();

    await userEvent.click(
      dialog.getByRole('button', { name: /^Charge \$165\.00$/ })
    );

    await expect(args.onCharge).toHaveBeenCalledWith({
      lessonIds: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4'],
      amountCents: 4 * RATE,
      note: undefined,
    });
  },
};

/** Backing out of the confirmation must not take anything. */
export const BackingOutChargesNothing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /Charge \$165\.00 now/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Back' }));

    await expect(args.onCharge).not.toHaveBeenCalled();
  },
};

/** Picking lessons by hand, for a family paying for a specific stretch. */
export const ChoosingLessonsByHand: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Choose lessons instead' })
    );

    const boxes = await canvas.findAllByRole('checkbox');
    await userEvent.click(boxes[1]);
    await userEvent.click(boxes[2]);

    await userEvent.click(
      canvas.getByRole('button', { name: /Charge \$82\.50 now/ })
    );
    const dialog = within(await screen.findByRole('dialog'));
    await userEvent.click(
      dialog.getByRole('button', { name: /^Charge \$82\.50$/ })
    );

    await expect(args.onCharge).toHaveBeenCalledWith({
      lessonIds: ['lesson-2', 'lesson-3'],
      amountCents: 2 * RATE,
      note: undefined,
    });
  },
};

/** Lessons already covered by a charge are not offered a second time. */
export const SkipsLessonsAlreadyCovered: Story = {
  args: {
    charges: [
      {
        id: 'chg-stu-1-lesson-1',
        studentId: 'stu-1',
        ruleId: 'manual',
        lessonIds: ['lesson-1', 'lesson-2'],
        amountCents: 2 * RATE,
        dueAt: NOW,
        status: 'paid',
        idempotencyKey: 'lesson-chg-stu-1-lesson-1',
        createdAt: NOW,
        updatedAt: NOW,
      } satisfies LessonScheduledCharge,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Still four lessons and the same total — just starting two lessons later.
    await expect(
      await canvas.findByRole('button', { name: /Charge \$165\.00 now/ })
    ).toBeEnabled();
    await expect(canvas.queryByText(/Sep 17/)).not.toBeInTheDocument();
  },
};

/** Without a card there is nothing to charge, and the card says why. */
export const NoCardOnFile: Story = {
  args: {
    student: { ...student, squareCardId: undefined } as Student,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/no card on file yet/i)
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: /Charge \$165\.00 now/ })
    ).toBeDisabled();
  },
};

/** Hope families bill through the EMA portal — this must not appear at all. */
export const HiddenForHopeStudents: Story = {
  args: {
    student: { ...student, isHopeScholarship: true } as Student,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText('Pay ahead')
    ).not.toBeInTheDocument();
  },
};
