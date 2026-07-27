import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '../../../../lib/supabase/server';
import { getShowByDate } from '../../../actions/shows';
import {
  getUserSavedShowByDate,
  getUserPhotosForShow,
} from '../../../actions/user-library';

function isValidDate(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
}

export default async function ShowDetailPage({ params }) {
  const { showDate } = await params;

  if (!isValidDate(showDate)) {
    redirect('/library');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/');
  }

  const [
    { show: savedShow },
    { show: liveShow },
    { photos },
  ] = await Promise.all([
    getUserSavedShowByDate(showDate),
    getShowByDate(showDate),
    getUserPhotosForShow(showDate),
  ]);

  // Combine: prefer live Phish.net data for rich details; fall back to saved row
  const showData = liveShow
    ? liveShow
    : savedShow?.show_data
    ? savedShow.show_data
    : null;

  const venueName = showData?.venueName || savedShow?.venue_name || 'Unknown Venue';
  const location =
    showData?.city && showData?.state
      ? `${showData.city}, ${showData.state}`
      : savedShow?.location || '';
  const phishNetUrl =
    showData?.phishNetUrl ||
    `https://phish.net/setlists/?d=${encodeURIComponent(showDate)}`;
  const phishInUrl = showData?.showUrl || `https://phish.in/${showDate}`;

  const setlist = showData?.setlist || [];

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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
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

      <div className="mx-auto max-w-5xl px-4 py-8 space-y-10">
      
        {/* Photos from this show */}
        <section>
          <h2 className="mb-4 text-lg font-bold text-white">
            Your Photos from This Show
            {photos.length > 0 && (
              <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300">
                {photos.length}
              </span>
            )}
          </h2>
          {photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-400 text-sm">
              No photos from this show in your library yet.{' '}
              <Link href="/" className="text-cyan-400 underline">
                Upload one now →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => {
                const exif = (() => {
                  try { return JSON.parse(photo.raw_exif || '{}'); } catch { return {}; }
                })();
                const currentSong = exif.showMetadata?.currentSong || '';
                const timeLabel = exif.showMetadata?.timeContextLabel || '';

                return (
                  <Link
                    key={photo.id}
                    href={`/library/photo/${photo.id}`}
                    className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition-all hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-900/20"
                  >
                    {photo.url ? (
                      <div className="relative aspect-square w-full">
                        <Image
                          src={photo.url}
                          alt={photo.filename || 'Photo'}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-slate-800 text-slate-600 text-xs">
                        No preview
                      </div>
                    )}
                    {(currentSong || timeLabel) && (
                      <div className="p-2">
                        {currentSong && (
                          <p className="truncate text-xs font-semibold text-cyan-300">{currentSong}</p>
                        )}
                        {timeLabel && (
                          <p className="truncate text-[10px] text-slate-400">{timeLabel}</p>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        {/* Show header card */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-bold text-cyan-400 tracking-widest uppercase">Phish</span>
              <h1 className="mt-1 text-2xl font-bold text-white">{venueName}</h1>
              {location && <p className="text-sm text-slate-400">{location}</p>}
              <p className="mt-1 text-base font-semibold text-slate-300">{formatDate(showDate)}</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <a
                href={phishNetUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-cyan-800/50 border border-cyan-700/50 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-700/60"
              >
                phish.net ↗
              </a>
              <a
                href={phishInUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-purple-800/50 border border-purple-700/50 px-4 py-2 text-xs font-semibold text-purple-200 transition hover:bg-purple-700/60"
              >
                phish.in ↗
              </a>
            </div>
          </div>
        </div>

        {/* Setlist */}
        {setGroups.length > 0 ? (
          <section>
            <h2 className="mb-4 text-lg font-bold text-white">Setlist</h2>
            <div className="space-y-5">
              {setGroups.map((group) => (
                <div key={group.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-400">
                    {group.label}
                  </h3>
                  <ol className="space-y-1">
                    {group.songs.map((song, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-slate-500">{i + 1}.</span>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm text-white">{song.label}</span>
                          {song.notes && (
                            <span className="text-xs text-slate-400 italic">{song.notes}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        ) : showData ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-400 text-sm">
            Setlist data not available for this show.
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-400 text-sm">
            Could not load show data. Check back later or{' '}
            <a href={phishNetUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">
              view on phish.net
            </a>
            .
          </div>
        )}

      </div>
    </div>
  );
}
