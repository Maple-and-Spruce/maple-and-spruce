import './global.css';
import { ThemeProvider } from '@maple/react/theme';
import { AuthGuardWrapper } from './auth-guard-wrapper';

export const metadata = {
  title: 'Maple & Spruce - Inventory Management',
  description: 'Folk arts collective inventory and artist management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AuthGuardWrapper>{children}</AuthGuardWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
