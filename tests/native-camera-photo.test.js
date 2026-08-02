import { describe, expect, it, vi } from 'vitest';
import {
  capturePhotoWithNativeCamera,
  createNativeCameraCaptureInput,
} from '../lib/native-camera-photo';

class FakeInput {
  constructor() {
    this.type = '';
    this.accept = '';
    this.multiple = false;
    this.tabIndex = 0;
    this.files = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.wasClicked = false;
    this.wasRemoved = false;
  }

  addEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }

  removeEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    this.listeners.set(eventName, listeners.filter((entry) => entry !== listener));
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  click() {
    this.wasClicked = true;
  }

  remove() {
    this.wasRemoved = true;
  }

  dispatch(eventName) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.forEach((listener) => listener());
  }
}

function createRuntime() {
  const input = new FakeInput();
  const appendedNodes = [];
  const windowListeners = new Map();
  const url = {
    createObjectURL: vi.fn(() => 'blob:captured-photo'),
    revokeObjectURL: vi.fn(),
  };

  const runtime = {
    document: {
      body: {
        appendChild(node) {
          appendedNodes.push(node);
        },
      },
      createElement(tagName) {
        if (tagName !== 'input') {
          throw new Error(`Unexpected element request: ${tagName}`);
        }
        return input;
      },
    },
    window: {
      addEventListener(eventName, listener) {
        windowListeners.set(eventName, listener);
      },
      removeEventListener(eventName) {
        windowListeners.delete(eventName);
      },
      setTimeout(handler) {
        handler();
        return 1;
      },
      clearTimeout: vi.fn(),
    },
    url,
  };

  return {
    runtime,
    input,
    appendedNodes,
    windowListeners,
    url,
  };
}

describe('createNativeCameraCaptureInput', () => {
  it('configures an image capture input for the preferred camera', () => {
    const { runtime, input } = createRuntime();

    const createdInput = createNativeCameraCaptureInput('user', runtime);

    expect(createdInput).toBe(input);
    expect(input.type).toBe('file');
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(false);
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('capture')).toBe('user');
    expect(input.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('capturePhotoWithNativeCamera', () => {
  it('returns the captured file and a local blob URI', async () => {
    const { runtime, input, appendedNodes, url } = createRuntime();
    const capturedFile = { name: 'captured.jpg', type: 'image/jpeg' };

    const promise = capturePhotoWithNativeCamera({}, runtime);
    expect(input.wasClicked).toBe(true);
    expect(appendedNodes).toEqual([input]);

    input.files = [capturedFile];
    input.dispatch('change');

    const result = await promise;
    expect(result.file).toBe(capturedFile);
    expect(result.localFileUri).toBe('blob:captured-photo');

    result.revokeLocalFileUri();
    expect(url.createObjectURL).toHaveBeenCalledWith(capturedFile);
    expect(url.revokeObjectURL).toHaveBeenCalledWith('blob:captured-photo');
    expect(input.wasRemoved).toBe(true);
  });

  it('rejects when the native capture flow is cancelled', async () => {
    const { runtime, input } = createRuntime();

    const promise = capturePhotoWithNativeCamera({}, runtime);
    input.dispatch('cancel');

    await expect(promise).rejects.toThrow('Native camera capture was cancelled.');
    expect(input.wasRemoved).toBe(true);
  });
});
