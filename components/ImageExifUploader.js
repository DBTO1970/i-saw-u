'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExifReader from 'exifreader';
import { convertToWebP } from '../lib/image-optimizer';
import { savePhotoToLibrary } from '../app/actions/user-library';

const emptyMetadata = {
  dateTimeOriginal: 'Not available',
  dateTimeOriginalDisplay: 'Not available',
  timeTaken: 'Not available',
  gpsLatitude: 'Not available',
  gpsLongitude: 'Not available',
  dateSource: 'none',
  timeSource: 'none',
  gpsSource: 'none',
  sidecarFileName: '',
  sidecarUsed: false,
  rawDateTimeOriginal: null,
  rawGpsLatitude: null,
  rawGpsLongitude: null,
  rawGpsLatitudeRef: null,
  rawGpsLongitudeRef: null,
  diagnostics: {
    totalTagEntries: 0,
    sidecarSummary: 'No sidecar loaded.',
    candidateMatches: {
      date: [],
      gpsLatitude: [],
      gpsLongitude: [],
      gpsLatitudeRef: [],
      gpsLongitudeRef: [],
    },
    sampleTagKeys: [],
  },
};

const DATE_TAG_CANDIDATES = [
  'DateTimeOriginal',
  'Date Time Original',
  'DateTimeDigitized',
  'CreateDate',
  'DateTime',
  'SubSecDateTimeOriginal',
  'DateCreated',
  'DateTimeCreated',
  'CreationDate',
  'ContentCreateDate',
  'MediaCreateDate',
  'DigitalCreationDate',
  'IPTCDateCreated',
  'xmpCreateDate',
  'xmpDateCreated',
  'photoshopDateCreated',
];

const GPS_LATITUDE_TAG_CANDIDATES = ['GPSLatitude', 'GPS Latitude', 'xmpGPSLatitude', 'Latitude'];
const GPS_LONGITUDE_TAG_CANDIDATES = ['GPSLongitude', 'GPS Longitude', 'xmpGPSLongitude', 'Longitude'];
const GPS_LATITUDE_REF_TAG_CANDIDATES = ['GPSLatitudeRef', 'GPS Latitude Ref', 'LatitudeRef'];
const GPS_LONGITUDE_REF_TAG_CANDIDATES = ['GPSLongitudeRef', 'GPS Longitude Ref', 'LongitudeRef'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseExifDateTimeParts(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return {
      date: `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`,
      time: `${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`,
      display: value.toLocaleString(),
    };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(/(\d{4})[-:](\d{2})[-:](\d{2})(?:[ T](\d{2})[:](\d{2})(?::(\d{2}))?)?/);
    if (match) {
      const date = `${match[1]}-${match[2]}-${match[3]}`;
      const time = match[4] != null ? `${pad2(match[4])}:${pad2(match[5] || 0)}:${pad2(match[6] || 0)}` : null;
      return {
        date,
        time,
        display: time ? `${date} ${time}` : date,
      };
    }

    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      return {
        date: `${parsedDate.getFullYear()}-${pad2(parsedDate.getMonth() + 1)}-${pad2(parsedDate.getDate())}`,
        time: `${pad2(parsedDate.getHours())}:${pad2(parsedDate.getMinutes())}:${pad2(parsedDate.getSeconds())}`,
        display: parsedDate.toLocaleString(),
      };
    }
  }

  if (Array.isArray(value)) {
    const [year, month, day, hour = 0, minute = 0, second = 0] = value;
    if (year == null || month == null || day == null) {
      return null;
    }
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    if (Number.isNaN(parsedDate.getTime())) {
      return null;
    }

    return {
      date: `${parsedDate.getFullYear()}-${pad2(parsedDate.getMonth() + 1)}-${pad2(parsedDate.getDate())}`,
      time: `${pad2(parsedDate.getHours())}:${pad2(parsedDate.getMinutes())}:${pad2(parsedDate.getSeconds())}`,
      display: parsedDate.toLocaleString(),
    };
  }

  return null;
}

