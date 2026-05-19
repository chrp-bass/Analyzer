import { MODE } from "@/lib/accounts";

const TOKENS_KEY = "chrp_magic_tokens";

function ls(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function sendReceipt(userId: string, scanId: string): Promise<void> {
  if (MODE === "demo") {
    console.log(`[DEMO] Receipt sent to user ${userId} for scan ${scanId}`);
    return;
  }
  throw new Error("Production email (Resend) not yet connected");
}

export async function sendMagicLink(email: string): Promise<{ token: string }> {
  if (MODE === "demo") {
    const token = `magic_${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const s = ls();
    if (s) {
      try {
        const existing = JSON.parse(s.getItem(TOKENS_KEY) || "{}");
        existing[token] = { email, createdAt: new Date().toISOString() };
        s.setItem(TOKENS_KEY, JSON.stringify(existing));
      } catch {
        // ignore
      }
    }
    console.log(`[DEMO] Magic link for ${email}: /auth/claim/${token}`);
    return { token };
  }
  throw new Error("Production email (Resend) not yet connected");
}

export async function consumeMagicToken(
  token: string,
): Promise<{ email: string } | null> {
  if (MODE === "demo") {
    const s = ls();
    if (!s) return null;
    try {
      const all = JSON.parse(s.getItem(TOKENS_KEY) || "{}");
      const entry = all[token];
      if (!entry) return null;
      delete all[token];
      s.setItem(TOKENS_KEY, JSON.stringify(all));
      return { email: entry.email };
    } catch {
      return null;
    }
  }
  throw new Error("Production email (Resend) not yet connected");
}

export async function sendProfileUnlock(userId: string): Promise<void> {
  if (MODE === "demo") {
    console.log(`[DEMO] Profile unlock notification sent to user ${userId}`);
    return;
  }
  throw new Error("Production email (Resend) not yet connected");
}
