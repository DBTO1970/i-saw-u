import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { Database } from './types';
import { getSupabasePublicKey, getSupabaseServiceRoleKey, getSupabaseUrl, hasSupabaseConfig } from './config';

function createFallbackClient() {
  const emptyQuery = () => ({
    select: () => emptyQuery(),
    eq: () => emptyQuery(),
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    update: () => emptyQuery(),
    insert: () => emptyQuery(),
    delete: () => emptyQuery(),
  });

  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      exchangeCodeForSession: async (_code: string) => ({ data: null, error: null }),
      signInWithOAuth: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => emptyQuery(),
      update: () => emptyQuery(),
      insert: () => emptyQuery(),
      delete: () => emptyQuery(),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: new Error('Supabase is not configured.') }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' }, error: null }),
      }),
    },
  };
}

export function createClient() {
  if (!hasSupabaseConfig()) {
    return createFallbackClient();
  }

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

export function createAdminClient() {
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Account deletion is not available until the service-role key is configured.');
  }

  return createSupabaseClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
