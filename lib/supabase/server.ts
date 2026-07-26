import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from './types';
import { getSupabasePublicKey, getSupabaseUrl } from './config';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}
