export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

export function buildPublicStorageUrl(filePath: string): string | null {
  const normalizedFilePath = (filePath || '').trim().replace(/^\/+/, '');

  if (!normalizedFilePath) {
    return null;
  }

  return `/storage-proxy/show-photos/${normalizedFilePath}`;
}

export function toThumbnailStoragePath(filePath: string): string | null {
  const normalizedFilePath = (filePath || '').trim().replace(/^\/+/, '');
  if (!normalizedFilePath) {
    return null;
  }

  const segments = normalizedFilePath.split('/').filter(Boolean);
  if (segments.length < 3) {
    return null;
  }

  const fileName = segments.pop();
  if (!fileName) {
    return null;
  }

  return `${segments.join('/')}${segments.length > 0 ? '/' : ''}thumbs/${fileName}`;
}

export function buildPublicThumbnailUrl(filePath: string): string | null {
  const thumbnailStoragePath = toThumbnailStoragePath(filePath);
  if (!thumbnailStoragePath) {
    return null;
  }

  return buildPublicStorageUrl(thumbnailStoragePath);
}

export function getSupabasePublicKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim()
    || (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

export function getSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}
