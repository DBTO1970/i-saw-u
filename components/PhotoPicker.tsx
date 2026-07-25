'use client';

import { useMemo, useRef, useState } from 'react';
import { parseExifFromArrayBuffer, type ParsedExifMetadata } from '../lib/exif-metadata';

type PickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type PickerOptions = {
  multiple?: boolean;
  types?: PickerAcceptType[];
  excludeAcceptAllOption?: boolean;
};

type BrowserFileHandle = {
  getFile: () => Promise<File>;
};

type ShowOpenFilePickerFn = (options?: PickerOptions) => Promise<BrowserFileHandle[]>;

export type PhotoPickerPayload = {
  file: File;
  buffer: ArrayBuffer;
  metadata: ParsedExifMetadata;
  hasDate: boolean;
  hasGps: boolean;
};

type PhotoPickerProps = {
  onPhotoPicked?: (payload: PhotoPickerPayload) => void;
};

export default function PhotoPicker({ onPhotoPicked }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const supportsFileSystemPicker = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof (window as Window & { showOpenFilePicker?: ShowOpenFilePickerFn }).showOpenFilePicker === 'function';
  }, []);

  const parseFile = async (file: File) => {
    setIsLoading(true);
    setStatus('Reading photo metadata...');

    try {
      const buffer = await file.arrayBuffer();
      const metadata = await parseExifFromArrayBuffer(buffer);
      const hasDate = Boolean(metadata.dateTimeOriginal);
      const hasGps = metadata.gpsLatitude != null && metadata.gpsLongitude != null;
      const nextPreviewUrl = URL.createObjectURL(file);
      setPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return nextPreviewUrl;
      });

      onPhotoPicked?.({ file, buffer, metadata, hasDate, hasGps });
      if (hasDate || hasGps) {
        setStatus(`Loaded ${file.name}. EXIF date: ${hasDate ? 'found' : 'missing'}; GPS: ${hasGps ? 'found' : 'missing'}.`);
      } else {
        setStatus(`Loaded ${file.name}, but no EXIF date/GPS was found in the raw file.`);
      }
    } catch (error) {
      console.error('Failed to parse EXIF metadata from picked file:', error);
      setStatus('Could not parse EXIF metadata from that file.');
    } finally {
      setIsLoading(false);
    }
  };

  const pickWithFileSystemAccess = async () => {
    const showOpenFilePicker = (window as Window & { showOpenFilePicker?: ShowOpenFilePickerFn }).showOpenFilePicker;
    if (!showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const [handle] = await showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'Image files',
            accept: {
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/heic': ['.heic', '.heif'],
              'image/png': ['.png'],
            },
          },
        ],
      });

      if (!handle) {
        return;
      }

      const file = await handle.getFile();
      await parseFile(file);
    } catch (error) {
      console.error('File System Access picker failed, falling back to file input:', error);
      fileInputRef.current?.click();
    }
  };

  return (
    <section className="mb-4 rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={pickWithFileSystemAccess}
          className="rounded-lg border border-cyan-500/60 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/10"
          disabled={isLoading}
        >
          {supportsFileSystemPicker ? 'Pick photo (raw file handle)' : 'Pick photo'}
        </button>
        <span className="text-xs text-slate-400">
          {supportsFileSystemPicker
            ? 'Using File System Access API for best metadata preservation.'
            : 'Using standard file input fallback on this browser.'}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/heic,image/heif,image/png,image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            parseFile(file);
          }
        }}
      />

      {status ? <p className="mt-3 text-xs text-slate-300">{status}</p> : null}
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Selected from modern photo picker"
          className="mt-3 max-h-56 w-auto rounded-xl border border-slate-800 object-contain"
        />
      ) : null}
    </section>
  );
}
