import type { SVGProps } from 'react';

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

/** Brand-coloured tile with a glyph — used for providers without a bundled logo. */
function brandTile(bg: string, glyph: string, opts: { fontSize?: number; fg?: string } = {}) {
  return function BrandTile(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden {...props}>
        <rect width="24" height="24" rx="5" fill={bg} />
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fill={opts.fg ?? '#fff'}
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight="700"
          fontSize={opts.fontSize ?? 15}
        >
          {glyph}
        </text>
      </svg>
    );
  };
}

export const FacebookIcon = brandTile('#1877F2', 'f', { fontSize: 18 });
export const XIcon = brandTile('#000000', '𝕏', { fontSize: 14 });
export const LinkedInIcon = brandTile('#0A66C2', 'in', { fontSize: 12 });
export const BitbucketIcon = brandTile('#2684FF', 'B', { fontSize: 14 });
export const GitLabIcon = brandTile('#FC6D26', 'GL', { fontSize: 10 });
export const SlackIcon = brandTile('#4A154B', '#', { fontSize: 16 });

export const providerIcons: Record<string, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  google: GoogleIcon,
  facebook: FacebookIcon,
  github: GitHubIcon,
  twitter: XIcon,
  linkedin: LinkedInIcon,
  bitbucket: BitbucketIcon,
  gitlab: GitLabIcon,
  slack: SlackIcon,
};
