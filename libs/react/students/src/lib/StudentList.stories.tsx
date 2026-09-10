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

// ============================================================
// #851 — MATERIAL REACT TABLE TRIAL: pinning and default sort
// ============================================================

/**
 * The reason for the trial (#851, #847). Katie's Actions column was being cut
 * off, and scrolling to reach it lost the student's name. Pinning keeps *who
 * this row is* and *what can be done about it* on screen at all times.
 *
 * Column pinning is a paid feature in MUI X DataGrid, which is what sent us
 * looking for an alternative.
 */
export const PinsIdentityLeftAndActionsRight: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: mockStudents,
    } as RequestState<Student[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const pinned = async (name: RegExp | string) => {
      const header = await canvas.findByRole('columnheader', { name });
      return getComputedStyle(header).position;
    };

    // Sticky is how pinning is actually implemented, so it is what proves the
    // column will survive a horizontal scroll.
    expect(await pinned(/Student/)).toBe('sticky');
    expect(await pinned(/Lesson Day \/ Time/)).toBe('sticky');
    expect(await pinned(/Actions/)).toBe('sticky');

    // A column between them scrolls away, which is the intended trade.
    expect(await pinned(/Contact/)).not.toBe('sticky');

    // Pinned cells must be fully opaque. MRT ships them at opacity 0.97,
    // which lets the scrolling columns read through as ghost text — the
    // background is already correct, so only a screenshot catches it.
    const doc = canvasElement.ownerDocument;
    const pinnedCell = doc.querySelector(
      '.MuiTableContainer-root tbody td[data-pinned="true"]'
    );
    expect(pinnedCell).toBeTruthy();
    expect(getComputedStyle(pinnedCell as Element).opacity).toBe('1');

    // And the pinned half must LOOK like the scrolling half. MRT paints
    // pinned cells with a `:before` coloured from `mrtTheme.baseBackgroundColor`,
    // which defaults to the MUI theme background — the brand cream — while the
    // scrolling cells are white. Left alone, the two halves of one table are
    // different colours and it reads as a rendering fault.
    const scrollingCell = doc.querySelector(
      '.MuiTableContainer-root tbody td:not([data-pinned="true"])'
    );
    const pinnedPaint = getComputedStyle(pinnedCell as Element, '::before')
      .backgroundColor;
    const scrollingPaint = getComputedStyle(scrollingCell as Element)
      .backgroundColor;

    // Near-equality, not exact: MRT deliberately darkens the pinned overlay by
    // 1% (255 -> 252), which nobody can see. The bug being guarded against was
    // the brand cream against white — tens of points per channel.
    const channels = (c: string) =>
      (c.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const pinnedRgb = channels(pinnedPaint);
    const scrollingRgb = channels(scrollingPaint);

    expect(pinnedRgb).toHaveLength(3);
    pinnedRgb.forEach((value, i) => {
      expect(Math.abs(value - scrollingRgb[i])).toBeLessThanOrEqual(8);
    });
  },
};

/**
 * The page opens in the order Katie teaches, not alphabetically (#847).
 *
 * `weekdaySortKey` is POSITIVE_INFINITY for a student with no arrangement, so
 * they group at the bottom — that group is the "NO CURRENT LESSON TIME"
 * section of her spreadsheet, rather than a scattering of blanks.
 */
export const OpensSortedByTimeSlot: Story = {
  args: {
    studentsState: {
      status: 'success',
      data: mockStudents,
    } as RequestState<Student[]>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => {
      expect(canvas.getAllByRole('row').length).toBeGreaterThan(1);
    });

    // Read the Day/Time cell of every row in render order. A student with no
    // slot renders an em dash.
    const rows = canvas.getAllByRole('row').slice(1);
    const slotted = rows.map((r) => !r.textContent?.includes('—'));

    // Every student with a slot comes before every student without one.
    const firstBlank = slotted.indexOf(false);
    if (firstBlank !== -1) {
      expect(slotted.slice(firstBlank).every((has) => !has)).toBe(true);
    }
  },
};
