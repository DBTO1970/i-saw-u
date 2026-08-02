'use client';

import { useCallback, useEffect, useState } from 'react';
import { convertToAdaptiveWebP } from '../lib/image-optimizer';
import { capturePhotoWithNativeCamera } from '../lib/native-camera-photo';
import { extractExifFromLocalImageUri } from '../lib/local-image-exif';
import { createClient as createSupabaseClient } from '../lib/supabase/client';
import {
  createOfflineUploadQueueManager,
  type OfflineUploadQueueManager,
  type OfflineUploadTask,
} from '../lib/offline-upload-queue';

const LIVE_MODE_STORAGE_KEY = 'liveModeEnabledV1';

async function uploadQueuedPhoto(task: OfflineUploadTask): Promise<void> {
  const localResponse = await fetch(task.localFileUri);
  if (!localResponse.ok) {
    throw new Error(`Unable to load queued local photo URI (status ${localResponse.status}).`);
  }

  const localBlob = await localResponse.blob();
  const { webpBlob, originalName, appliedMaxHeight, appliedMaxWidth, appliedQuality } = await convertToAdaptiveWebP(localBlob, {
    targetMaxBytes: 1_900_000,
    maxWidth: 1920,
    maxHeight: 1920,
  });

  const supabase = createSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('You must be signed in to upload live-mode photos.');
  }

  const photoId = crypto.randomUUID();
  const storagePath = `${user.id}/${photoId}.webp`;
  const storageUpload = await supabase.storage
    .from('user-photos')
    .upload(storagePath, webpBlob, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (storageUpload.error) {
    throw new Error(storageUpload.error.message || 'Failed to upload live-mode photo to storage.');
  }

  const formData = new FormData();
  formData.append('photoId', photoId);
  formData.append('storagePath', storagePath);
  formData.append('fileSize', String(webpBlob.size));
  formData.append('mimeType', 'image/webp');
  formData.append('fileName', task.fileName || originalName);
  formData.append('dateTaken', task.exifMetadata.dateTimeOriginal || '');
  formData.append('timeTaken', task.exifMetadata.timeTaken || '');

  if (task.exifMetadata.gpsLatitude != null) {
    formData.append('gpsLatitude', String(task.exifMetadata.gpsLatitude));
  }
  if (task.exifMetadata.gpsLongitude != null) {
    formData.append('gpsLongitude', String(task.exifMetadata.gpsLongitude));
  }

  formData.append(
    'rawExif',
    JSON.stringify({
      ...task.exifMetadata,
      source: 'live-mode',
      compressionMetadata: {
        format: 'image/webp',
        targetMaxBytes: 1_900_000,
        outputBytes: webpBlob.size,
        appliedQuality,
        appliedMaxWidth,
        appliedMaxHeight,
      },
    }),
  );

  const response = await fetch('/api/library/save-photo', {
    method: 'POST',
    body: formData,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { success: false, error: await response.text() };
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Failed to upload queued live-mode photo.');
  }
}

export default function LiveModeController() {
  const [queueManager, setQueueManager] = useState<OfflineUploadQueueManager | null>(null);
  const [isLiveModeEnabled, setIsLiveModeEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, failed: 0, processing: 0 });
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const manager = createOfflineUploadQueueManager();
    setQueueManager(manager);

    return () => {
      manager.stop();
    };
  }, []);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(LIVE_MODE_STORAGE_KEY);
      setIsLiveModeEnabled(persisted === 'true');
    } catch (error) {
      console.error('Unable to read persisted live-mode setting:', error);
    }
  }, []);

  useEffect(() => {
    const updateNetworkState = () => {
      setIsOnline(navigator.onLine);
    };

    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
    };
  }, []);

  useEffect(() => {
    if (!queueManager) {
      return;
    }

    const unsubscribe = queueManager.subscribe(() => {
      setQueueStats(queueManager.getStats());
    });

    queueManager.start(uploadQueuedPhoto);
    return () => {
      unsubscribe();
      queueManager.stop();
    };
  }, [queueManager]);

  const setLiveModeEnabled = useCallback((enabled: boolean) => {
    setIsLiveModeEnabled(enabled);
    try {
      window.localStorage.setItem(LIVE_MODE_STORAGE_KEY, String(enabled));
    } catch (error) {
      console.error('Unable to persist live-mode setting:', error);
    }
  }, []);

  const handleCaptureAndQueue = useCallback(async () => {
    if (!queueManager) {
      setStatusMessage('Live Mode queue is still initializing. Please try again.');
      return;
    }

    if (!isLiveModeEnabled) {
      setStatusMessage('Enable Live Mode before taking live capture photos.');
      return;
    }

    setIsCapturing(true);
    setStatusMessage('Opening native camera...');

    try {
      const capturedPhoto = await capturePhotoWithNativeCamera({ preferredCamera: 'environment' });
      const exifMetadata = await extractExifFromLocalImageUri(capturedPhoto.localFileUri);

      queueManager.addTask({
        localFileUri: capturedPhoto.localFileUri,
        exifMetadata,
        fileName: capturedPhoto.file.name || 'live-mode-photo.jpg',
        mimeType: capturedPhoto.file.type || 'image/jpeg',
      });

      setStatusMessage('Photo captured and queued for background upload.');
      await queueManager.processPendingTasks();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to capture and queue photo.');
    } finally {
      setIsCapturing(false);
    }
  }, [isLiveModeEnabled, queueManager]);

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200">Live Mode</p>
          <p className="text-xs text-cyan-100/90">
            Auto queue concert photos for upload even in poor service. Retries use exponential backoff.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLiveModeEnabled(!isLiveModeEnabled)}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            isLiveModeEnabled
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'border border-cyan-400/50 text-cyan-100 hover:bg-cyan-500/20'
          }`}
        >
          {isLiveModeEnabled ? 'Live Mode: ON' : 'Live Mode: OFF'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-cyan-100">
        <span className="rounded-full border border-cyan-400/40 px-2 py-1">Queued: {queueStats.pending}</span>
        <span className="rounded-full border border-cyan-400/40 px-2 py-1">Processing: {queueStats.processing}</span>
        <span className="rounded-full border border-cyan-400/40 px-2 py-1">Failed: {queueStats.failed}</span>
        <span className="rounded-full border border-cyan-400/40 px-2 py-1">
          Network: {isOnline === null ? 'Checking...' : isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="mt-3">
        <button
          type="button"
          disabled={!queueManager || !isLiveModeEnabled || isCapturing}
          onClick={handleCaptureAndQueue}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCapturing ? 'Capturing...' : 'Take Live Photo'}
        </button>
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-lg border border-cyan-400/30 bg-slate-950/40 px-3 py-2 text-xs text-cyan-100">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
