import { createBrowserClient } from '@supabase/ssr';
import { Database } from './types';
import { getSupabasePublicKey, getSupabaseUrl } from './config';

export function createClient() {
  return createBrowserClient<Database>(
    getSupabaseUrl(),
    getSupabasePublicKey(),
  );
}
