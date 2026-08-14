import { getShowByDate } from './actions/shows';
import { cookies } from 'next/headers';
import HomePageClient from '../components/HomePageClient';

export const dynamic = 'force-dynamic';

const emptyPhotoMetadata = {
  dateTimeOriginal: 'Not available',
  dateTimeOriginalDisplay: 'Not available',
  timeTaken: 'Not available',
  gpsLatitude: 'Not available',
  gpsLongitude: 'Not available',
  dateSource: 'none',
  timeSource: 'none',
  gpsSource: 'none',
  rawDateTimeOriginal: null,
  rawGpsLatitude: null,
  rawGpsLongitude: null,
  rawGpsLatitudeRef: null,
  rawGpsLongitudeRef: null,
};

function readSharedPhotoPayload() {
  const cookieStore = cookies();
  const raw = cookieStore.get('sharedPhotoPayload')?.value;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (error) {
    console.error('Unable to parse shared photo payload cookie:', error);
    return null;
  }
}

function toInitialPhotoMetadataFromShare(sharedPayload) {
  const metadata = sharedPayload?.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return emptyPhotoMetadata;
  }

  return {
    dateTimeOriginal: metadata.dateTimeOriginal || 'Not available',
    dateTimeOriginalDisplay: metadata.dateTimeOriginalDisplay || metadata.dateTimeOriginal || 'Not available',
    timeTaken: metadata.timeTaken || 'Not available',
    gpsLatitude: metadata.gpsLatitude != null ? String(metadata.gpsLatitude) : 'Not available',
    gpsLongitude: metadata.gpsLongitude != null ? String(metadata.gpsLongitude) : 'Not available',
    rawDateTimeOriginal: metadata.rawDateTimeOriginal || null,
    rawGpsLatitude: metadata.gpsLatitude ?? null,
    rawGpsLongitude: metadata.gpsLongitude ?? null,
    rawGpsLatitudeRef: metadata.gpsLatitudeRef || null,
    rawGpsLongitudeRef: metadata.gpsLongitudeRef || null,
    dateSource: metadata.dateTimeOriginal ? 'exif' : 'none',
    timeSource: metadata.timeTaken ? 'exif' : 'none',
    gpsSource: metadata.gpsLatitude != null && metadata.gpsLongitude != null ? 'exif' : 'none',
  };
}

function initialDateForLookup(metadata) {
  if (typeof metadata?.dateTimeOriginal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metadata.dateTimeOriginal)) {
    return metadata.dateTimeOriginal;
  }
  return null;
}

export default async function HomePage({ searchParams }) {
  const sharedPhotoPayload = readSharedPhotoPayload();
  const initialPhotoMetadata = toInitialPhotoMetadataFromShare(sharedPhotoPayload);
  const lookupDate = initialDateForLookup(initialPhotoMetadata);
  const authError = searchParams?.auth_error;
  const showResult = lookupDate
    ? await getShowByDate(lookupDate)
    : {
      show: null,
      error: null,
      nearbyShows: [],
      relatedDateShows: [],
    };

  return (
    <HomePageClient
      initialPhotoMetadata={initialPhotoMetadata}
      showResult={showResult}
      authError={authError}
      sharedPhotoPayload={sharedPhotoPayload}
    />
  );
}