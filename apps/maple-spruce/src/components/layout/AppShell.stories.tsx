import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { Box, Typography } from '@mui/material';
import { StaticRolesProvider } from '@maple/react/auth';
import { AppShell } from '.';

/**
 * AppShell provides the main application layout with navigation.
 *
 * Note: This component uses Next.js navigation (usePathname) and
 * the UserMenu component which requires Firebase auth. In Storybook,
 * these are mocked via the nextjs framework integration. Nav items are
 * filtered by the current user's roles, provided here via
 * StaticRolesProvider (admin = full nav).
 */
const meta = {
  component: AppShell,
  title: 'Layout/AppShell',
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['admin']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof AppShell>;

const SampleContent = () => (
  <Box>
    <Typography variant="h4" gutterBottom>
      Page Content
    </Typography>
    <Typography>
      This is sample content inside the AppShell. The AppShell provides
      consistent navigation and layout across all pages.
    </Typography>
  </Box>
);

/**
 * Default desktop view with navigation
 */
export const Default: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
};

/**
 * Full width layout (no max-width constraint)
 */
export const FullWidth: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: false,
  },
};

/**
 * Small container width
 */
export const SmallContainer: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'sm',
  },
};

/**
 * On the Inventory page: Shop open, Inventory marked
 */
export const InventoryPage: Story = {
  args: {
    children: (
      <Box>
        <Typography variant="h4" gutterBottom>
          Inventory
        </Typography>
        <Typography>Inventory page content</Typography>
      </Box>
    ),
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/inventory',
      },
    },
  },
};

/**
 * On the Artists page (active nav item)
 */
export const ArtistsPage: Story = {
  args: {
    children: (
      <Box>
        <Typography variant="h4" gutterBottom>
          Artists
        </Typography>
        <Typography>Artists page content</Typography>
      </Box>
    ),
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/artists',
      },
    },
  },
};

/** The menu portals out of the canvas, so query the whole document. */
async function openCreateMenu(canvasElement: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(
    await within(canvasElement).findByRole('button', { name: 'Create' }),
  );
  return within(canvasElement.ownerDocument.body).findByRole('menu');
}

const menuLabels = (menu: HTMLElement): string[] =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '');

/**
 * Admin on Home: the eight areas, all closed — one row each instead of
 * every page.
 */
export const AdminAreas: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const area of [
      'Home',
      'Classes',
      'Lessons',
      'Music Together',
      'Shop',
      'Calendar',
      'Money',
      'Settings',
    ]) {
      await expect(
        await canvas.findByRole('link', { name: new RegExp(`^${area}`) }),
      ).toBeInTheDocument();
    }
    await expect(canvas.queryByText('Instructors')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Hope Billing')).not.toBeInTheDocument();
  },
};

/** Inside Money: Hope Billing and POS Lessons live here with the payouts. */
export const AdminInMoney: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/pos-lessons' },
    },
  },
  play: async ({ canvasElement }) => {
    const money = within(
      await within(canvasElement).findByRole('list', { name: 'Money pages' }),
    );
    await expect(
      money.getAllByRole('link').map((a) => a.textContent),
    ).toEqual(['Hope Billing', 'POS Lessons', 'Teacher Payouts', 'Artist Payouts']);
    await expect(
      money.getByRole('link', { name: 'POS Lessons' }),
    ).toHaveAttribute('aria-current', 'page');
  },
};

/** A student's page keeps Lessons open with Students marked. */
export const AdminOnStudentDetail: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/students/stu-test-1' },
    },
  },
  play: async ({ canvasElement }) => {
    const lessons = within(
      await within(canvasElement).findByRole('list', { name: 'Lessons pages' }),
    );
    await expect(
      lessons.getByRole('link', { name: 'Students' }),
    ).toHaveAttribute('aria-current', 'page');
  },
};

/** Admin's Create menu: every action, each opening its create form. */
export const AdminCreateMenu: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  play: async ({ canvasElement }) => {
    const menu = await openCreateMenu(canvasElement);
    await expect(menuLabels(menu)).toEqual([
      'New class',
      'New event',
      'Add student',
      'Book the Spruce Room',
    ]);
    await expect(
      within(menu).getByRole('menuitem', { name: 'Add student' }),
    ).toHaveAttribute('href', '/students?new=1');
  },
};

/**
 * Nav filtered for an MT teacher (Stephanie): six pages, so the plain
 * grouped list — Music Together + shared calendar items only.
 */
export const MtTeacherNav: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['mt-teacher']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Sections')).toBeInTheDocument();
    await expect(canvas.getByText('Spruce Room Schedule')).toBeInTheDocument();
    await expect(canvas.queryByText('Inventory')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Users')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Students')).not.toBeInTheDocument();

    const menu = await openCreateMenu(canvasElement);
    await expect(menuLabels(menu)).toEqual(['New event', 'Book the Spruce Room']);
  },
};

/**
 * Nav filtered for a lesson teacher: My Week, their students, and the
 * room. They can add a student, not a class.
 */
export const LessonTeacherNav: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['lesson-teacher']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('My Week')).toBeInTheDocument();
    await expect(canvas.getByText('Teaching Days')).toBeInTheDocument();
    await expect(canvas.queryByText('Inquiries')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Events')).not.toBeInTheDocument();

    const menu = await openCreateMenu(canvasElement);
    await expect(menuLabels(menu)).toEqual(['Add student', 'Book the Spruce Room']);
  },
};

/**
 * Nav filtered for a clerk + lesson teacher (Nathan): eleven pages, so
 * the accordion — store operations, registrations, students; no class
 * definitions, money or settings.
 */
export const ClerkLessonTeacherNav: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  decorators: [
    (Story) => (
      <StaticRolesProvider roles={['clerk', 'lesson-teacher']}>
        <Story />
      </StaticRolesProvider>
    ),
  ],
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/inventory' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shop = within(
      await canvas.findByRole('list', { name: 'Shop pages' }),
    );
    await expect(
      shop.getAllByRole('link').map((a) => a.textContent),
    ).toEqual(['Inventory', 'Sales', 'Categories']);
    for (const area of ['Home', 'Classes', 'Lessons', 'Calendar']) {
      await expect(
        canvas.getByRole('link', { name: new RegExp(`^${area}`) }),
      ).toBeInTheDocument();
    }
    for (const area of ['Money', 'Settings', 'Music Together']) {
      await expect(
        canvas.queryByRole('link', { name: new RegExp(`^${area}`) }),
      ).toBeNull();
    }
    // Classes holds only Registrations for them, and the row lands there.
    await expect(
      canvas.getByRole('link', { name: /^Classes/ }),
    ).toHaveAttribute('href', '/registrations');

    // Search reaches pages in closed areas, and never ones they can't see.
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Search pages' }),
      'stu',
    );
    const results = within(canvas.getByRole('list', { name: 'Search results' }));
    await expect(
      results.getByRole('link', { name: /Students/ }),
    ).toHaveAttribute('href', '/students');
    await expect(results.getAllByRole('link')).toHaveLength(1);
  },
};

/**
 * Even an admin finds no Lesson Billing while automatic charging is
 * paused (ADR-034, #162) — not in Money, not by search.
 */
export const AdminNavHidesLessonBilling: Story = {
  args: {
    children: <SampleContent />,
    maxWidth: 'lg',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Search pages' }),
      'billing',
    );
    const results = within(canvas.getByRole('list', { name: 'Search results' }));
    await expect(
      results.getAllByRole('link').map((a) => a.textContent),
    ).toEqual(['Hope BillingMoney']);
  },
};
