import ExifReader from 'exifreader';

export type ParsedExifMetadata = {
  rawDateTimeOriginal: string | null;
  dateTimeOriginal: string | null;
  dateTimeOriginalDisplay: string | null;
  timeTaken: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  gpsLatitudeRef: string | null;
  gpsLongitudeRef: string | null;
};

type ExifTagValue = {
  value?: unknown;
  description?: string;
};

function readTag(tags: Record<string, ExifTagValue>, keys: string[]): ExifTagValue | null {
  for (const key of keys) {
    const found = tags[key];
    if (found) {
      return found;
    }
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

function normalizeDate(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTime(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }

  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
}

function buildDisplayDate(date: string | null, time: string | null): string | null {
  if (!date) {
    return null;
  }

  const composed = `${date}T${time || '00:00:00'}`;
  const parsed = new Date(composed);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return time
    ? parsed.toLocaleString()
    : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function parseExifFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<ParsedExifMetadata> {
  const tags = (await ExifReader.load(arrayBuffer, { expanded: true })) as Record<string, ExifTagValue>;

  const dateTag = readTag(tags, ['DateTimeOriginal', 'Date Time Original', 'DateTimeDigitized', 'CreateDate']);
  const latitudeTag = readTag(tags, ['GPSLatitude', 'GPS Latitude']);
  const longitudeTag = readTag(tags, ['GPSLongitude', 'GPS Longitude']);
  const latitudeRefTag = readTag(tags, ['GPSLatitudeRef', 'GPS Latitude Ref']);
  const longitudeRefTag = readTag(tags, ['GPSLongitudeRef', 'GPS Longitude Ref']);

  const rawDateTimeOriginal = typeof dateTag?.description === 'string'
    ? dateTag.description
    : typeof dateTag?.value === 'string'
      ? dateTag.value
      : null;

  const dateTimeOriginal = normalizeDate(rawDateTimeOriginal);
  const timeTaken = normalizeTime(rawDateTimeOriginal);
  const dateTimeOriginalDisplay = buildDisplayDate(dateTimeOriginal, timeTaken);

  const latitudeRef = typeof latitudeRefTag?.description === 'string'
    ? latitudeRefTag.description
    : typeof latitudeRefTag?.value === 'string'
      ? latitudeRefTag.value
      : null;
  const longitudeRef = typeof longitudeRefTag?.description === 'string'
    ? longitudeRefTag.description
    : typeof longitudeRefTag?.value === 'string'
      ? longitudeRefTag.value
      : null;

  let latitude = toCoordinate(latitudeTag?.value);
  let longitude = toCoordinate(longitudeTag?.value);

  if (latitude !== null && latitudeRef && latitudeRef.toUpperCase().startsWith('S')) {
    latitude = -Math.abs(latitude);
  }
  if (longitude !== null && longitudeRef && longitudeRef.toUpperCase().startsWith('W')) {
    longitude = -Math.abs(longitude);
  }

  return {
    rawDateTimeOriginal,
    dateTimeOriginal,
    dateTimeOriginalDisplay,
    timeTaken,
    gpsLatitude: latitude,
    gpsLongitude: longitude,
    gpsLatitudeRef: latitudeRef,
    gpsLongitudeRef: longitudeRef,
  };
}
