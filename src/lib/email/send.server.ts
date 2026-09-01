import "server-only";
import nodemailer from "nodemailer";

/**
 * CHRP transactional email.
 *
 * The same delivery pipe the account emails already use — Resend over SMTP —
 * reached directly here because a purchase email needs its own subject and
 * its own single action. The Supabase Auth templates are global per type and
 * belong to the verified Save My Report flow; nothing here touches them.
 *
 * Sending is ALWAYS downstream of fulfillment and always best-effort. Every
 * function in this module reports failure by returning it, never by throwing,
 * so no email problem can ever roll back a paid entitlement.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

export function smtpConfig(): SmtpConfig | null {
  const host = process.env.CHRP_SMTP_HOST;
  const user = process.env.CHRP_SMTP_USER;
  const pass = process.env.CHRP_SMTP_PASS;
  const from = process.env.CHRP_SMTP_FROM;
  if (!host || !user || !pass || !from) return null;
  return {
    host,
    port: Number(process.env.CHRP_SMTP_PORT ?? 465),
    user,
    pass,
    from,
    fromName: process.env.CHRP_SMTP_FROM_NAME ?? "CHRP Intelligence",
  };
}

export function emailConfigured(): boolean {
  return smtpConfig() !== null;
}

/**
 * The branded shell. Deliberately the same visual language as the account
 * emails: one column, system-safe fonts (custom faces are unreliable across
 * clients), no images, no attachments, one action.
 */
export function renderEmail(input: {
  heading: string;
  body: string;
  cta: string;
  ctaUrl: string;
  support: string;
}): string {
  const { heading, body, cta, ctaUrl, support } = input;
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0F0E0E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0F0E0E;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
<tr><td style="padding:0 0 32px 0;">
<span style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase;color:#A29C92;">CHRP Intelligence</span>
</td></tr>
<tr><td style="padding:0 0 18px 0;">
<h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.25;color:#FBFBF4;">${heading}</h1>
</td></tr>
<tr><td style="padding:0 0 32px 0;">
<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#A29C92;">${body}</p>
</td></tr>
<tr><td style="padding:0 0 28px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:#E6D74F;">
<a href="${ctaUrl}" style="display:block;padding:16px 32px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.12em;text-transform:uppercase;color:#0F0E0E;text-decoration:none;">${cta}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:0 0 40px 0;">
<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#6E665A;">${support}</p>
</td></tr>
<tr><td style="border-top:1px solid rgba(239,234,224,0.13);padding:24px 0 0 0;">
<p style="margin:0 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.5;color:#A29C92;">Know what your song does. Know where it belongs.</p>
<p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.08em;color:#6E665A;">CHRP &middot; Emotional Performance Intelligence</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed"; detail?: string };

/** Best-effort send. Never throws. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const cfg = smtpConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };

  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.from}>`,
      replyTo: process.env.CHRP_SMTP_REPLY_TO || undefined,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
