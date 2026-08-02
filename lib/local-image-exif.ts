import ExifReader from 'exifreader';
import { sendClientDiagnostic, withClientDiagnosticError } from './client-diagnostics';

type ExifTagValue = {
  value?: unknown;
  description?: string;
};

export type CleanPhotoExif = {
  rawDateTimeOriginal: string | null;
  dateTimeOriginal: string | null;
  timeTaken: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsLatitudeRef: string | null;
  gpsLongitudeRef: string | null;
  cameraModel: string | null;
};

export const EMPTY_CLEAN_PHOTO_EXIF: CleanPhotoExif = {
  rawDateTimeOriginal: null,
  dateTimeOriginal: null,
  timeTaken: null,
  gpsLatitude: null,
  gpsLongitude: null,
  gpsLatitudeRef: null,
  gpsLongitudeRef: null,
  cameraModel: null,
};

function buildExifDiagnosticContext(localImageUri: string, details: Record<string, unknown> = {}) {
  const safeUriPrefix = typeof localImageUri === 'string' ? localImageUri.slice(0, 80) : null;
  return {
    uriPrefix: safeUriPrefix,
    ...details,
  };
}

function readTag(tags: Record<string, ExifTagValue>, keys: string[]): ExifTagValue | null {
  for (const key of keys) {
    const value = tags[key];
    if (value) {
      return value;
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function toCoordinate(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (Array.isArray(value)) {
    const [degreesRaw, minutesRaw, secondsRaw] = value;
    const degrees = toCoordinate(degreesRaw);
    const minutes = toCoordinate(minutesRaw);
    const seconds = toCoordinate(secondsRaw);

    if (degrees === null || minutes === null || seconds === null) {
      return null;
    }

    return degrees + minutes / 60 + seconds / 3600;
  }

  if (value && typeof value === 'object') {
    const maybeRational = value as { numerator?: number; denominator?: number; value?: unknown };
    if (typeof maybeRational.numerator === 'number' && typeof maybeRational.denominator === 'number' && maybeRational.denominator !== 0) {
      return maybeRational.numerator / maybeRational.denominator;
    }
    if (typeof maybeRational.value !== 'undefined') {
      return toCoordinate(maybeRational.value);
    }
  }

  return null;
}

function parseDateParts(rawDate: string | null): { date: string | null; time: string | null } {
  if (!rawDate) {
    return { date: null, time: null };
  }

  const dateMatch = rawDate.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  const timeMatch = rawDate.match(/(?:\s|T)(\d{2}):(\d{2})(?::(\d{2}))?/);

  return {
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null,
    time: timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}` : null,
  };
}

export function extractCleanPhotoExifFromTags(tags: Record<string, ExifTagValue>): CleanPhotoExif {
  const dateTag = readTag(tags, ['DateTimeOriginal', 'Date Time Original', 'DateTimeDigitized', 'CreateDate']);
  const latitudeTag = readTag(tags, ['GPSLatitude', 'GPS Latitude', 'xmpGPSLatitude', 'Latitude']);
  const longitudeTag = readTag(tags, ['GPSLongitude', 'GPS Longitude', 'xmpGPSLongitude', 'Longitude']);
  const latitudeRefTag = readTag(tags, ['GPSLatitudeRef', 'GPS Latitude Ref', 'LatitudeRef']);
  const longitudeRefTag = readTag(tags, ['GPSLongitudeRef', 'GPS Longitude Ref', 'LongitudeRef']);
  const cameraModelTag = readTag(tags, ['Model', 'CameraModelName', 'UniqueCameraModel', 'LensModel']);

  const rawDateTimeOriginal = asString(dateTag?.description) || asString(dateTag?.value) || null;
  const latitudeRef = (asString(latitudeRefTag?.description) || asString(latitudeRefTag?.value) || null);
  const longitudeRef = (asString(longitudeRefTag?.description) || asString(longitudeRefTag?.value) || null);

  let gpsLatitude = toCoordinate(latitudeTag?.value);
  let gpsLongitude = toCoordinate(longitudeTag?.value);

  if (gpsLatitude !== null && latitudeRef && latitudeRef.toUpperCase().startsWith('S')) {
    gpsLatitude = -Math.abs(gpsLatitude);
  }
  if (gpsLongitude !== null && longitudeRef && longitudeRef.toUpperCase().startsWith('W')) {
    gpsLongitude = -Math.abs(gpsLongitude);
  }

  const { date, time } = parseDateParts(rawDateTimeOriginal);

  return {
    rawDateTimeOriginal,
    dateTimeOriginal: date,
    timeTaken: time,
    gpsLatitude,
    gpsLongitude,
    gpsLatitudeRef: latitudeRef,
    gpsLongitudeRef: longitudeRef,
    cameraModel: asString(cameraModelTag?.description) || asString(cameraModelTag?.value) || null,
  };
}

export async function extractExifFromLocalImageUri(localImageUri: string): Promise<CleanPhotoExif> {
  if (!localImageUri || typeof localImageUri !== 'string') {
    throw new Error('A valid local image URI is required to read EXIF metadata.');
  }

  try {
    const response = await fetch(localImageUri);
    if (!response.ok) {
      const details = buildExifDiagnosticContext(localImageUri, {
        stage: 'fetch-local-uri-failed',
        status: response.status,
      });
      console.error('[EXIF_DIAGNOSTIC]', details);
      void sendClientDiagnostic({
        event: 'exif-fetch-local-uri-failed',
        severity: 'error',
        source: 'local-image-exif',
        details,
      });
      return { ...EMPTY_CLEAN_PHOTO_EXIF };
    }

    const imageBlob = await response.blob();
    const imageFile = new File([imageBlob], 'captured-photo.jpg', {
      type: imageBlob.type || 'image/jpeg',
    });

    try {
      const tags = (await ExifReader.load(imageFile, { expanded: true })) as Record<string, ExifTagValue>;
      return extractCleanPhotoExifFromTags(tags);
    } catch (parseError) {
      const details = buildExifDiagnosticContext(localImageUri, {
        stage: 'exifreader-load-failed',
        mimeType: imageFile.type || null,
        fileSize: imageFile.size,
      });
      console.error('[EXIF_DIAGNOSTIC]', details, parseError);
      void sendClientDiagnostic({
        event: 'exif-exifreader-load-failed',
        severity: 'error',
        source: 'local-image-exif',
        details,
        error: withClientDiagnosticError(parseError),
      });
      return { ...EMPTY_CLEAN_PHOTO_EXIF };
    }
  } catch (error) {
    const details = buildExifDiagnosticContext(localImageUri, {
      stage: 'unexpected-local-uri-exif-failure',
    });
    console.error('[EXIF_DIAGNOSTIC]', details, error);
    void sendClientDiagnostic({
      event: 'exif-unexpected-local-uri-exif-failure',
      severity: 'error',
      source: 'local-image-exif',
      details,
      error: withClientDiagnosticError(error),
    });
    return { ...EMPTY_CLEAN_PHOTO_EXIF };
  }
}
