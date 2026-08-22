import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types';
import { getSupabasePublicKey, getSupabaseUrl, hasSupabaseConfig } from './config';

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
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => undefined,
          },
        },
      }),
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

  return createBrowserClient<Database>(
    getSupabaseUrl(),
    getSupabasePublicKey(),
  );
}
