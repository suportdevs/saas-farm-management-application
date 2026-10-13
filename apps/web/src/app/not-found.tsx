import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">Sorry, we couldn&apos;t find the page you&apos;re looking for.</p>
      <Link href="/" className={buttonClasses('primary', 'md')}>
        Go home
      </Link>
    </div>
  );
}
