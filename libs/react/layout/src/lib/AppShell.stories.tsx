import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getRouter } from '@storybook/nextjs-vite/navigation.mock';
import { Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PaymentsIcon from '@mui/icons-material/Payments';
import StorefrontIcon from '@mui/icons-material/Storefront';
import { AppShell } from './AppShell';
import type { NavGroup } from './nav-model';

/**
 * The library AppShell with a fixed nav, so the accordion, search, badges
 * and Create menu can be driven without the app's role map or data hooks.
 * The real, role-filtered nav is covered in the app's
 * `components/layout/AppShell.stories.tsx`.
 */
const AREAS: NavGroup[] = [
  {
    label: 'Home',
    icon: <HomeIcon />,
    items: [{ label: 'Home', href: '/' }],
  },
  {
    label: 'Lessons',
    icon: <MusicNoteIcon />,
    items: [
      { label: 'Students', href: '/students' },
      { label: 'Inquiries', href: '/leads' },
      { label: 'Lesson Blocks', href: '/lesson-blocks' },
    ],
  },
  {
    label: 'Shop',
    icon: <StorefrontIcon />,
    items: [
      { label: 'Inventory', href: '/inventory' },
      { label: 'Artists', href: '/artists' },
      { label: 'Sync', href: '/sync-conflicts', badge: 3, badgeColor: 'warning' },
    ],
  },
  {
    label: 'Money',
    icon: <PaymentsIcon />,
    items: [
      { label: 'Hope Billing', href: '/hope' },
      { label: 'POS Lessons', href: '/pos-lessons', badge: 2, badgeColor: 'warning' },
      { label: 'Teacher Payouts', href: '/payouts' },
      { label: 'Artist Payouts', href: '/payouts/artist-payouts' },
    ],
  },
];

const meta = {
  component: AppShell,
  title: 'Layout/AppShell (library)',
  args: {
    navGroups: AREAS,
    createActions: [
      { label: 'New class', href: '/classes?new=1' },
      { label: 'Book the Spruce Room', href: '/book-room' },
    ],
    children: <Typography variant="h4">Page content</Typography>,
  },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/' } },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const atPath = (pathname: string) => ({
  nextjs: { appDirectory: true, navigation: { pathname } },
});

/** On Home every area is closed: one row each, no sub-pages. */
export const AreasClosed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const area of ['Home', 'Lessons', 'Shop', 'Money']) {
      await expect(
        canvas.getByRole('link', { name: new RegExp(`^${area}`) }),
      ).toBeInTheDocument();
    }
    await expect(canvas.queryByText('Inquiries')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Hope Billing')).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: /^Home/ }),
    ).toHaveAttribute('aria-current', 'page');
    // An area row links to its first page.
    await expect(canvas.getByRole('link', { name: /^Money/ })).toHaveAttribute(
      'href',
      '/hope',
    );
  },
};

/** A closed area shows the sum of its items' badges. */
export const ClosedAreaBadges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      within(canvas.getByRole('link', { name: /^Shop/ })).getByText('3'),
    ).toBeInTheDocument();
    await expect(
      within(canvas.getByRole('link', { name: /^Money/ })).getByText('2'),
    ).toBeInTheDocument();
  },
};

/**
 * Inside an area its pages open, the current one marked. A detail route
 * belongs to its section, and the area's badge moves onto its item.
 */
export const OpenArea: Story = {
  parameters: atPath('/students/stu-123'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lessons = canvas.getByRole('list', { name: 'Lessons pages' });
    await expect(
      within(lessons).getByRole('link', { name: 'Students' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(within(lessons).getByText('Inquiries')).toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: /^Lessons/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByRole('link', { name: /^Shop/ }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByText('Inventory')).not.toBeInTheDocument();
  },
};

/** A nested page beats its parent: Artist Payouts, not Teacher Payouts. */
export const NestedPage: Story = {
  parameters: atPath('/payouts/artist-payouts'),
  play: async ({ canvasElement }) => {
    const money = within(
      within(canvasElement).getByRole('list', { name: 'Money pages' }),
    );
    await expect(
      money.getByRole('link', { name: 'Artist Payouts' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      money.getByRole('link', { name: 'Teacher Payouts' }),
    ).not.toHaveAttribute('aria-current');
    // The open area's item carries its own badge.
    await expect(
      within(money.getByRole('link', { name: /POS Lessons/ })).getByText('2'),
    ).toBeInTheDocument();
  },
};

/** Search replaces the areas with matching pages; Escape brings them back. */
export const Search: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('textbox', { name: 'Search pages' });
    await userEvent.type(search, 'payouts');
    const results = within(canvas.getByRole('list', { name: 'Search results' }));
    await expect(results.getAllByRole('link')).toHaveLength(2);
    await expect(
      results.getByRole('link', { name: /Teacher Payouts\s*Money/ }),
    ).toHaveAttribute('href', '/payouts');
    await expect(canvas.queryByRole('link', { name: /^Shop/ })).toBeNull();

    await userEvent.keyboard('{Escape}');
    await expect(search).toHaveValue('');
    await expect(canvas.getByRole('link', { name: /^Shop/ })).toBeInTheDocument();
  },
};

/** Enter goes to the best match. */
export const SearchEnterNavigates: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('textbox', { name: 'Search pages' });
    await userEvent.type(search, 'hope{Enter}');
    await expect(getRouter().push).toHaveBeenCalledWith('/hope');
    await expect(search).toHaveValue('');
  },
};

export const SearchNoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Search pages' }),
      'zzz',
    );
    await expect(canvas.getByText(/No pages match/)).toBeInTheDocument();
  },
};

/** ⌘K / Ctrl+K jumps to the search box from anywhere. */
export const KeyboardShortcut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('textbox', { name: 'Search pages' });
    await expect(search).not.toHaveFocus();
    await userEvent.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(search).toHaveFocus());
  },
};

/** The pinned Create button opens its menu of quick-create links. */
export const CreateMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create' }));
    // The menu portals out of the canvas.
    const body = within(canvasElement.ownerDocument.body);
    const menu = await body.findByRole('menu');
    await expect(
      within(menu).getByRole('menuitem', { name: 'New class' }),
    ).toHaveAttribute('href', '/classes?new=1');
    await expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
  },
};

/** No create actions, no Create button. */
export const NoCreateActions: Story = {
  args: { createActions: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Create' }),
    ).toBeNull();
  },
};

/** Few enough pages and the nav is the plain list, every group open. */
export const FlatForSmallNavs: Story = {
  args: { flatMaxItems: 20 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Inquiries')).toBeInTheDocument();
    await expect(canvas.getByText('Hope Billing')).toBeInTheDocument();
    await expect(canvas.queryByRole('list', { name: 'Lessons pages' })).toBeNull();
  },
};
