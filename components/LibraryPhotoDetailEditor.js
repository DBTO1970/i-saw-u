'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePhotoFromLibrary, updateUserLibraryPhotoMetadata } from '../app/actions/user-library';
import ShowMatchCard from './ShowMatchCard';

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function toShowCardPhotoMetadata(form, rawExif) {
  const latitude = form.gpsLatitude?.trim() || '';
  const longitude = form.gpsLongitude?.trim() || '';
  const dateTaken = form.dateTaken?.trim() || '';
  const timeTaken = form.timeTaken?.trim() || '';

  return {
    dateTimeOriginal: dateTaken || 'Not available',
    dateTimeOriginalDisplay: dateTaken || 'Not available',
    timeTaken: timeTaken || 'Not available',
    gpsLatitude: latitude || 'Not available',
    gpsLongitude: longitude || 'Not available',
    rawGpsLatitude: latitude ? Number(latitude) : null,
    rawGpsLongitude: longitude ? Number(longitude) : null,
    rawDateTimeOriginal: dateTaken ? `${dateTaken}${timeTaken ? ` ${timeTaken}` : ''}` : null,
    dateSource: rawExif?.dateSource || 'manual',
    timeSource: rawExif?.timeSource || 'manual',
    gpsSource: rawExif?.gpsSource || rawExif?.locationSource || 'manual',
    locationSource: rawExif?.locationSource || 'manual',
    userTags: Array.isArray(rawExif?.userTags) ? rawExif.userTags : [],
  };
}

export default function LibraryPhotoDetailEditor({ initialPhoto }) {
  const router = useRouter();
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [form, setForm] = useState({
    fileName: initialPhoto.file_name || '',
    dateTaken: initialPhoto.date_taken || '',
    timeTaken: initialPhoto.time_taken || '',
    showStartTime: initialPhoto.show_start_time || '',
    matchedShowDate: initialPhoto.matched_show_date || '',
    gpsLatitude: initialPhoto.gps_latitude != null ? String(initialPhoto.gps_latitude) : '',
    gpsLongitude: initialPhoto.gps_longitude != null ? String(initialPhoto.gps_longitude) : '',
    rawExif: safeJsonStringify(initialPhoto.raw_exif),
  });
  const parsedRawExif = useMemo(() => {
    try {
      const parsed = JSON.parse(form.rawExif || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return null;
    }
  }, [form.rawExif]);
  const savedShowMetadata = parsedRawExif?.showMetadata && typeof parsedRawExif.showMetadata === 'object'
    ? parsedRawExif.showMetadata
    : null;
  const savedShowData = savedShowMetadata?.showData && typeof savedShowMetadata.showData === 'object'
    ? savedShowMetadata.showData
    : null;
  const showForCard = savedShowData || (
    savedShowMetadata?.matchedShowDate || initialPhoto.matched_show_date
      ? {
          date: savedShowMetadata?.matchedShowDate || initialPhoto.matched_show_date || null,
          venueName: savedShowMetadata?.venueName || 'Unknown venue',
          city: savedShowMetadata?.city || null,
          state: savedShowMetadata?.state || null,
          setlist: [],
        }
      : null
  );
  const showCardPhotoMetadata = useMemo(
    () => toShowCardPhotoMetadata(form, parsedRawExif || {}),
    [form, parsedRawExif]
  );

  const onChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);

    const response = await updateUserLibraryPhotoMetadata(initialPhoto.id, form);
    if (!response?.success) {
      setSaveStatus({ type: 'error', text: response?.error || 'Failed to save metadata.' });
      setIsSaving(false);
      return;
    }

    setSaveStatus({ type: 'success', text: 'Metadata saved successfully.' });
    setIsSaving(false);
  };

  const handleDelete = async () => {
    const shouldDelete = window.confirm('Delete this photo from your library? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    setSaveStatus(null);
    const response = await deletePhotoFromLibrary(initialPhoto.id, initialPhoto.storage_path);
    if (!response?.success) {
      setSaveStatus({ type: 'error', text: response?.error || 'Failed to delete photo.' });
      setIsDeleting(false);
      return;
    }

    router.push('/library');
    router.refresh();
  };

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Photo</p>
            <p className="text-xs text-slate-500">{initialPhoto.file_name}</p>
          </div>
          {initialPhoto.url ? (
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(true)}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/20"
            >
              Expand full screen
            </button>
          ) : null}
        </div>
        {initialPhoto.url ? (
          <div className="p-4">
            <img src={initialPhoto.url} alt={initialPhoto.file_name} className="mx-auto max-h-[70vh] w-full rounded-xl object-contain" />
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">Photo preview unavailable.</div>
        )}
      </div>

      {isFullscreenOpen && initialPhoto.url ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setIsFullscreenOpen(false)}>
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(false)}
            className="absolute right-5 top-5 rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Close
          </button>
          <img
            src={initialPhoto.url}
            alt={initialPhoto.file_name}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="text-sm font-semibold text-white">Metadata</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            File name
            <input value={form.fileName} onChange={onChange('fileName')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Matched show date
            <input type="date" value={form.matchedShowDate} onChange={onChange('matchedShowDate')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Date taken
            <input type="date" value={form.dateTaken} onChange={onChange('dateTaken')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Time taken
            <input type="time" value={form.timeTaken} onChange={onChange('timeTaken')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Show start time
            <input type="time" value={form.showStartTime} onChange={onChange('showStartTime')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            GPS latitude
            <input value={form.gpsLatitude} onChange={onChange('gpsLatitude')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            GPS longitude
            <input value={form.gpsLongitude} onChange={onChange('gpsLongitude')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
        </div>

        <label className="block text-xs text-slate-300">
          Raw EXIF JSON
          <textarea
            value={form.rawExif}
            onChange={onChange('rawExif')}
            rows={8}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs text-white"
          />
        </label>

        {saveStatus ? (
          <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${saveStatus.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
            {saveStatus.text}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={isSaving || isDeleting}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save metadata'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || isSaving}
            className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-60"
          >
            {isDeleting ? 'Deleting...' : 'Delete photo'}
          </button>
        </div>
      </form>

      {showForCard ? (
        <ShowMatchCard
          photoMetadata={showCardPhotoMetadata}
          show={showForCard}
          showStartTime={form.showStartTime || '19:30'}
          onShowStartTimeChange={(nextTime) => {
            setForm((current) => ({
              ...current,
              showStartTime: nextTime,
            }));
          }}
          onTimeContextChange={(context) => {
            setForm((current) => {
              try {
                const parsed = JSON.parse(current.rawExif || '{}');
                const nextRawExif = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
                const nextShowMetadata = nextRawExif.showMetadata && typeof nextRawExif.showMetadata === 'object'
                  ? { ...nextRawExif.showMetadata }
                  : {};
                nextShowMetadata.currentSong = context?.songLabel || null;
                nextShowMetadata.timeContextLabel = context?.label || null;
                nextRawExif.showMetadata = nextShowMetadata;
                const nextRawExifText = JSON.stringify(nextRawExif, null, 2);
                if (nextRawExifText === current.rawExif) {
                  return current;
                }
                return {
                  ...current,
                  rawExif: nextRawExifText,
                };
              } catch {
                return current;
              }
            });
          }}
        />
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          No saved show information found for this photo yet.
        </div>
      )}
    </section>
  );
}
