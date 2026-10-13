import { Separator } from '@/components/ui/separator';
import { authProviders } from '@/modules/registry';

/**
 * Renders module-provided sign-in options (passkeys, magic links, social
 * login…) under a single "or" divider. Providers may render nothing (e.g. not
 * configured, or not for this mode); if all do, the divider hides too.
 */
export function AuthProviders({ mode }: { mode: 'login' | 'register' }) {
  if (authProviders.length === 0) return null;
  return (
    <div className="space-y-4 [&:has(>.auth-providers:empty)]:hidden">
      <Separator label="or" />
      <div className="auth-providers grid gap-2">
        {authProviders.map((Provider, i) => (
          <Provider key={i} mode={mode} />
        ))}
      </div>
    </div>
  );
}
