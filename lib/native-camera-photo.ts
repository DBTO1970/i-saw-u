export type NativeCameraFacingMode = 'environment' | 'user';

export interface CaptureNativeCameraPhotoOptions {
  preferredCamera?: NativeCameraFacingMode;
  cancelDelayMs?: number;
}

export interface NativeCameraPhotoResult {
  file: File;
  localFileUri: string;
  revokeLocalFileUri: () => void;
}

type CameraInputListener = () => void;

interface NativeCameraRuntime {
  document: Pick<Document, 'body' | 'createElement'>;
  window: {
    addEventListener: (eventName: 'focus', listener: CameraInputListener, options?: AddEventListenerOptions) => void;
    removeEventListener: (eventName: 'focus', listener: CameraInputListener) => void;
    setTimeout: (handler: () => void, timeout?: number) => ReturnType<typeof window.setTimeout>;
    clearTimeout: (timeoutId: ReturnType<typeof window.setTimeout>) => void;
  };
  url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

function createDefaultRuntime(): NativeCameraRuntime {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Native camera capture is only available in a browser context.');
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('The current browser cannot create a local file URI for captured photos.');
  }

  return {
    document,
    window,
    url: URL,
  };
}

export function createNativeCameraCaptureInput(
  preferredCamera: NativeCameraFacingMode = 'environment',
  runtime: Pick<NativeCameraRuntime, 'document'> = createDefaultRuntime(),
): HTMLInputElement {
  const input = runtime.document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = false;
  input.tabIndex = -1;
  input.setAttribute('capture', preferredCamera);
  input.setAttribute('aria-hidden', 'true');
  return input;
}

export async function capturePhotoWithNativeCamera(
  options: CaptureNativeCameraPhotoOptions = {},
  runtime: NativeCameraRuntime = createDefaultRuntime(),
): Promise<NativeCameraPhotoResult> {
  const {
    preferredCamera = 'environment',
    cancelDelayMs = 750,
  } = options;

  return new Promise((resolve, reject) => {
    let isSettled = false;
    let cancelTimer: ReturnType<typeof window.setTimeout> | null = null;

    const input = createNativeCameraCaptureInput(preferredCamera, runtime);

    const cleanup = () => {
      if (cancelTimer !== null) {
        runtime.window.clearTimeout(cancelTimer);
        cancelTimer = null;
      }

      runtime.window.removeEventListener('focus', handleWindowFocus);
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel);
      input.remove();
    };

    const rejectWithMessage = (message: string) => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      cleanup();
      reject(new Error(message));
    };

    const handleChange = () => {
      const file = input.files?.[0];
      if (!file) {
        rejectWithMessage('No photo was captured.');
        return;
      }

      const localFileUri = runtime.url.createObjectURL(file);

      isSettled = true;
      cleanup();
      resolve({
        file,
        localFileUri,
        revokeLocalFileUri: () => runtime.url.revokeObjectURL(localFileUri),
      });
    };

    const handleCancel = () => {
      rejectWithMessage('Native camera capture was cancelled.');
    };

    const handleWindowFocus = () => {
      cancelTimer = runtime.window.setTimeout(() => {
        if (!isSettled && !(input.files && input.files.length > 0)) {
          rejectWithMessage('Native camera capture was cancelled.');
        }
      }, cancelDelayMs);
    };

    input.addEventListener('change', handleChange);
    input.addEventListener('cancel', handleCancel);
    runtime.window.addEventListener('focus', handleWindowFocus, { once: true });
    runtime.document.body.appendChild(input);

    // Mobile browsers that honor capture hand off to the native camera app,
    // which remains responsible for saving the photo into the device library.
    input.click();
  });
}
