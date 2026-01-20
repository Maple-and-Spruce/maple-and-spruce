# @maple/react/layout

Layout components for Maple & Spruce.

## Components

- `AppShell` - Main application shell with responsive navigation

## Usage

```tsx
import { AppShell, NavItem } from '@maple/react/layout';
import HomeIcon from '@mui/icons-material/Home';

const navItems: NavItem[] = [
  { label: 'Home', href: '/', icon: <HomeIcon /> },
];

function App() {
  return (
    <AppShell navItems={navItems} title="My App">
      {children}
    </AppShell>
  );
}
```
