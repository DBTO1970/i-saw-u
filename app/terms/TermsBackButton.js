'use client';

export default function TermsBackButton() {
  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = '/';
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
    >
      ← Back to previous page
    </button>
  );
}
