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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthGuardWrapper>{children}</AuthGuardWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
