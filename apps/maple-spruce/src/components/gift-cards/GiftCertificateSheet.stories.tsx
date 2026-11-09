import type { Meta, StoryObj } from '@storybook/react';
import { expect, waitFor, within } from 'storybook/test';
import { mockCertificateBatch } from '@maple/react/storybook-fixtures';
import { GiftCertificateSheet } from './GiftCertificateSheet';

const meta = {
  component: GiftCertificateSheet,
  title: 'Gift Cards/GiftCertificateSheet',
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GiftCertificateSheet>;

export default meta;
type Story = StoryObj<typeof GiftCertificateSheet>;

/** Two $25 certificates: Katie's layout, the MAPLE code (#332), barcode and QR code. */
export const DollarCertificates: Story = {
  args: { batchState: { status: 'success', data: mockCertificateBatch } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pages = canvas.getAllByRole('article', { name: 'Gift certificate, $25' });
    await expect(pages).toHaveLength(2);

    const first = within(pages[0]);
    await expect(first.getByText('$25')).toBeVisible();
    await expect(first.getByText('Gift Card')).toBeVisible();
    await expect(
      first.getByText('Good for classes and handmade goods at Maple & Spruce')
    ).toBeVisible();
    await expect(first.getByText('Code:')).toBeVisible();
    await expect(first.getByText('MAPLE 2099 482')).toBeVisible();
    await expect(
      first.getByText('Never expires. Not redeemable for cash. Not valid for Music Together.')
    ).toBeVisible();
    await expect(first.getByText('See all available classes here:')).toBeVisible();

    // The barcode is drawn: JsBarcode fills the SVG with bars.
    const barcode = first.getByRole('img', { name: 'Barcode of the code ending 9482' });
    await waitFor(() => expect(barcode.querySelectorAll('rect').length).toBeGreaterThan(20));

    // One US Letter page each: 8.5 x 11 inches at 96px to the inch.
    const box = pages[0].getBoundingClientRect();
    await expect(Math.round(box.width)).toBe(816);
    await expect(Math.round(box.height)).toBe(1056);

    // The copy for printing sits in <body>, hidden on screen.
    const printRoot = document.querySelector('.gift-certificate-print-root');
    await expect(printRoot).not.toBeNull();
    await expect(printRoot?.querySelectorAll('article')).toHaveLength(2);
    await expect(getComputedStyle(printRoot as Element).display).toBe('none');
  },
};

/** A class certificate says which class, not an amount. */
export const ClassCertificate: Story = {
  args: {
    batchState: {
      status: 'success',
      data: {
        ...mockCertificateBatch,
        kind: 'class',
        valueCents: 8500,
        className: 'Stained Glass',
        certificates: mockCertificateBatch.certificates.slice(0, 1),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('One Stained Glass class')).toBeVisible();
    await expect(canvas.queryByText('$85')).toBeNull();
  },
};

export const Loading: Story = {
  args: { batchState: { status: 'loading' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Loading the certificates')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(canvas.queryByRole('article')).toBeNull();
  },
};

export const Error: Story = {
  args: { batchState: { status: 'error', error: 'Square is unavailable' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('Square is unavailable');
  },
};
