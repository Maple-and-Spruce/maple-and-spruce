import type { Meta, StoryObj } from '@storybook/react';
import { fn, expect, userEvent, waitFor, within } from 'storybook/test';
import { StudentList } from './StudentList';
import {
  mockStudent,
  mockStudents,
  mockStudentHope,
  mockStudentInactive,
  mockInstructor,
  mockInstructor2,
  mockInstructorPercentage,
  mockLessons,
} from '@maple/react/storybook-fixtures';
import type { RequestState, Student } from '@maple/ts/domain';

const instructors = [mockInstructor, mockInstructor2, mockInstructorPercentage];

const meta = {
  component: StudentList,
  title: 'Students/StudentList',
  parameters: { layout: 'padded' },
  args: {
    onEdit: fn(),
    onDelete: fn(),
    onScheduleLesson: fn(),
    onCreateInvoice: fn(),
    instructors,
    lessons: mockLessons,
  },
} satisfies Meta<typeof StudentList>;

export default meta;
type Story = StoryObj<typeof StudentList>;

// ============================================================
// VISUAL STATES
// ============================================================

export const Idle: Story = {
  args: {
    studentsState: { status: 'idle' } as RequestState<Student[]>,
  },
};

export const Loading: Story = {
  args: {
    studentsState: { status: 'loading' } as RequestState<Student[]>,
  },
};

export const ErrorState: Story = {
  args: {
    studentsState: {
      status: 'error',
      error: 'Failed to fetch students from the server.',
    } as RequestState<Student[]>,
  },
};

export const Empty: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [],
    } as RequestState<Student[]>,
  },
};

export const WithData: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: mockStudents,
    } as RequestState<Student[]>,
  },
};

export const HopeStudentOnly: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudentHope],
    } as RequestState<Student[]>,
  },
};

export const InactiveStudent: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudentInactive],
    } as RequestState<Student[]>,
  },
};

// ============================================================
// INTERACTION TESTS
// ============================================================

/** Open a student's "⋯" action menu and return the portal query scope. */
async function openRowMenu(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(
    canvas.getByRole('button', { name: /actions for/i }),
  );
  const menu = within(document.body);
  await waitFor(() =>
    expect(menu.getByRole('menu')).toBeInTheDocument(),
  );
  return menu;
}

export const EditFromMenuCallsOnEdit: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudent],
    } as RequestState<Student[]>,
  },
  play: async ({ args, canvasElement }) => {
    const menu = await openRowMenu(canvasElement);
    await userEvent.click(menu.getByRole('menuitem', { name: /^edit$/i }));
    await waitFor(() => {
      expect(args.onEdit).toHaveBeenCalledTimes(1);
      expect(args.onEdit).toHaveBeenCalledWith(mockStudent);
    });
  },
};

export const DeleteFromMenuCallsOnDelete: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudent],
    } as RequestState<Student[]>,
  },
  play: async ({ args, canvasElement }) => {
    const menu = await openRowMenu(canvasElement);
    await userEvent.click(menu.getByRole('menuitem', { name: /^delete$/i }));
    await waitFor(() => {
      expect(args.onDelete).toHaveBeenCalledTimes(1);
      expect(args.onDelete).toHaveBeenCalledWith(mockStudent);
    });
  },
};

export const ScheduleFromMenu: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudent],
    } as RequestState<Student[]>,
  },
  play: async ({ args, canvasElement }) => {
    const menu = await openRowMenu(canvasElement);
    await expect(
      menu.getByRole('menuitem', { name: /schedule lesson/i }),
    ).toBeInTheDocument();
    await userEvent.click(
      menu.getByRole('menuitem', { name: /schedule lesson/i }),
    );
    await waitFor(() => {
      expect(args.onScheduleLesson).toHaveBeenCalledWith(mockStudent);
    });
  },
};

export const InvoiceDisabledForHope: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudentHope],
    } as RequestState<Student[]>,
  },
  play: async ({ args, canvasElement }) => {
    const menu = await openRowMenu(canvasElement);
    const invoiceItem = menu.getByRole('menuitem', {
      name: /create invoice/i,
    });
    // Hope students can't be invoiced — the item is disabled (and thus
    // unclickable: MUI sets pointer-events: none), so onCreateInvoice can't
    // fire.
    await expect(invoiceItem).toHaveAttribute('aria-disabled', 'true');
    await expect(args.onCreateInvoice).not.toHaveBeenCalled();
  },
};

export const HopeScholarshipChipRendered: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudentHope],
    } as RequestState<Student[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getByText(/Hope Scholarship/i)).toBeInTheDocument();
    });
  },
};

export const TeacherNameRenderedFromInstructors: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudent],
    } as RequestState<Student[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The Teacher column shows the resolved instructor name.
    await waitFor(() => {
      expect(canvas.getByText(mockInstructor.name)).toBeInTheDocument();
    });
  },
};

export const LessonDayTimeRendered: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: [mockStudent],
    } as RequestState<Student[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Olive's scheduled lessons (Sundays, 11:00 AM ET) drive the Day/Time cell.
    await waitFor(() => {
      expect(canvas.getByText(/Sundays/)).toBeInTheDocument();
    });
  },
};
