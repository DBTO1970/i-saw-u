import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import UserNav from '../../../../components/UserNav';
import LibraryPhotoDetailEditor from '../../../../components/LibraryPhotoDetailEditor';
import { createClient } from '../../../../lib/supabase/server';
import { getUserLibraryPhotoById, getUserLibraryPhotoSiblings } from '../../../actions/user-library';

export const dynamic = 'force-dynamic';

export default async function LibraryPhotoDetailPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const photoId = params?.photoId;
  const { photo, error } = await getUserLibraryPhotoById(photoId);
  const { previousPhotoId, nextPhotoId } = await getUserLibraryPhotoSiblings(photoId);

  if (!photo || error) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <Link href="/library" className="inline-flex items-center text-xs font-semibold uppercase tracking-widest text-cyan-400 hover:underline">
              ← Back to Library
            </Link>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Photo Details</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {previousPhotoId ? (
              <Link
                href={`/library/photo/${previousPhotoId}`}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                ← Newer photo
              </Link>
            ) : null}
            {nextPhotoId ? (
              <Link
                href={`/library/photo/${nextPhotoId}`}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
              >
                Older photo →
              </Link>
            ) : null}
            <UserNav />
          </div>
        </div>

        <LibraryPhotoDetailEditor initialPhoto={photo} />
      </div>
    </main>
  );
}
