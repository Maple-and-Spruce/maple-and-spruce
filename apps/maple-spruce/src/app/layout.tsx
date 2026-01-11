import './global.css';
import { ThemeProvider } from '../lib/theme/ThemeProvider';

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
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
