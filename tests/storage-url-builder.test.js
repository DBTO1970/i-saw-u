import { describe, expect, it } from 'vitest';
import { buildPublicStorageUrl, buildPublicThumbnailUrl, toThumbnailStoragePath } from '../lib/supabase/config';

describe('storage url builder', () => {
  it('routes public storage paths through the local storage proxy', () => {
    expect(buildPublicStorageUrl('abc/123.webp')).toBe(
      '/storage-proxy/show-photos/abc/123.webp'
    );
    expect(toThumbnailStoragePath('user123/show456/photo.webp')).toBe('user123/show456/thumbs/photo.webp');
    expect(buildPublicThumbnailUrl('user123/show456/photo.webp')).toBe(
      '/storage-proxy/show-photos/user123/show456/thumbs/photo.webp'
    );
  });

  it('returns null when no base url or file path is available', () => {
    expect(buildPublicStorageUrl('')).toBeNull();
    expect(buildPublicStorageUrl('   ')).toBeNull();
  });
});
