import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'sid';
const PROTECTED = ['/dashboard', '/settings', '/admin', '/orgs', '/farms', '/onboarding'];
/** Referral code cookie, read by the API when an account is created (referrals module). */
const REFERRAL_COOKIE = 'ref';

/**
 * - Fast, optimistic redirect for signed-out visitors. This only checks that a
 *   session cookie exists — the real validation happens in the (app) layout
 *   and on every API call.
 * - Remembers `?ref=<code>` from invitation links for 30 days.
 */
export function proxy(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !req.cookies.has(SESSION_COOKIE)) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  const ref = searchParams.get('ref');
  if (ref && /^[a-z0-9]{4,32}$/i.test(ref)) {
    res.cookies.set(REFERRAL_COOKIE, ref.toLowerCase(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
  }
  return res;
}

export const config = {
  matcher: ['/', '/register', '/login', '/pricing', '/dashboard/:path*', '/settings/:path*', '/admin/:path*', '/orgs/:path*', '/farms/:path*', '/onboarding'],
};
