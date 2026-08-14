import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/server';
import { getUserLikedPhotos } from '../../actions/user-library';
import UserNav from '../../../components/UserNav';
import PhotoLikeButton from '../../../components/PhotoLikeButton';
import { deriveCurrentSongLabelFromShowMetadata } from '../../../lib/photo-show-context';

export const dynamic = 'force-dynamic';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function formatLikedAt(timestamp) {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRawExifField(photo, field) {
  const raw = photo?.raw_exif;
  if (!raw || typeof raw !== 'object') return null;
  return raw?.showMetadata?.[field] || raw?.[field] || null;
}

function getRawExifObject(photo) {
  const raw = photo?.raw_exif;
  if (!raw) {
    return {};
  }

  function getArtistNameFromShowMetadata(showMetadata, rawExif) {
    return (
      showMetadata?.artistName
      || showMetadata?.artist_name
      || rawExif.artistName
      || rawExif.artist_name
      || 'Show'
    );
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }

  return {};
}

export default async function FavoritesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { photos, error } = await getUserLikedPhotos();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(244,63,94,0.10),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <Link href="/library" className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-cyan-400 hover:underline">
              ← Back to Library
            </Link>
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-rose-400">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Favorites Gallery</h1>
            </div>
            <p className="text-sm text-slate-400">Photos you&apos;ve liked from other fans</p>
          </div>
          <UserNav />
        </div>

        {error ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-slate-400">
            {error}
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-4 h-12 w-12 text-slate-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            <p className="text-base font-semibold text-slate-300">No liked photos yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Tap the{' '}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="inline h-4 w-4 align-text-bottom">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              {' '}icon on any fan photo to save it here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400">{photos.length} liked {photos.length === 1 ? 'photo' : 'photos'}</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo) => {
                const showDate = photo.matched_show_date || null;
                const venueName = getRawExifField(photo, 'venueName') || null;
                const city = getRawExifField(photo, 'city') || null;
                const state = getRawExifField(photo, 'state') || null;
                const location = [city, state].filter(Boolean).join(', ') || null;
                const rawExif = getRawExifObject(photo);
                const showMetadata = rawExif?.showMetadata && typeof rawExif.showMetadata === 'object' ? rawExif.showMetadata : {};
                const currentSong = deriveCurrentSongLabelFromShowMetadata(showMetadata, rawExif) || null;
                const artistName = getArtistNameFromShowMetadata(showMetadata, rawExif);
                const creatorName = photo.creator?.display_name || photo.creator?.username || 'Anonymous';

                return (
                  <div
                    key={photo.id}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 transition-all hover:border-rose-500/30"
                  >
                    {/* Photo */}
                    {photo.thumb_url || photo.url ? (
                      <div className="relative aspect-square w-full overflow-hidden bg-slate-900">
                        <img
                          src={photo.thumb_url || photo.url}
                          alt={photo.file_name || 'Fan photo'}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                        Photo unavailable
                      </div>
                    )}

                    {/* Info */}
                    <div className="space-y-3 p-4">
                      {/* Show info */}
                      {showDate ? (
                        <Link
                          href={`/library/show/${showDate}`}
                          className="block rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 transition hover:border-cyan-500/40"
                        >
                          <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-400">{artistName} · {formatDate(showDate)}</p>
                          {venueName ? <p className="mt-0.5 truncate text-sm font-semibold text-white">{venueName}</p> : null}
                          {location ? <p className="truncate text-xs text-slate-400">{location}</p> : null}
                        </Link>
                      ) : null}

                      {/* Song context */}
                      {currentSong ? (
                        <p className="truncate text-xs font-medium text-cyan-300">🎵 {currentSong}</p>
                      ) : null}

                      {/* Creator */}
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs text-slate-400">
                          
                        </p>
                        <PhotoLikeButton
                          photoId={photo.id}
                          initialLikeCount={photo.like_count}
                          initialLikedByMe={true}
                          size="sm"
                        />
                      </div>

                      {/* Liked at */}
                      {photo.liked_at ? (
                        <p className="text-[10px] text-slate-600">
                          Liked {formatLikedAt(photo.liked_at)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
