import type { CleanPhotoExif } from './local-image-exif';

export type OfflineUploadTaskStatus = 'pending' | 'processing' | 'failed';

export type OfflineUploadTask = {
  id: string;
  localFileUri: string;
  exifMetadata: CleanPhotoExif;
  fileName: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  status: OfflineUploadTaskStatus;
  nextAttemptAt: number;
  lastError: string | null;
};

export type AddOfflineUploadTaskInput = {
  localFileUri: string;
  exifMetadata: CleanPhotoExif;
  fileName?: string;
  mimeType?: string;
};

export type UploadQueueStats = {
  total: number;
  pending: number;
  failed: number;
  processing: number;
};

export type OfflineUploadProcessor = (task: OfflineUploadTask) => Promise<void>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type QueueRuntime = {
  now: () => number;
  isOnline: () => boolean;
  setTimeout: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  addOnlineListener: (listener: () => void) => void;
  removeOnlineListener: (listener: () => void) => void;
};

type OfflineUploadQueueManagerOptions = {
  storage?: StorageLike;
  runtime?: QueueRuntime;
  storageKey?: string;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
};

const DEFAULT_STORAGE_KEY = 'offlineUploadQueueV1';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 2000;

function createDefaultRuntime(): QueueRuntime {
  return {
    now: () => Date.now(),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
    clearTimeout: (id) => clearTimeout(id),
    addOnlineListener: (listener) => {
      if (typeof window !== 'undefined') {
        window.addEventListener('online', listener);
      }
    },
    removeOnlineListener: (listener) => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', listener);
      }
    },
  };
}

function createDefaultStorage(): StorageLike {
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('Offline upload queue storage is only available in browser contexts.');
  }
  return window.localStorage;
}

