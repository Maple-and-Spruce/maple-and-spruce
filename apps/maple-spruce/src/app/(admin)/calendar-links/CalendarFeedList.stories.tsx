import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { CalendarFeedList } from './CalendarFeedList';
import { CALENDAR_FEEDS } from './calendar-feeds';

const meta = {
  component: CalendarFeedList,
  title: 'CalendarLinks/CalendarFeedList',
  parameters: { layout: 'padded' },
  args: { feeds: CALENDAR_FEEDS },
} satisfies Meta<typeof CalendarFeedList>;

export default meta;
type Story = StoryObj<typeof CalendarFeedList>;

/** Full feed catalog, grouped into public and internal cards. */
export const AllFeeds: Story = {};

/** Public feeds only — the internal group is omitted entirely. */
export const PublicOnly: Story = {
  args: { feeds: CALENDAR_FEEDS.filter((f) => f.audience === 'public') },
};

// ============================================================
// INTERACTIONS (exercised automatically in CI)
// ============================================================

/**
 * Verifies both groups render, that a subscribe feed exposes a `webcal://`
 * subscribe link + an `https://` view link with the correct hrefs, that the
 * embed is view-only (no subscribe link), and that clicking a copy button
 * writes the link to the clipboard and surfaces the confirmation snackbar.
 */
export const RendersLinksAndCopies: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Both group headings render.
    await expect(
      canvas.getByRole('heading', { name: /public & customer feeds/i })
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('heading', { name: /internal feeds/i })
    ).toBeInTheDocument();

    // A public subscribe feed exposes both link forms with correct hrefs.
    const subscribeLink = canvas.getByRole('link', {
      name: /subscribe to all public events/i,
    });
    await expect(subscribeLink).toHaveAttribute(
      'href',
      'webcal://maple-and-spruce-api.web.app/calendar/all.ics'
    );

    const viewLink = canvas.getByRole('link', {
      name: /open all public events in a new tab/i,
    });
    await expect(viewLink).toHaveAttribute(
      'href',
      'https://maple-and-spruce-api.web.app/calendar/all.ics'
    );

    // The internal planning feed renders in the internal group.
    await expect(
      canvas.getByRole('link', { name: /subscribe to internal planning feed/i })
    ).toBeInTheDocument();

    // The embed is view-only — no subscribe link for it.
    await expect(
      canvas.queryByRole('link', {
        name: /subscribe to public calendar \(browser view\)/i,
      })
    ).not.toBeInTheDocument();

    // Copy the https link and assert clipboard write + snackbar confirmation.
    const writeText = fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await userEvent.click(
      canvas.getByRole('button', {
        name: /copy https link for all public events/i,
      })
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'https://maple-and-spruce-api.web.app/calendar/all.ics'
      )
    );

    const body = within(document.body);
    await waitFor(() =>
      expect(body.getByText(/copied https link for all public events/i)).toBeInTheDocument()
    );
  },
};
