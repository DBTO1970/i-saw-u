export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

export function getSupabasePublicKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim()
    || (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}
