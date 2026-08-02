import { adjectives, nouns, uniqueUsernameGenerator } from 'unique-username-generator';

type SupabaseClientLike = {
  from: (table: string) => any;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const PROVIDER_PROFILE_KEYS = ['full_name', 'name', 'user_name', 'preferred_username', 'login', 'nickname'];

function normalizeComparableValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function deriveProviderComparableValues(user: AuthUserLike): Set<string> {
  const comparable = new Set<string>();
  const metadata = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};

  for (const key of PROVIDER_PROFILE_KEYS) {
    const raw = normalizeComparableValue(metadata[key]);
    if (raw) {
      comparable.add(raw);
    }
  }

  const email = normalizeComparableValue(user.email);
  if (email) {
    comparable.add(email);
    const localPart = email.split('@')[0] || '';
    if (localPart) {
      comparable.add(localPart);
    }
  }

  return comparable;
}

function isProviderDerivedValue(value: unknown, providerValues: Set<string>): boolean {
  const normalized = normalizeComparableValue(value);
  return normalized ? providerValues.has(normalized) : false;
}

function shouldRegenerateUsername(username: unknown, providerValues: Set<string>): boolean {
  const normalized = normalizeComparableValue(username);
  if (!normalized) {
    return true;
  }
  if (normalized.startsWith('fan_')) {
    return true;
  }
  return isProviderDerivedValue(normalized, providerValues);
}

function shouldRegenerateDisplayName(displayName: unknown, providerValues: Set<string>): boolean {
  const normalized = normalizeComparableValue(displayName);
  if (!normalized) {
    return true;
  }
  return isProviderDerivedValue(normalized, providerValues);
}

function toDisplayNameFromUsername(username: string): string {
  return username
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = 'code' in error ? String(error.code || '') : '';
  return code === '23505';
}

async function usernameExists(supabase: SupabaseClientLike, candidate: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', candidate)
    .neq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed checking username uniqueness: ${error.message}`);
  }

  return Boolean(data?.id);
}

async function generateAvailableUsername(supabase: SupabaseClientLike, userId: string): Promise<string> {
  for (let index = 0; index < 12; index += 1) {
    const candidate = uniqueUsernameGenerator({
      dictionaries: [adjectives, nouns],
      separator: '-',
      style: 'lowerCase',
      randomDigits: 3,
      length: 24,
    });
    if (!(await usernameExists(supabase, candidate, userId))) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique username after multiple attempts.');
}

export async function ensureGeneratedProfileIdentity(
  supabase: SupabaseClientLike,
  user: AuthUserLike,
  profile: Record<string, unknown> | null = null,
): Promise<Record<string, unknown>> {
  const providerValues = deriveProviderComparableValues(user);

  let currentProfile = profile;
  if (!currentProfile) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed fetching user profile: ${error.message}`);
    }
    currentProfile = data || null;
  }

  const needsUsername = shouldRegenerateUsername(currentProfile?.username, providerValues);
  const needsDisplayName = shouldRegenerateDisplayName(currentProfile?.display_name, providerValues);

  if (!currentProfile) {
    for (let index = 0; index < 6; index += 1) {
      const username = await generateAvailableUsername(supabase, user.id);
      const displayName = toDisplayNameFromUsername(username);
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username,
          display_name: displayName,
          avatar_url: toOptionalString(user.user_metadata?.avatar_url),
        }, { onConflict: 'id' })
        .select('*')
        .single();
      if (!error) {
        return data;
      }
      if (!isUniqueConstraintViolation(error)) {
        throw new Error(`Failed creating generated profile identity: ${error.message}`);
      }
    }
    throw new Error('Failed creating generated profile identity due to repeated username collisions.');
  }

  if (!needsUsername && !needsDisplayName) {
    return currentProfile;
  }

  for (let index = 0; index < 6; index += 1) {
    const username = needsUsername
      ? await generateAvailableUsername(supabase, user.id)
      : String(currentProfile.username);
    const displayName = needsDisplayName
      ? toDisplayNameFromUsername(username)
      : String(currentProfile.display_name);

    const { data, error } = await supabase
      .from('profiles')
      .update({
        username,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (!error) {
      return data;
    }
    if (!isUniqueConstraintViolation(error)) {
      throw new Error(`Failed updating generated profile identity: ${error.message}`);
    }
  }
  throw new Error('Failed updating generated profile identity due to repeated username collisions.');
}
