import type { AdminUser } from '@kit/shared';
import { Badge } from '@/components/ui/badge';

export function UserStatus({ user }: { user: AdminUser }) {
  if (user.bannedAt) return <Badge variant="destructive">Suspended</Badge>;
  return user.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge>Unverified</Badge>;
}