function parseExifDate(value) {
  return parseExifDateTimeParts(value)?.date || null;
}

function parseExifTime(value) {
  return parseExifDateTimeParts(value)?.time || null;
}

function formatExifDate(value) {
  const parts = parseExifDateTimeParts(value);
  if (!parts) return null;
  const parsedDate = new Date(`${parts.date}T${parts.time || '00:00:00'}`);
  if (Number.isNaN(parsedDate.getTime())) {
    return parts.display;
  }
  return parts.time
    ? parsedDate.toLocaleString()
    : parsedDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
}

function toDecimalDegrees(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (Array.isArray(value)) {
    const [degrees, minutes, seconds] = value;
    const degreeValue = toDecimalDegrees(degrees);
    const minuteValue = toDecimalDegrees(minutes);
    const secondValue = toDecimalDegrees(seconds);

    if (degreeValue === null || minuteValue === null || secondValue === null) {
      return null;
    }

    return degreeValue + minuteValue / 60 + secondValue / 3600;
  }

  if (value && typeof value === 'object') {
    if (typeof value.numerator === 'number' && typeof value.denominator === 'number') {
      return value.numerator / value.denominator;
    }

    if (value.value) {
      return toDecimalDegrees(value.value);
    }
  }

  return null;
}

function formatCoordinate(value, reference) {
  const decimal = toDecimalDegrees(value);
  if (decimal === null) return null;

  let signedDecimal = decimal;
  if (reference === 'S' || reference === 'W') {
    signedDecimal = -Math.abs(decimal);
  } else if (reference === 'N' || reference === 'E') {
    signedDecimal = Math.abs(decimal);
  }

  const absoluteValue = Math.abs(signedDecimal);
  const degrees = Math.floor(absoluteValue);
  const minutes = Math.floor((absoluteValue - degrees) * 60);
  const seconds = ((absoluteValue - degrees) * 60 - minutes) * 60;
  const direction = reference ? ` ${reference}` : '';
  const prefix = signedDecimal < 0 && !reference ? '-' : '';

  return `${prefix}${degrees}° ${minutes}' ${seconds.toFixed(2)}\"${direction}`.trim();
}

function normalizeTagKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toDebugValue(value) {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toDebugValue(entry)).join(', ');
  }

  if (typeof value === 'object') {
    if (typeof value.numerator === 'number' && typeof value.denominator === 'number') {
      return `${value.numerator}/${value.denominator}`;
    }

    if ('value' in value || 'description' in value) {
      return toDebugValue(value.description ?? value.value);
    }

    return '[object]';
  }

  return String(value);
}

function collectTagEntries(tags) {
  if (!tags || typeof tags !== 'object') {
    return [];
  }

  const entries = [];
  const visited = new WeakSet();
  const queue = [{ node: tags, path: '' }];

  while (queue.length > 0) {
    const current = queue.shift();
    const node = current?.node;
    const path = current?.path || '';

    if (!node || typeof node !== 'object') {
      continue;
    }

    if (visited.has(node)) {
      continue;
    }
    visited.add(node);

    Object.entries(node).forEach(([key, value]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (value && typeof value === 'object' && ('value' in value || 'description' in value)) {
        entries.push({
          path: nextPath,
          key,
          normalizedKey: normalizeTagKey(key),
          normalizedPath: normalizeTagKey(nextPath),
          rawValue: typeof value.value !== 'undefined' ? value.value : value.description,
          preview: toDebugValue(value.description ?? value.value),
        });
      }

      if (value && typeof value === 'object') {
        queue.push({ node: value, path: nextPath });
      }
    });
  }

  return entries;
}

function getCandidateDescriptors(candidateKeys) {
  return candidateKeys.map((key) => {
    const normalized = normalizeTagKey(key);
    return {
      raw: key,
      normalized,
      score(entry) {
        if (entry.normalizedKey === normalized) return 5;
        if (entry.normalizedPath === normalized) return 5;
        if (entry.normalizedKey.endsWith(normalized)) return 4;
        if (entry.normalizedPath.endsWith(normalized)) return 4;
        if (entry.normalizedKey.includes(normalized)) return 3;
        if (entry.normalizedPath.includes(normalized)) return 3;
        return 0;
      },
    };
  });
}

