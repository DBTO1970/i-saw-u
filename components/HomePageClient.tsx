'use client';

import Image from 'next/image';
import ClientErrorBoundary from './ClientErrorBoundary';
import ShowMatchPanel from './ShowMatchPanel';
import UserNav from './UserNav';

type HomePageClientProps = {
  initialPhotoMetadata: Record<string, unknown>;
  showResult: {
    show: Record<string, unknown> | null;
    error: string | null;
    nearbyShows: unknown[];
    relatedDateShows: unknown[];
  };
  authError?: string | null;
  sharedPhotoPayload: {
    fileName?: string | null;
    receivedAt?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

export default function HomePageClient({ initialPhotoMetadata, showResult, authError, sharedPhotoPayload }: HomePageClientProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4 sm:mb-8 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Image
              src="/psychedelic_camera_lens_high_contrast.svg"
              alt="I Saw U logo"
              width={76}
              height={76}
              className="h-16 w-16 rounded-full border border-cyan-400/50 bg-slate-950/90 p-1.5 shadow-xl shadow-cyan-900/40 ring-1 ring-cyan-300/20 sm:h-20 sm:w-20"
              priority
            />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400 sm:text-sm sm:tracking-[0.35em]">i-saw-u</p>
              <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl md:text-3xl">EXIF & Concert Matcher</h1>
            </div>
          </div>
          <UserNav />
        </div>

        {authError && (
          <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm font-medium text-red-300">
            <strong>Authentication Error:</strong> {authError}
          </div>
        )}

        <div className="mb-6 space-y-2 sm:mb-8 sm:space-y-3">
          <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl">Drag and drop an image to inspect its EXIF data</h2>
          <details className="group rounded-2xl border border-slate-800 bg-slate-950/60 transition-all">
            <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-semibold text-slate-200 hover:text-cyan-400 sm:text-base">
              <span>About this app</span>
              <span className="text-xs text-slate-500 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="space-y-3 border-t border-slate-800/60 p-4 pt-3 text-sm text-slate-300 sm:text-base">
              <p className="max-w-2xl">
                Upload a photo to preview it and pull out the original capture date, latitude, and longitude from its EXIF metadata. That data is then matched to dedicated setlist providers for Phish, Goose, King Gizzard &amp; the Lizard Wizard, and more. If no EXIF data is found, you can manually enter a date to see if there was a show on that day. When possible, phish.in data and audio links will be included for Phish shows.
              </p>
              <p className="text-xs text-slate-400 sm:text-sm">
                Sign in with Google or GitHub to save uploaded WebP photos and matched show details directly to your personal library!
              </p>
              <p className="text-xs text-slate-400 sm:text-sm">
                By using this app, you agree to the{' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="text-cyan-400 underline decoration-cyan-500/30 underline-offset-4 transition-colors hover:text-cyan-300">
                  Terms of Use
                </a>
                .
              </p>
              <p className="text-xs text-slate-400 sm:text-sm">
                Want to explore the code, share feedback, or contribute? Visit the{' '}
                <a href="https://github.com/DBTO1970/i-saw-u" target="_blank" rel="noreferrer" className="text-cyan-400 underline decoration-cyan-500/30 underline-offset-4 transition-colors hover:text-cyan-300">
                  public GitHub repository
                </a>
                .
              </p>
            </div>
          </details>
        </div>

        <ClientErrorBoundary context="home-show-match-panel">
          <ShowMatchPanel
            initialPhotoMetadata={initialPhotoMetadata}
            initialShowResult={showResult}
            initialSharedPhoto={sharedPhotoPayload
              ? {
                fileName: sharedPhotoPayload.fileName || 'Shared photo',
                receivedAt: sharedPhotoPayload.receivedAt || null,
              }
              : null}
          />
        </ClientErrorBoundary>
        <p className="mt-8 text-xs text-slate-500">&copy; 2026 Don Barto Jr.</p>
      </div>
    </main>
  );
}
