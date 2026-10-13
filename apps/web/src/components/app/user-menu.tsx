'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import type { PublicUser } from '@kit/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function Avatar({ user, size = 32 }: { user: Pick<PublicUser, 'name' | 'image'>; size?: number }) {
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return user.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.image} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="flex items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export function UserMenu({ user }: { user: PublicUser }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const logout = async () => {
    setLoading(true);
    await api.post('/auth/logout').catch(() => {});
    router.push('/login');
    router.refresh();
  };
  return (
    <div className="flex items-center gap-3">
      <Avatar user={user} />
      <div className="hidden min-w-0 text-sm leading-tight sm:block">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={logout} loading={loading} aria-label="Sign out" title="Sign out">
        {!loading && <LogOut className="h-4 w-4" />}
      </Button>
    </div>
  );
}