function findBestCandidateMatch(entries, candidateKeys) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const descriptors = getCandidateDescriptors(candidateKeys);
  let best = null;

  entries.forEach((entry) => {
    descriptors.forEach((descriptor) => {
      const score = descriptor.score(entry);
      if (score <= 0) {
        return;
      }

      if (!best || score > best.score) {
        best = {
          score,
          entry,
          candidate: descriptor.raw,
        };
      }
    });
  });

  return best ? best.entry : null;
}

function readTagValueFromEntries(entries, candidateKeys, options = {}) {
  const { preferDescription = true } = options;
  const entry = findBestCandidateMatch(entries, candidateKeys);
  if (!entry) {
    return null;
  }

  if (preferDescription && entry.preview) {
    return entry.preview;
  }

  if (typeof entry.rawValue !== 'undefined' && entry.rawValue !== '') {
    return entry.rawValue;
  }

  if (entry.preview) {
    return entry.preview;
  }

  return null;
}

function collectCandidateMatches(entries, candidateKeys) {
  const normalizedCandidates = candidateKeys.map((key) => normalizeTagKey(key));

  return entries
    .filter((entry) =>
      normalizedCandidates.some((candidate) =>
        entry.normalizedKey === candidate ||
        entry.normalizedPath === candidate ||
        entry.normalizedKey.endsWith(candidate) ||
        entry.normalizedPath.endsWith(candidate) ||
        entry.normalizedKey.includes(candidate) ||
        entry.normalizedPath.includes(candidate),
      ),
    )
    .slice(0, 8)
    .map((entry) => ({
      path: entry.path,
      preview: entry.preview,
    }));
}

function buildDiagnostics(entries, sidecarSummary = 'No sidecar loaded.') {
  return {
    totalTagEntries: entries.length,
    sidecarSummary,
    candidateMatches: {
      date: collectCandidateMatches(entries, DATE_TAG_CANDIDATES),
      gpsLatitude: collectCandidateMatches(entries, GPS_LATITUDE_TAG_CANDIDATES),
      gpsLongitude: collectCandidateMatches(entries, GPS_LONGITUDE_TAG_CANDIDATES),
      gpsLatitudeRef: collectCandidateMatches(entries, GPS_LATITUDE_REF_TAG_CANDIDATES),
      gpsLongitudeRef: collectCandidateMatches(entries, GPS_LONGITUDE_REF_TAG_CANDIDATES),
    },
    sampleTagKeys: entries.slice(0, 20).map((entry) => entry.path),
  };
}

function inferMetadataSource(entryPath) {
  const normalizedPath = normalizeTagKey(entryPath);

  if (normalizedPath.includes('xmp')) {
    return 'xmp';
  }
  if (normalizedPath.includes('iptc')) {
    return 'iptc';
  }
  if (normalizedPath.includes('exif')) {
    return 'exif';
  }
  if (normalizedPath.includes('gps')) {
    return 'gps';
  }

  return 'embedded';
}

function parseCoordinateNumber(value) {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const decimal = Number(trimmed);
    if (!Number.isNaN(decimal)) {
      return decimal;
    }

    const normalized = trimmed.replace(',', '.');
    const normalizedDecimal = Number(normalized);
    if (!Number.isNaN(normalizedDecimal)) {
      return normalizedDecimal;
    }
  }

  return null;
}

function parseCoordinateFromText(value) {
  const direct = parseCoordinateNumber(value);
  if (direct !== null) {
    return direct;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const dmsMatch = value.match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)?\D+(\d+(?:\.\d+)?)?\D*([NSEW])?/i);
  if (!dmsMatch) {
    return null;
  }

  const degrees = Number(dmsMatch[1] || 0);
  const minutes = Number(dmsMatch[2] || 0);
  const seconds = Number(dmsMatch[3] || 0);
  let decimal = degrees + minutes / 60 + seconds / 3600;
  const ref = (dmsMatch[4] || '').toUpperCase();
  if (ref === 'S' || ref === 'W') {
    decimal = -Math.abs(decimal);
  }

  return Number.isNaN(decimal) ? null : decimal;
}

