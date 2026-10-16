import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Buyers land here from the class page, so the tab must not say "Inventory
// Management" (the admin app's title) — that is what made it look suspect.
export const metadata: Metadata = {
  title: 'Secure checkout | Maple & Spruce Folk Arts Collective',
  robots: { index: false, follow: false },
};

export default function ApplePayCheckoutLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
