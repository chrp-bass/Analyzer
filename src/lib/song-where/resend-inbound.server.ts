import "server-only";
import { Resend } from "resend";

export type ResendInbound = {
  emailId: string;
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  text: string;
  authenticated: boolean;
  hasAttachments: boolean;
};

function header(headers: Record<string, string> | null, name: string): string {
  if (!headers) return "";
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1] ?? "";
}

export async function verifiedResendInbound(raw: string, headers: Headers): Promise<ResendInbound | null> {
  // CHRP's existing Resend SMTP password is an API key; a dedicated inbound key may replace it later.
  const apiKey = process.env.RESEND_API_KEY ?? process.env.CHRP_SMTP_PASS;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const expectedRecipient = process.env.SONG_WHERE_RESEND_TO?.toLowerCase();
  if (!apiKey || !webhookSecret || !expectedRecipient) return null;
  const resend = new Resend(apiKey);
  let event: ReturnType<typeof resend.webhooks.verify>;
  try {
    event = resend.webhooks.verify({ payload: raw, webhookSecret, headers: {
      id: headers.get("svix-id") ?? "", timestamp: headers.get("svix-timestamp") ?? "",
      signature: headers.get("svix-signature") ?? "",
    } });
  } catch { return null; }
  if (event.type !== "email.received" || !event.data.to.some((to) => to.toLowerCase() === expectedRecipient) ||
      event.data.attachments.length > 0) return null;
  const received = await resend.emails.receiving.get(event.data.email_id);
  if (received.error || !received.data || received.data.id !== event.data.email_id ||
      received.data.message_id !== event.data.message_id) return null;
  const auth = header(received.data.headers, "authentication-results").toLowerCase();
  const authenticated = /\bdkim=pass\b/.test(auth) && /\b(?:dmarc|spf)=pass\b/.test(auth);
  const text = (received.data.text ?? received.data.html ?? "").slice(0, 30_000);
  if (!authenticated || !text) return null;
  return { emailId: received.data.id, messageId: received.data.message_id,
    from: received.data.from, to: received.data.to, subject: received.data.subject,
    receivedAt: received.data.created_at, text, authenticated,
    hasAttachments: received.data.attachments.length > 0 };
}