function parseDateFromUnixTimestamp(value) {
  const seconds = Number(value);
  if (Number.isNaN(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000);
}

function readFromObjectRecursive(root, candidateKeys) {
  if (!root || typeof root !== 'object') {
    return null;
  }

  const normalizedCandidates = candidateKeys.map((key) => normalizeTagKey(key));
  const queue = [root];
  const visited = new WeakSet();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = normalizeTagKey(key);
      const matched = normalizedCandidates.some((candidate) =>
        normalizedKey === candidate ||
        normalizedKey.endsWith(candidate) ||
        normalizedKey.includes(candidate),
      );
      if (matched && (typeof value === 'string' || typeof value === 'number')) {
        return value;
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function extractFromXmpText(xmlText, patterns) {
  if (typeof xmlText !== 'string' || !xmlText) {
    return null;
  }

  for (const pattern of patterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrRegex = new RegExp(`${escaped}\\s*=\\s*\"([^\"]+)\"`, 'i');
    const attrMatch = xmlText.match(attrRegex);
    if (attrMatch?.[1]) {
      return attrMatch[1];
    }

    const tagRegex = new RegExp(`<[^>]*${escaped}[^>]*>([^<]+)</[^>]+>`, 'i');
    const tagMatch = xmlText.match(tagRegex);
    if (tagMatch?.[1]) {
      return tagMatch[1];
    }
  }

  return null;
}

async function parseSidecarFile(file) {
  if (!file) {
    return null;
  }

  const text = await file.text();
  const trimmed = text.trim();

  const sidecar = {
    fileName: file.name,
    source: 'sidecar',
    date: null,
    latitude: null,
    longitude: null,
    summary: 'Sidecar loaded but no supported date/GPS fields were found.',
  };

  if (!trimmed) {
    sidecar.summary = 'Sidecar file is empty.';
    return sidecar;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const timestamp =
        readFromObjectRecursive(parsed, ['photoTakenTimeTimestamp', 'timestamp']) ||
        parsed?.photoTakenTime?.timestamp ||
        parsed?.creationTime?.timestamp ||
        null;

      const dateValue =
        parsed?.photoTakenTime?.formatted ||
        parsed?.creationTime?.formatted ||
        readFromObjectRecursive(parsed, [
          'DateTimeOriginal',
          'DateTimeDigitized',
          'DateCreated',
          'CreateDate',
          'dateTaken',
          'photoTakenTime',
        ]) ||
        parseDateFromUnixTimestamp(timestamp);

      const latitudeValue =
        parsed?.geoDataExif?.latitude ||
        parsed?.geoData?.latitude ||
        readFromObjectRecursive(parsed, ['GPSLatitude', 'latitude', 'lat']);
      const longitudeValue =
        parsed?.geoDataExif?.longitude ||
        parsed?.geoData?.longitude ||
        readFromObjectRecursive(parsed, ['GPSLongitude', 'longitude', 'lon', 'lng']);

      sidecar.date = dateValue || null;
      sidecar.latitude = parseCoordinateFromText(latitudeValue);
      sidecar.longitude = parseCoordinateFromText(longitudeValue);
      sidecar.summary = 'Parsed JSON sidecar.';
      return sidecar;
    } catch {
      // fall through to XML/text parsing
    }
  }

  const xmlDate = extractFromXmpText(trimmed, [
    'DateTimeOriginal',
    'DateTimeDigitized',
    'CreateDate',
    'DateCreated',
    'MetadataDate',
    'photoshop:DateCreated',
    'xmp:CreateDate',
    'xmp:ModifyDate',
  ]);
  const xmlLatitude = extractFromXmpText(trimmed, ['GPSLatitude', 'exif:GPSLatitude']);
  const xmlLongitude = extractFromXmpText(trimmed, ['GPSLongitude', 'exif:GPSLongitude']);

  sidecar.date = xmlDate || null;
  sidecar.latitude = parseCoordinateFromText(xmlLatitude);
  sidecar.longitude = parseCoordinateFromText(xmlLongitude);
  sidecar.summary = 'Parsed XML/XMP sidecar.';

  return sidecar;
}

export default function ImageExifUploader({
  onMetadataChange,
  matchedShowDate = '',
  showStartTime = '',
  showData = null,
  currentSongLabel = '',
  timeContextLabel = '',
  calibrationMetadata = null,
}) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedSidecarFileName, setSelectedSidecarFileName] = useState('');
  const [metadata, setMetadata] = useState(emptyMetadata);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const [sidecarError, setSidecarError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const previewUrlRef = useRef('');
  const inputRef = useRef(null);
  const sidecarInputRef = useRef(null);
  const lastImageFileRef = useRef(null);
  const activeSidecarRef = useRef(null);

  const handleSaveToLibrary = async () => {
    if (!lastImageFileRef.current) {
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // 1. Client-side WebP optimization
      const { webpBlob, originalName } = await convertToWebP(lastImageFileRef.current, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,
      });

      // 2. Build FormData
      const formData = new FormData();
      const webpFile = new File([webpBlob], originalName.replace(/\.[^/.]+$/, '') + '.webp', { type: 'image/webp' });

      formData.append('file', webpFile);
      formData.append('fileName', selectedFileName || originalName);
      formData.append('dateTaken', metadata.dateTimeOriginal || '');
      formData.append('timeTaken', metadata.timeTaken || '');
      if (metadata.gpsLatitude !== 'Not available') formData.append('gpsLatitude', String(metadata.gpsLatitude));
      if (metadata.gpsLongitude !== 'Not available') formData.append('gpsLongitude', String(metadata.gpsLongitude));
      if (matchedShowDate) formData.append('matchedShowDate', matchedShowDate);
      if (showStartTime) formData.append('showStartTime', showStartTime);
      formData.append(
        'rawExif',
        JSON.stringify({
          ...metadata,
          showMetadata: {
            matchedShowDate: matchedShowDate || null,
            showStartTime: showStartTime || null,
            venueName: showData?.venueName || null,
            city: showData?.city || null,
            state: showData?.state || null,
            currentSong: currentSongLabel || null,
            timeContextLabel: timeContextLabel || null,
            calibrationSource: calibrationMetadata?.source || null,
            calibrationConfidence: calibrationMetadata?.confidence || null,
            calibrationMatchedSong: calibrationMetadata?.matchedSongLabel || null,
            timingCalibration: calibrationMetadata
              ? {
                  source: calibrationMetadata.source || null,
                  confidence: calibrationMetadata.confidence || null,
                  matchedSongLabel: calibrationMetadata.matchedSongLabel || null,
                  showStartTime: calibrationMetadata.showStartTime || showStartTime || null,
                }
              : null,
            showData: showData || null,
          },
        })
      );

      const res = await savePhotoToLibrary(formData);
      if (!res || typeof res !== 'object' || typeof res.success !== 'boolean') {
        setSaveMessage({ type: 'error', text: 'Save did not complete correctly. Please try again.' });
        return;
      }

      if (res.success) {
        setSaveMessage({ type: 'success', text: 'Saved to your personal library!' });
      } else {
        setSaveMessage({ type: 'error', text: res.error || 'Failed to save photo.' });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message || 'Error converting/uploading image.' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const resetMetadata = useCallback(() => {
    setMetadata(emptyMetadata);
    onMetadataChange?.(emptyMetadata);
    setError('');
  }, [onMetadataChange]);

  const handleFile = useCallback(async (file, overrideSidecar = null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      resetMetadata();
      return;
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }

    lastImageFileRef.current = file;

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setSelectedFileName(file.name);
    setIsParsing(true);
    setError('');

    try {
      const tags = await ExifReader.load(file, { expanded: true });
      const entries = collectTagEntries(tags);
      const activeSidecar = overrideSidecar || activeSidecarRef.current;
      const sidecarSummary = activeSidecar?.summary || 'No sidecar loaded.';
      const diagnostics = buildDiagnostics(entries, sidecarSummary);

      const dateEntry = findBestCandidateMatch(entries, DATE_TAG_CANDIDATES);
      let rawDateValue = readTagValueFromEntries(entries, DATE_TAG_CANDIDATES);
      let dateSource = dateEntry ? inferMetadataSource(dateEntry.path) : 'none';
      let timeSource = dateSource;

      const gpsLatitudeEntry = findBestCandidateMatch(entries, GPS_LATITUDE_TAG_CANDIDATES);
      const gpsLongitudeEntry = findBestCandidateMatch(entries, GPS_LONGITUDE_TAG_CANDIDATES);
      const gpsLatitudeRefEntry = findBestCandidateMatch(entries, GPS_LATITUDE_REF_TAG_CANDIDATES);
      const gpsLongitudeRefEntry = findBestCandidateMatch(entries, GPS_LONGITUDE_REF_TAG_CANDIDATES);

      let rawGpsLatitude = readTagValueFromEntries(entries, GPS_LATITUDE_TAG_CANDIDATES, { preferDescription: false });
      let rawGpsLongitude = readTagValueFromEntries(entries, GPS_LONGITUDE_TAG_CANDIDATES, { preferDescription: false });
      let rawGpsLatitudeRef = readTagValueFromEntries(entries, GPS_LATITUDE_REF_TAG_CANDIDATES);
      let rawGpsLongitudeRef = readTagValueFromEntries(entries, GPS_LONGITUDE_REF_TAG_CANDIDATES);
      let gpsSource = gpsLatitudeEntry ? inferMetadataSource(gpsLatitudeEntry.path) : 'none';

      if (!rawDateValue && activeSidecar?.date) {
        rawDateValue = activeSidecar.date;
        dateSource = 'sidecar';
        timeSource = 'sidecar';
      }
      if (!rawDateValue && typeof file.lastModified === 'number' && file.lastModified > 0) {
        rawDateValue = new Date(file.lastModified);
        dateSource = 'file-last-modified';
        timeSource = 'file-last-modified';
      }
      if (!rawDateValue) {
        dateSource = 'none';
        timeSource = 'none';
      }

      if (!rawGpsLatitude && activeSidecar?.latitude != null) {
        rawGpsLatitude = activeSidecar.latitude;
        gpsSource = 'sidecar';
      }
      if (!rawGpsLongitude && activeSidecar?.longitude != null) {
        rawGpsLongitude = activeSidecar.longitude;
        gpsSource = 'sidecar';
      }
      if (!rawGpsLatitudeRef && gpsLatitudeEntry && gpsLatitudeEntry.preview) {
        rawGpsLatitudeRef = gpsLatitudeEntry.preview.includes('-') ? 'S' : 'N';
      }
      if (!rawGpsLongitudeRef && gpsLongitudeEntry && gpsLongitudeEntry.preview) {
        rawGpsLongitudeRef = gpsLongitudeEntry.preview.includes('-') ? 'W' : 'E';
      }

      const nextMetadata = {
        dateTimeOriginal: parseExifDate(rawDateValue) || 'Not available',
        dateTimeOriginalDisplay: formatExifDate(rawDateValue) || 'Not available',
        timeTaken: parseExifTime(rawDateValue) || 'Not available',
        gpsLatitude: formatCoordinate(rawGpsLatitude, rawGpsLatitudeRef) || 'Not available',
        gpsLongitude: formatCoordinate(rawGpsLongitude, rawGpsLongitudeRef) || 'Not available',
        dateSource,
        timeSource: parseExifTime(rawDateValue) ? timeSource : 'none',
        gpsSource: rawGpsLatitude != null && rawGpsLongitude != null ? gpsSource : 'none',
        sidecarFileName: activeSidecar?.fileName || '',
        sidecarUsed: Boolean(activeSidecar && (activeSidecar.date || activeSidecar.latitude != null || activeSidecar.longitude != null)),
        rawDateTimeOriginal: rawDateValue || null,
        rawGpsLatitude,
        rawGpsLongitude,
        rawGpsLatitudeRef: rawGpsLatitudeRef || gpsLatitudeRefEntry?.preview || null,
        rawGpsLongitudeRef: rawGpsLongitudeRef || gpsLongitudeRefEntry?.preview || null,
        diagnostics,
      };
      setMetadata(nextMetadata);
      onMetadataChange?.(nextMetadata);
    } catch (parseError) {
      setError('Unable to read EXIF data for this image.');
      setMetadata(emptyMetadata);
      onMetadataChange?.(emptyMetadata);
      console.error(parseError);
    } finally {
      setIsParsing(false);
    }
  }, [onMetadataChange, resetMetadata]);

  const onInputChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const onSidecarInputChange = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setSidecarError('');
      const parsed = await parseSidecarFile(file);
      activeSidecarRef.current = parsed;
      setSelectedSidecarFileName(file.name);

      if (lastImageFileRef.current) {
        await handleFile(lastImageFileRef.current, parsed);
      }
    } catch (sidecarParseError) {
      setSidecarError('Unable to parse sidecar file. Use JSON or XMP/XML with date and GPS fields.');
      console.error(sidecarParseError);
    }
  }, [handleFile]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    const imageFile = droppedFiles.find((entry) => entry.type.startsWith('image/'));
    const sidecarFile = droppedFiles.find((entry) => !entry.type.startsWith('image/'));

    if (sidecarFile) {
      parseSidecarFile(sidecarFile)
        .then((parsed) => {
          activeSidecarRef.current = parsed;
          setSelectedSidecarFileName(sidecarFile.name);
          if (imageFile) {
            handleFile(imageFile, parsed);
          } else if (lastImageFileRef.current) {
            handleFile(lastImageFileRef.current, parsed);
          }
        })
        .catch((sidecarParseError) => {
          setSidecarError('Unable to parse dropped sidecar file.');
          console.error(sidecarParseError);
          if (imageFile) {
            handleFile(imageFile);
          }
        });
      return;
    }

    if (imageFile) {
      handleFile(imageFile);
    }
  }, [handleFile]);

  const infoRows = useMemo(() => [
    { label: 'Date taken', value: metadata.dateTimeOriginalDisplay || metadata.dateTimeOriginal },
    { label: 'Time taken', value: metadata.timeTaken },
    { label: 'Latitude', value: metadata.gpsLatitude },
    { label: 'Longitude', value: metadata.gpsLongitude },
  ], [metadata]);

  return (
    <div className="space-y-6">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`rounded-3xl border-2 border-dashed p-5 text-center transition sm:p-8 ${isDragging ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-700 bg-slate-950/70'}`}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onInputChange} />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 sm:gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300 sm:h-14 sm:w-14">
            <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16l4-4 3 3 5-6 4 5" />
              <rect x="3" y="4" width="18" height="16" rx="2" />
            </svg>
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-white sm:text-lg">Drop an image here</p>
            <p className="text-sm text-slate-400">or</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 sm:w-auto"
          >
            Select image file
          </button>
          <input
            ref={sidecarInputRef}
            type="file"
            accept=".json,.xmp,.xml,.txt,application/json,application/xml,text/xml,text/plain"
            className="hidden"
            onChange={onSidecarInputChange}
          />
          <details className="w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-left">
            <summary className="cursor-pointer text-xs font-medium text-slate-300">
              Advanced: load sidecar metadata (only if embedded metadata is missing)
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-400">
                Most photos should work without this. Use sidecar files only when cloud exports separate metadata from the image bytes.
              </p>
              <button
                type="button"
                onClick={() => sidecarInputRef.current?.click()}
                className="w-full rounded-full border border-slate-600 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto"
              >
                Select sidecar file (optional)
              </button>
            </div>
          </details>
          {selectedSidecarFileName ? (
            <p className="text-xs text-slate-400">Sidecar loaded: {selectedSidecarFileName}</p>
          ) : null}
        </div>
      </div>

      {isParsing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
          Parsing EXIF metadata...
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      )}

      {sidecarError && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          {sidecarError}
        </div>
      )}

      {previewUrl && (
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-slate-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
            <div>
              <p className="text-sm font-medium text-slate-300">Preview</p>
              <p className="text-xs text-slate-500">{selectedFileName}</p>
            </div>
          </div>

          {saveMessage && (
            <div className={`mx-4 mt-4 rounded-xl border p-3 text-xs font-medium ${
              saveMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-emerald-500/10 text-red-300'
            }`}>
              {saveMessage.text}
            </div>
          )}

          <div className="p-3 sm:p-6">
           <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-950/80 p-2">
              <img 
                src={previewUrl} 
                alt="Uploaded preview" 
                className="h-auto w-full rounded-xl object-contain" 
              />
            </div>
           <div className="mt-4 flex justify-center">
             <button
               onClick={handleSaveToLibrary}
               disabled={isSaving}
               className="flex w-full items-center justify-center space-x-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-300 transition-all hover:border-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 sm:w-auto"
             >
               <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
               </svg>
               <span>{isSaving ? 'Optimizing & Saving...' : 'Save WebP to Library'}</span>
             </button>
           </div>
           <div className="mt-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 sm:mt-6 sm:gap-4 sm:p-4 sm:grid-cols-2 lg:grid-cols-4">
             {infoRows.map((row) => (
               <div key={row.label} className="rounded-2xl bg-slate-900/80 p-3 sm:p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{row.label}</p>
                  <p className="mt-2 text-sm font-medium text-white">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <details className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <summary className="cursor-pointer font-medium text-white">Metadata diagnostics</summary>
          <div className="mt-3 space-y-3">
            <p>
              Date source: <span className="font-medium text-cyan-300">{metadata.dateSource}</span>
            </p>
            <p>
              Parsed metadata tags found: <span className="font-medium text-cyan-300">{metadata.diagnostics?.totalTagEntries ?? 0}</span>
            </p>
            <p>
              Sidecar status: <span className="font-medium text-cyan-300">{metadata.diagnostics?.sidecarSummary || 'No sidecar loaded.'}</span>
            </p>

            <div>
              <p className="mb-1 font-medium text-white">Date candidate matches</p>
              {(metadata.diagnostics?.candidateMatches?.date?.length ?? 0) > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                  {metadata.diagnostics.candidateMatches.date.map((match) => (
                    <li key={`date-${match.path}`}>
                      {match.path}: {match.preview || '(empty)'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No date-like EXIF tags were found in this file.</p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 font-medium text-white">GPS latitude candidates</p>
                {(metadata.diagnostics?.candidateMatches?.gpsLatitude?.length ?? 0) > 0 ? (
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                    {metadata.diagnostics.candidateMatches.gpsLatitude.map((match) => (
                      <li key={`lat-${match.path}`}>
                        {match.path}: {match.preview || '(empty)'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">No latitude tags found.</p>
                )}
              </div>
              <div>
                <p className="mb-1 font-medium text-white">GPS longitude candidates</p>
                {(metadata.diagnostics?.candidateMatches?.gpsLongitude?.length ?? 0) > 0 ? (
                  <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                    {metadata.diagnostics.candidateMatches.gpsLongitude.map((match) => (
                      <li key={`lon-${match.path}`}>
                        {match.path}: {match.preview || '(empty)'}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">No longitude tags found.</p>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium text-white">Sample parsed tag keys</p>
              {(metadata.diagnostics?.sampleTagKeys?.length ?? 0) > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                  {metadata.diagnostics.sampleTagKeys.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No tag keys were parsed from this file.</p>
              )}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
