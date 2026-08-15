import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '../../../../lib/supabase/server';
import { getShowByDate } from '../../../actions/shows';
import {
  getPublicPhotosForShow,
  getUserSavedShowByDate,
  getUserPhotosForShow,
} from '../../../actions/user-library';
import FanGalleryGrid from '../../../../components/FanGalleryGrid';
import ShowSetlistPhotos from '../../../../components/ShowSetlistPhotos';
import ShowBookmarkButton from '../../../../components/ShowBookmarkButton';
import { deriveCurrentSongLabelFromShowMetadata, normalizeTimeContextLabel } from '../../../../lib/photo-show-context';

export const dynamic = 'force-dynamic';

function isValidDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
}

function getRawExif(photo) {
  if (!photo?.raw_exif) {
    return {};
  }

  if (typeof photo.raw_exif === 'string') {
    try {
      return JSON.parse(photo.raw_exif) || {};
    } catch {
      return {};
    }
  }

  if (typeof photo.raw_exif === 'object' && !Array.isArray(photo.raw_exif)) {
    return photo.raw_exif;
  }

  return {};
}

export default async function ShowDetailPage({ params }) {
  const { showDate } = await params;

  if (!isValidDate(showDate)) {
    redirect('/library');
  }

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-sm text-slate-300">
            Loading show details...
          </div>
        </div>
      </div>
    );
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/');
  }

  const { show: savedShow } = await getUserSavedShowByDate(showDate);
  const savedArtistName = savedShow?.show_data?.artistName || 'Phish';

  const [
   { show: liveShow },
   { photos },
   publicGalleryResult,
  ] = await Promise.all([
   getShowByDate(showDate, savedArtistName),
   getUserPhotosForShow(showDate),
   getPublicPhotosForShow(showDate),
  ]);

  // Combine: prefer live Phish.net data for rich details; fall back to saved row
  const showData = liveShow
    ? liveShow
    : savedShow?.show_data
    ? savedShow.show_data
    : null;

  const artistName = showData?.artistName || savedShow?.show_data?.artistName || 'Show';
  const isPhishShow = String(showData?.provider || savedShow?.show_data?.provider || '').toLowerCase() === 'phishnet';
  const phishNetUrl = showData?.phishNetUrl || (isPhishShow ? `https://phish.net/setlists/?d=${encodeURIComponent(showDate)}` : null);
  const phishInUrl = isPhishShow ? (showData?.showUrl || `https://phish.in/${showDate}`) : null;

  const setlist = showData?.setlist || [];
  const showHeaderText = showData?.venueName || savedShow?.venue_name || 'Unknown Venue';
  const showLocation =
    showData?.city && showData?.state
      ? `${showData.city}, ${showData.state}`
      : savedShow?.location || '';

  // Build sections from the flat setlist array:
  // type 'set'/'encore' entries are section headers; type 'song' entries belong to the active section.
  const setGroups = [];
  let activeGroup = null;
  for (const entry of setlist) {
    const type = entry.type?.toLowerCase();
    if (type === 'set' || type === 'encore' || type === 'encores') {
      activeGroup = { label: entry.label, songs: [] };
      setGroups.push(activeGroup);
    } else if (type === 'song') {
      if (!activeGroup) {
        activeGroup = { label: 'Setlist', songs: [] };
        setGroups.push(activeGroup);
      }
      activeGroup.songs.push(entry);
    }
  }

  const allShowPhotos = [...(photos || []), ...(publicGalleryResult.photos || [])];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link
            href="/library"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            ← Library
          </Link>
          <span className="text-sm font-semibold text-cyan-400">{formatDate(showDate)}</span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-10 px-4 py-8">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">{artistName}</span>
              <h1 className="mt-1 text-2xl font-bold text-white">{showHeaderText}</h1>
              {showLocation ? <p className="text-sm text-slate-400">{showLocation}</p> : null}
              <p className="mt-1 text-base font-semibold text-slate-300">{formatDate(showDate)}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <a
                href={phishNetUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-cyan-700/50 bg-cyan-800/50 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-700/60"
              >
                phish.net ↗
              </a>
              {phishInUrl ? (
                <a
                  href={phishInUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-purple-700/50 bg-purple-800/50 px-4 py-2 text-xs font-semibold text-purple-200 transition hover:bg-purple-700/60"
                >
                  phish.in ↗
                </a>
              ) : null}
              <ShowBookmarkButton
                showDate={showDate}
                showData={showData}
                initialIsBookmarked={!!savedShow}
              />
            </div>
          </div>
        </div>

        {setGroups.length > 0 ? (
          <section>
            <h2 className="mb-4 text-lg font-bold text-white">Setlist</h2>
            <ShowSetlistPhotos setGroups={setGroups} photos={allShowPhotos} currentUserId={user.id} />
          </section>
        ) : showData ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
            Setlist data not available for this show.
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
            Could not load show data. Check back later.
            {phishNetUrl ? (
              <>
                {' '}
                or{' '}
                <a href={phishNetUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">
                  view the source show page
                </a>
                .
              </>
            ) : null}
          </div>
        )}

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Fan Gallery</h2>
          {publicGalleryResult.error ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
              {publicGalleryResult.error}
            </div>
          ) : publicGalleryResult.photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-400">
              No public fan photos yet for this show.
            </div>
          ) : (
            <FanGalleryGrid photos={publicGalleryResult.photos} currentUserId={user.id} />
          )}
        </section>

        <section className="space-y-4">
          <h2 className="mb-4 text-lg font-bold text-white">
            Your Photos from This Show
            {photos.length > 0 ? (
              <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                {photos.length}
              </span>
            ) : null}
          </h2>
          {photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-400">
              No photos from this show in your library yet.{' '}
              <Link href="/" className="text-cyan-400 underline">
                Upload one now →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => {
                const exif = getRawExif(photo);
                const showMetadata = exif?.showMetadata && typeof exif.showMetadata === 'object' ? exif.showMetadata : {};
                const currentSong =
                  deriveCurrentSongLabelFromShowMetadata(showMetadata, exif) || '';
                const timeLabel = normalizeTimeContextLabel(showMetadata?.timeContextLabel || '');

                return (
                  <Link
                    key={photo.id}
                    href={`/library/photo/${photo.id}`}
                    className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-900/20"
                  >
                    {photo.thumb_url || photo.url ? (
                      <div className="relative aspect-square w-full">
                        <Image
                          src={photo.thumb_url || photo.url}
                          alt={photo.file_name || 'Photo'}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          loading="lazy"
                          decoding="async"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-slate-800 text-xs text-slate-600">
                        No preview
                      </div>
                    )}
                    {(currentSong || timeLabel) ? (
                      <div className="p-2">
                        {currentSong ? (
                          <p className="truncate text-xs font-semibold text-cyan-300">{currentSong}</p>
                        ) : null}
                        {timeLabel ? <p className="truncate text-[10px] text-slate-400">{timeLabel}</p> : null}
                      </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
