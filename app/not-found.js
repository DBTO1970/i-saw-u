export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-xl shadow-slate-950/40">
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-cyan-400">Not found</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">We couldn’t find that page.</h1>
        <p className="mt-3 text-sm text-slate-400">Try returning to the home page and uploading an image again.</p>
      </div>
    </main>
  );
}
