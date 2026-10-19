'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePhotoFromLibrary, updateUserLibraryPhotoMetadata } from '../app/actions/user-library';
import PhotoVisibilityToggle from './PhotoVisibilityToggle';
import ShowMatchCard from './ShowMatchCard';
import { deriveCurrentSongLabelFromShowMetadata } from '../lib/photo-show-context';

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
  const [isPublic, setIsPublic] = useState(!!initialPhoto.is_public);
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
  const initialTimeContextLabel = savedShowMetadata?.timeContextLabel || '';
  const initialCurrentSongLabel = deriveCurrentSongLabelFromShowMetadata(savedShowMetadata, parsedRawExif || {});
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

  const handleShowStartTimeChange = useCallback((nextTime) => {
    setForm((current) => ({
      ...current,
      showStartTime: nextTime,
    }));
  }, []);

  const onChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const toggleVisibilityInForm = () => {
    setIsPublic((prev) => !prev);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);

    // include isPublic explicitly in payload
    const payload = { ...form, isPublic };

    const response = await updateUserLibraryPhotoMetadata(initialPhoto.id, payload);
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
    <section className="space-y-4 md:space-y-6">
      <div className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-slate-900/95 via-slate-950/85 to-slate-950/70 shadow-xl shadow-cyan-950/20 md:rounded-3xl md:bord...">
        {initialPhoto.photo_url || initialPhoto.url ? (
          <div className="p-2 sm:p-4 md:p-6">
            <img
              src={initialPhoto.thumb_url || initialPhoto.photo_url || initialPhoto.url}
              alt={initialPhoto.file_name}
              className="mx-auto h-auto w-full rounded-xl object-contain ring-1 ring-white/10 md:max-h-[82vh] md:rounded-2xl"
              loading="eager"
              decoding="async"
            />
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">Photo preview unavailable.</div>
        )}
        <div className="border-t border-slate-800/90 px-4 py-3 md:px-6 md:py-4">
          <p className="text-sm font-semibold text-white md:text-base">Photo</p>
          <p className="text-xs text-slate-500">{initialPhoto.file_name}</p>
        </div>
      </div>

      {isFullscreenOpen && (initialPhoto.photo_url || initialPhoto.url) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setIsFullscreenOpen(false)}>
          <button
            type="button"
            onClick={() => setIsFullscreenOpen(false)}
            className="absolute right-5 top-5 rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Close
          </button>
          <img
            src={initialPhoto.photo_url || initialPhoto.url}
            alt={initialPhoto.file_name}
            className="max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
            loading="eager"
            decoding="async"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Visibility</p>
          <p className="text-xs text-slate-500">Control whether other fans can see this photo in the show gallery.</p>
        </div>
        <PhotoVisibilityToggle photoId={initialPhoto.id} isPublic={isPublic} onChange={(v) => setIsPublic(!!v)} />
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Metadata</p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-300">Visibility</p>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={toggleVisibilityInForm}
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                isPublic
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/20'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200'
              }`}
            >
              <span className={`relative inline-flex h-4 w-8 items-center rounded-full border transition ${
                isPublic ? 'border-emerald-400/40 bg-emerald-400/20' : 'border-slate-600 bg-slate-800'
              }`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition ${isPublic ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </span>
              <span className="text-xs">{isPublic ? 'Public' : 'Private'}</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            File name
            <input value={form.fileName} onChange={onChange('fileName')} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
