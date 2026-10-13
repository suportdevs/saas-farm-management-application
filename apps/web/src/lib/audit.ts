/** Human-readable labels for audit log actions. Unknown actions fall back to the raw name. */
const labels: Record<string, string> = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.login_blocked': 'Sign-in blocked (suspended)',
  'auth.logout': 'Signed out',
  'auth.password_reset': 'Password reset via email',
  'auth.session_revoked': 'Session revoked',
  'auth.sessions_revoked': 'Signed out other sessions',
  'user.profile_updated': 'Profile updated',
  'user.password_changed': 'Password changed',
  'user.password_set': 'Password set',
  'user.email_change_requested': 'Email change requested',
  'user.email_changed': 'Email changed',
  'user.deleted': 'Account deleted',
  'admin.user.updated': 'User updated by admin',
  'admin.user.banned': 'User suspended',
  'admin.user.unbanned': 'User unsuspended',
  'admin.user.sessions_revoked': 'Sessions revoked by admin',
  'admin.user.deleted': 'User deleted by admin',
  'admin.impersonation_started': 'Impersonation started',
  'admin.impersonation_stopped': 'Impersonation stopped',
};

export const actionLabel = (action: string) => labels[action] ?? action;

export function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Unknown device', mobile: false };
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { label: `${browser} on ${os}`, mobile: /Mobile|Android|iPhone/.test(ua) };
}