function safeParseQueue(rawValue: string | null): OfflineUploadTask[] {
  if (!rawValue) {
    return [];
  }

  const parsed = JSON.parse(rawValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((task) => task && typeof task.localFileUri === 'string' && typeof task.id === 'string');
}

function createTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upload-task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class OfflineUploadQueueManager {
  private readonly storage: StorageLike;
  private readonly runtime: QueueRuntime;
  private readonly storageKey: string;
  private readonly maxAttempts: number;
  private readonly baseRetryDelayMs: number;
  private tasks: OfflineUploadTask[] = [];
  private listeners = new Set<(tasks: OfflineUploadTask[]) => void>();
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null;
  private processor: OfflineUploadProcessor | null = null;
  private scheduledTimerId: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private readonly onOnline = () => {
    void this.processPendingTasks();
  };

  constructor(options: OfflineUploadQueueManagerOptions = {}) {
    this.storage = options.storage || createDefaultStorage();
    this.runtime = options.runtime || createDefaultRuntime();
    this.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    this.maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS;
    this.baseRetryDelayMs = options.baseRetryDelayMs || DEFAULT_BASE_RETRY_DELAY_MS;
    this.tasks = this.loadTasksFromStorage();
  }

  getTasks() {
    return [...this.tasks];
  }

  getStats(): UploadQueueStats {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter((task) => task.status === 'pending').length,
      failed: this.tasks.filter((task) => task.status === 'failed').length,
      processing: this.tasks.filter((task) => task.status === 'processing').length,
    };
  }

  subscribe(listener: (tasks: OfflineUploadTask[]) => void) {
    this.listeners.add(listener);
    listener(this.getTasks());
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(processor: OfflineUploadProcessor) {
    this.processor = processor;
    if (!this.started) {
      this.started = true;
      this.runtime.addOnlineListener(this.onOnline);
    }
    void this.processPendingTasks();
  }

  stop() {
    if (this.started) {
      this.runtime.removeOnlineListener(this.onOnline);
      this.started = false;
    }
    this.clearScheduledProcessing();
  }

  addTask(input: AddOfflineUploadTaskInput) {
    if (!input.localFileUri) {
      throw new Error('A local file URI is required when adding an offline upload task.');
    }

    const now = this.runtime.now();
    const nowIso = new Date(now).toISOString();
    const task: OfflineUploadTask = {
      id: createTaskId(),
      localFileUri: input.localFileUri,
      exifMetadata: input.exifMetadata,
      fileName: input.fileName || 'camera-photo.jpg',
      mimeType: input.mimeType || 'image/jpeg',
      createdAt: nowIso,
      updatedAt: nowIso,
      attemptCount: 0,
      status: 'pending',
      nextAttemptAt: now,
      lastError: null,
    };

    this.tasks = [...this.tasks, task];
    this.persistAndNotify();
    if (this.runtime.isOnline()) {
      if (this.processingPromise) {
        void this.processingPromise.then(() => this.processPendingTasks());
      } else {
        void this.processPendingTasks();
      }
    }
    return task;
  }

  async processPendingTasks(processorArg?: OfflineUploadProcessor): Promise<void> {
    const processor = processorArg || this.processor;
    if (!processor) {
      throw new Error('Cannot process upload queue without a processor.');
    }

    if (this.processingPromise) {
      return this.processingPromise;
    }

    if (!this.runtime.isOnline()) {
      return;
    }

    this.processingPromise = (async () => {
      this.isProcessing = true;
      this.clearScheduledProcessing();

      try {
        while (this.runtime.isOnline()) {
          const nextTask = this.findNextReadyTask();
          if (!nextTask) {
            break;
          }

          this.updateTask(nextTask.id, {
            status: 'processing',
            updatedAt: new Date(this.runtime.now()).toISOString(),
            lastError: null,
          });

          try {
            await processor({ ...nextTask, status: 'processing' });
            this.removeTask(nextTask.id);
          } catch (error) {
            const nextAttemptCount = nextTask.attemptCount + 1;
            const exceededAttempts = nextAttemptCount >= this.maxAttempts;
            const now = this.runtime.now();
            const retryDelay = this.baseRetryDelayMs * Math.pow(2, Math.max(0, nextAttemptCount - 1));

            this.updateTask(nextTask.id, {
              status: exceededAttempts ? 'failed' : 'pending',
              attemptCount: nextAttemptCount,
              nextAttemptAt: exceededAttempts ? now : now + retryDelay,
              updatedAt: new Date(now).toISOString(),
              lastError: error instanceof Error ? error.message : 'Upload failed.',
            });
          }
        }
      } finally {
        this.isProcessing = false;
        this.processingPromise = null;
        this.scheduleNextProcessing();
      }
    })();

    return this.processingPromise;
  }

  private findNextReadyTask() {
    const now = this.runtime.now();
    return this.tasks.find((task) => task.status === 'pending' && task.nextAttemptAt <= now);
  }

  private scheduleNextProcessing() {
    if (!this.runtime.isOnline() || !this.processor) {
      return;
    }

    const nextTask = this.tasks
      .filter((task) => task.status === 'pending')
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)[0];

    if (!nextTask) {
      return;
    }

    const delayMs = Math.max(0, nextTask.nextAttemptAt - this.runtime.now());
    if (delayMs === 0) {
      void this.processPendingTasks();
      return;
    }
    this.scheduledTimerId = this.runtime.setTimeout(() => {
      void this.processPendingTasks();
    }, delayMs);
  }

  private clearScheduledProcessing() {
    if (this.scheduledTimerId !== null) {
      this.runtime.clearTimeout(this.scheduledTimerId);
      this.scheduledTimerId = null;
    }
  }

  private loadTasksFromStorage() {
    const raw = this.storage.getItem(this.storageKey);
    return safeParseQueue(raw);
  }

  private persistAndNotify() {
    this.storage.setItem(this.storageKey, JSON.stringify(this.tasks));
    const snapshot = this.getTasks();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private updateTask(taskId: string, patch: Partial<OfflineUploadTask>) {
    this.tasks = this.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task));
    this.persistAndNotify();
  }

  private removeTask(taskId: string) {
    const removedTask = this.tasks.find((task) => task.id === taskId) || null;
    this.tasks = this.tasks.filter((task) => task.id !== taskId);
    this.persistAndNotify();

    if (removedTask?.localFileUri?.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(removedTask.localFileUri);
    }
  }
}

export function createOfflineUploadQueueManager(options: OfflineUploadQueueManagerOptions = {}) {
  return new OfflineUploadQueueManager(options);
}
