'use client';

import { Moon, Sun } from 'lucide-react';
import { saveTheme } from '@/lib/preferences';
import { Button } from './ui/button';

/** Light/dark switch for the public pages. Inside the app, the top bar has the full theme menu. */
export function ThemeToggle() {
  const toggle = () => saveTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}
