'use client';

import { useCallback, useEffect, useState } from 'react';
import { convertToAdaptiveWebP } from '../lib/image-optimizer';
import { capturePhotoWithNativeCamera } from '../lib/native-camera-photo';
import { extractExifFromLocalImageUri } from '../lib/local-image-exif';
import { createClient as createSupabaseClient } from '../lib/supabase/client';
import { sendClientDiagnostic, withClientDiagnosticError } from '../lib/client-diagnostics';
import { deleteLivePhotoAsset, readLivePhotoAssetBlob, saveLivePhotoAsset } from '../lib/local-photo-store';
import {
  createOfflineUploadQueueManager,
  type OfflineUploadQueueManager,
  type OfflineUploadTask,
} from '../lib/offline-upload-queue';

const LIVE_MODE_STORAGE_KEY = 'liveModeEnabledV1';

async function uploadQueuedPhoto(task: OfflineUploadTask): Promise<void> {
  const baseDetails = {
    taskId: task.id,
    fileName: task.fileName,
    mimeType: task.mimeType,
    attemptCount: task.attemptCount,
  };

  try {
    let localBlob: Blob | null = null;
    if (task.localAssetId) {
      localBlob = await readLivePhotoAssetBlob(task.localAssetId);
      if (!localBlob) {
        throw new Error('Queued live photo data could not be found in local storage.');
      }
    }
    if (!localBlob && task.localFileUri) {
      const localResponse = await fetch(task.localFileUri);
      if (!localResponse.ok) {
        throw new Error(`Unable to load queued local photo URI (status ${localResponse.status}).`);
      }
      localBlob = await localResponse.blob();
    }
    if (!localBlob) {
      throw new Error('No local live photo data is available for this queued task.');
    }
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
    if (task.localAssetId) {
      await deleteLivePhotoAsset(task.localAssetId);
    }
  } catch (error) {
    void sendClientDiagnostic({
      event: 'live-mode-upload-failed',
      severity: 'error',
      source: 'live-mode-controller',
      details: {
        ...baseDetails,
        hasLocalAssetId: Boolean(task.localAssetId),
        hasLocalFileUri: Boolean(task.localFileUri),
      },
      error: withClientDiagnosticError(error),
    });
    throw error;
  }
}

export default function LiveModeController() {
  const [queueManager, setQueueManager] = useState<OfflineUploadQueueManager | null>(null);
  const [isLiveModeEnabled, setIsLiveModeEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [queueStats, setQueueStats] = useState({ total: 0, pending: 0, failed: 0, processing: 0 });
  const [statusMessage, setStatusMessage] = useState('');
  const [queueErrorSummary, setQueueErrorSummary] = useState('');
  const [latestCapturedPhotoForDeviceSave, setLatestCapturedPhotoForDeviceSave] = useState<File | null>(null);

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
      const tasks = queueManager.getTasks();
      const firstErrorTask = tasks.find((task) => task.lastError);
      setQueueErrorSummary(firstErrorTask?.lastError || '');
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
      let localAssetId: string | null = null;
      try {
        localAssetId = await saveLivePhotoAsset(
          capturedPhoto.file,
          capturedPhoto.file.name || 'live-mode-photo.jpg',
          capturedPhoto.file.type || 'image/jpeg',
        );
      } finally {
        capturedPhoto.revokeLocalFileUri();
      }

      queueManager.addTask({
        localAssetId,
        exifMetadata,
        fileName: capturedPhoto.file.name || 'live-mode-photo.jpg',
        mimeType: capturedPhoto.file.type || 'image/jpeg',
      });
      setLatestCapturedPhotoForDeviceSave(capturedPhoto.file);

      setStatusMessage('Photo captured and queued for background upload.');
      await queueManager.processPendingTasks();
      const nextStats = queueManager.getStats();
      if (nextStats.pending === 0 && nextStats.failed === 0) {
        setStatusMessage('Photo uploaded to your library.');
      } else if (nextStats.failed > 0) {
        setStatusMessage('Some queued uploads failed. Tap "Process Queue Now" after checking your connection/sign-in.');
      } else if (nextStats.pending > 0) {
        setStatusMessage('Photo queued. Tap "Process Queue Now" to retry immediately.');
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to capture and queue photo.');
    } finally {
      setIsCapturing(false);
    }
  }, [isLiveModeEnabled, queueManager]);

  const handleProcessQueueNow = useCallback(async () => {
    if (!queueManager) {
      setStatusMessage('Live Mode queue is still initializing. Please try again.');
      return;
    }

    setStatusMessage('Processing queued uploads...');
    await queueManager.processPendingTasks();
    const nextStats = queueManager.getStats();
    if (nextStats.pending === 0 && nextStats.failed === 0) {
      setStatusMessage('All queued uploads are processed.');
      return;
    }
    if (nextStats.failed > 0) {
      setStatusMessage('Some uploads failed. Check status below and retry when ready.');
      return;
    }
    setStatusMessage('Uploads are queued for retry.');
  }, [queueManager]);

  const handleSaveLatestPhotoToDevice = useCallback(async () => {
    if (!latestCapturedPhotoForDeviceSave) {
      setStatusMessage('Take a live photo first, then save it to your device.');
      return;
    }

    setIsSavingToDevice(true);

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [latestCapturedPhotoForDeviceSave] })) {
          await navigator.share({
            files: [latestCapturedPhotoForDeviceSave],
            title: 'Save live photo',
          });
          setStatusMessage('Share sheet opened. Choose "Save Image" to add it to Photos.');
          return;
        }
      }

      const downloadUrl = URL.createObjectURL(latestCapturedPhotoForDeviceSave);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = latestCapturedPhotoForDeviceSave.name || 'live-mode-photo.jpg';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      setStatusMessage('Download started. Open the file and save it to Photos.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save this photo to your device.');
    } finally {
      setIsSavingToDevice(false);
    }
  }, [latestCapturedPhotoForDeviceSave]);

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!queueManager || !isLiveModeEnabled || isCapturing}
          onClick={handleCaptureAndQueue}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCapturing ? 'Capturing...' : 'Take Live Photo'}
        </button>
        <button
          type="button"
          disabled={!queueManager || queueStats.pending === 0 || queueStats.processing > 0}
          onClick={handleProcessQueueNow}
          className="rounded-xl border border-cyan-400/50 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {queueStats.processing > 0 ? 'Processing...' : 'Process Queue Now'}
        </button>
        <button
          type="button"
          disabled={!latestCapturedPhotoForDeviceSave || isSavingToDevice}
          onClick={handleSaveLatestPhotoToDevice}
          className="rounded-xl border border-emerald-400/60 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingToDevice ? 'Opening Save Flow...' : 'Save Latest to Device Photos'}
        </button>
      </div>

      {statusMessage ? (
        <p className="mt-3 rounded-lg border border-cyan-400/30 bg-slate-950/40 px-3 py-2 text-xs text-cyan-100">
          {statusMessage}
        </p>
      ) : null}

      {queueErrorSummary ? (
        <p className="mt-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Last queue error: {queueErrorSummary}
        </p>
      ) : null}
    </section>
  );
}
