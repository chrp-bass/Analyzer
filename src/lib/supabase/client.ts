"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Used only for identity — anonymous sign-in on
 * first scan and the magic-link upgrade at save time. It is never used to
 * read or assert entitlement; that is a server decision.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
