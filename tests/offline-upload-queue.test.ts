import { describe, expect, it, vi } from 'vitest';
import { OfflineUploadQueueManager } from '../lib/offline-upload-queue';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function createRuntime() {
  let currentTime = 1000;
  let online = true;
  let timerId = 0;
  const timers = new Map<number, () => void>();
  let onlineListener: (() => void) | null = null;

  return {
    runtime: {
      now: () => currentTime,
      isOnline: () => online,
      setTimeout(handler: () => void) {
        timerId += 1;
        timers.set(timerId, handler);
        return timerId;
      },
      clearTimeout(id: number) {
        timers.delete(id);
      },
      addOnlineListener(listener: () => void) {
        onlineListener = listener;
      },
      removeOnlineListener() {
        onlineListener = null;
      },
    },
    advanceTime(ms: number) {
      currentTime += ms;
    },
    goOffline() {
      online = false;
    },
    goOnline() {
      online = true;
      onlineListener?.();
    },
    flushNextTimer() {
      const [id, handler] = Array.from(timers.entries())[0] || [];
      if (id && handler) {
        timers.delete(id);
        handler();
      }
    },
  };
}

describe('OfflineUploadQueueManager', () => {
  it('processes queued tasks sequentially and clears successful uploads', async () => {
    const storage = createMemoryStorage();
    const runtimeHarness = createRuntime();
    runtimeHarness.goOffline();
    const manager = new OfflineUploadQueueManager({
      storage,
      runtime: runtimeHarness.runtime,
      storageKey: 'test-queue',
    });

    const processor = vi.fn(async () => {});

    manager.addTask({
      localFileUri: 'blob:one',
      fileName: 'one.jpg',
      mimeType: 'image/jpeg',
      exifMetadata: {
        rawDateTimeOriginal: '2026:08:01 20:14:09',
        dateTimeOriginal: '2026-08-01',
        timeTaken: '20:14:09',
        gpsLatitude: 10,
        gpsLongitude: 20,
        gpsLatitudeRef: 'N',
        gpsLongitudeRef: 'E',
        cameraModel: 'Camera A',
      },
    });

    manager.addTask({
      localFileUri: 'blob:two',
      fileName: 'two.jpg',
      mimeType: 'image/jpeg',
      exifMetadata: {
        rawDateTimeOriginal: '2026:08:01 20:14:09',
        dateTimeOriginal: '2026-08-01',
        timeTaken: '20:14:09',
        gpsLatitude: 11,
        gpsLongitude: 21,
        gpsLatitudeRef: 'N',
        gpsLongitudeRef: 'E',
        cameraModel: 'Camera B',
      },
    });

    runtimeHarness.goOnline();
    await manager.processPendingTasks(processor);
    expect(processor).toHaveBeenCalledTimes(2);
    expect(manager.getTasks()).toHaveLength(0);
  });

  it('retries failed tasks up to 3 attempts with exponential backoff', async () => {
    const storage = createMemoryStorage();
    const runtimeHarness = createRuntime();
    runtimeHarness.goOffline();
    const manager = new OfflineUploadQueueManager({
      storage,
      runtime: runtimeHarness.runtime,
      storageKey: 'test-queue-retry',
      baseRetryDelayMs: 1000,
      maxAttempts: 3,
    });

    const processor = vi
      .fn()
      .mockRejectedValueOnce(new Error('network fail'))
      .mockRejectedValueOnce(new Error('network fail again'))
      .mockResolvedValueOnce(undefined);

    manager.addTask({
      localFileUri: 'blob:retry',
      fileName: 'retry.jpg',
      mimeType: 'image/jpeg',
      exifMetadata: {
        rawDateTimeOriginal: '2026:08:01 20:14:09',
        dateTimeOriginal: '2026-08-01',
        timeTaken: '20:14:09',
        gpsLatitude: null,
        gpsLongitude: null,
        gpsLatitudeRef: null,
        gpsLongitudeRef: null,
        cameraModel: 'Retry Cam',
      },
    });

    runtimeHarness.goOnline();
    await manager.processPendingTasks(processor);
    expect(processor).toHaveBeenCalledTimes(1);
    let pendingTask = manager.getTasks()[0];
    expect(pendingTask.status).toBe('pending');
    expect(pendingTask.attemptCount).toBe(1);

    runtimeHarness.advanceTime(1000);
    await manager.processPendingTasks(processor);
    expect(processor).toHaveBeenCalledTimes(2);
    pendingTask = manager.getTasks()[0];
    expect(pendingTask.attemptCount).toBe(2);

    runtimeHarness.advanceTime(2000);
    await manager.processPendingTasks(processor);
    expect(processor).toHaveBeenCalledTimes(3);
    expect(manager.getTasks()).toHaveLength(0);
  });

  it('does not process tasks while offline', async () => {
    const storage = createMemoryStorage();
    const runtimeHarness = createRuntime();
    runtimeHarness.goOffline();

    const manager = new OfflineUploadQueueManager({
      storage,
      runtime: runtimeHarness.runtime,
      storageKey: 'test-queue-offline',
    });

    const processor = vi.fn(async () => {});
    manager.addTask({
      localFileUri: 'blob:offline',
      fileName: 'offline.jpg',
      mimeType: 'image/jpeg',
      exifMetadata: {
        rawDateTimeOriginal: null,
        dateTimeOriginal: null,
        timeTaken: null,
        gpsLatitude: null,
        gpsLongitude: null,
        gpsLatitudeRef: null,
        gpsLongitudeRef: null,
        cameraModel: null,
      },
    });

    await manager.processPendingTasks(processor);
    expect(processor).not.toHaveBeenCalled();

    runtimeHarness.goOnline();
    await manager.processPendingTasks(processor);
    expect(processor).toHaveBeenCalledTimes(1);
  });

  it('accepts durable local asset IDs without blob URIs', async () => {
    const storage = createMemoryStorage();
    const runtimeHarness = createRuntime();
    runtimeHarness.goOffline();
    const manager = new OfflineUploadQueueManager({
      storage,
      runtime: runtimeHarness.runtime,
      storageKey: 'test-queue-asset-id',
    });

    manager.addTask({
      localAssetId: 'asset-123',
      fileName: 'asset.jpg',
      mimeType: 'image/jpeg',
      exifMetadata: {
        rawDateTimeOriginal: null,
        dateTimeOriginal: null,
        timeTaken: null,
        gpsLatitude: null,
        gpsLongitude: null,
        gpsLatitudeRef: null,
        gpsLongitudeRef: null,
        cameraModel: null,
      },
    });

    const tasks = manager.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].localAssetId).toBe('asset-123');
    expect(tasks[0].localFileUri).toBeNull();
  });
});
