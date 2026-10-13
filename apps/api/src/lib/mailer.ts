import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../config/env';
import { defineJob } from '../core/jobs';
import { logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/** Delivers immediately. Throws on SMTP failure so the job queue can retry. */
export async function deliverMail(message: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    logger.info({ to: message.to, subject: message.subject, text: message.text }, '📧 Email (SMTP not configured)');
    return;
  }
  await t.sendMail({ from: env.MAIL_FROM, ...message });
}

const mailJob = defineJob<MailMessage>('mail.send', deliverMail, { maxAttempts: 6 });

/**
 * Sends an email through the background job queue (retried with backoff on
 * SMTP errors). Without SMTP configured the message is logged instead, so
 * local development works with zero setup. Never throws, so a mail outage
 * can't break sign-up or login flows.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    if (isTest) return await deliverMail(message);
    await mailJob.enqueue(message);
  } catch (err) {
    logger.error({ err, to: message.to, subject: message.subject }, 'Failed to send email');
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface EmailContent {
  heading: string;
  body: string[];
  /** Primary call-to-action button. */
  action?: { label: string; url: string };
  /** One-time code shown large and spaced (OTP emails). */
  code?: string;
  /** Small print under the main content, e.g. "Didn't request this? Ignore it." */
  note?: string;
  /** Inbox preview text. Defaults to the first non-greeting body line. */
  preheader?: string;
  footer?: string;
}

const BRAND = '#15803d';

/**
 * Polished, client-safe transactional email layout: table based with inline
 * styles (Gmail/Outlook friendly), a hidden preheader, optional button and
 * one-time-code block, and a plain-text alternative.
 */
export function renderEmail(opts: EmailContent): { html: string; text: string } {
  const app = escapeHtml(env.APP_NAME);
  const initial = escapeHtml(env.APP_NAME.trim().charAt(0).toUpperCase() || 'S');
  // Inbox preview: skip a leading greeting ("Hi Jane,") — it says nothing useful.
  const firstLine = opts.body.find((p) => !/^(?:hi|hello|hey)[\s,!]/i.test(p));
  const preheader = escapeHtml(opts.preheader ?? firstLine ?? opts.heading);
  const paragraphs = opts.body
    .map((p) => `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:24px">${escapeHtml(p)}</p>`)
    .join('');
  const code = opts.code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;width:100%"><tr><td align="center" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px 12px">
         <span style="font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#14532d">${escapeHtml(opts.code)}</span>
       </td></tr></table>`
    : '';
  const button = opts.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:${BRAND}">
         <a href="${escapeHtml(opts.action.url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px">${escapeHtml(opts.action.label)} &rarr;</a>
       </td></tr></table>
       <p style="margin:0 0 16px;color:#94a3b8;font-size:12px;line-height:18px">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(opts.action.url)}" style="color:${BRAND};word-break:break-all">${escapeHtml(opts.action.url)}</a></p>`
    : '';
  const note = opts.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eef2f7;color:#94a3b8;font-size:13px;line-height:20px">${escapeHtml(opts.note)}</p>`
    : '';
  const footer = escapeHtml(opts.footer ?? `You're receiving this email because of your ${env.APP_NAME} account.`);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6f2;padding:40px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
      <tr><td style="padding:0 4px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;height:36px;border-radius:10px;background:${BRAND};color:#fff;font-weight:700;font-size:17px;text-align:center;vertical-align:middle">${initial}</td>
          <td style="padding-left:10px;font-weight:700;font-size:17px;color:#0f172a">${app}</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e8eaf3;box-shadow:0 1px 3px rgba(15,23,42,.06)">
        <div style="height:4px;border-radius:16px 16px 0 0;background:linear-gradient(90deg,${BRAND},#22c55e,#f59e0b)"></div>
        <div style="padding:36px 36px 32px">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:#0f172a">${escapeHtml(opts.heading)}</h1>
          ${paragraphs}${code}${button}${note}
        </div>
      </td></tr>
      <tr><td align="center" style="padding:24px 16px 0;color:#94a3b8;font-size:12px;line-height:18px">${footer}<br>&copy; ${new Date().getFullYear()} ${app}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    opts.heading,
    '',
    ...opts.body,
    ...(opts.code ? ['', `Your code: ${opts.code}`] : []),
    ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : []),
    ...(opts.note ? ['', opts.note] : []),
    '',
    `— ${env.APP_NAME}`,
  ].join('\n');
  return { html, text };
}
