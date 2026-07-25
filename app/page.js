import { getShowByDate } from './actions/shows';
import ShowMatchPanel from '../components/ShowMatchPanel';
import { cookies } from 'next/headers';

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

export default async function HomePage() {
  const sharedPhotoPayload = readSharedPhotoPayload();
  const initialPhotoMetadata = toInitialPhotoMetadataFromShare(sharedPhotoPayload);
  const lookupDate = initialDateForLookup(initialPhotoMetadata);
  const showResult = lookupDate
    ? await getShowByDate(lookupDate)
    : {
      show: null,
      error: null,
      nearbyShows: [],
      relatedDateShows: [],
    };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_60%)] px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur sm:rounded-3xl sm:p-6 md:p-10">
        <div className="mb-6 space-y-2 sm:mb-8 sm:space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400 sm:text-sm sm:tracking-[0.35em]">Image metadata</p>
          <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl md:text-4xl">Drag and drop an image to inspect its EXIF data</h1>
          <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
            Upload a photo to preview it and pull out the original capture date, latitude, and longitude from its EXIF metadata.  This Data is then matched to Phish show information from phish.net.  If No EXIF data is found, you can manually enter a date to see if there was a show on that day. When possible, phish.in data and audio links will be included for the show.  If a match is found, you can click the link to view the show on phish.net.
          </p>
          <p>Future implementations will include saving photo and metadata to a personal library.</p>
        </div>
        <ShowMatchPanel
          initialPhotoMetadata={initialPhotoMetadata}
          initialShowResult={showResult}
          initialSharedPhoto={sharedPhotoPayload
            ? {
              fileName: sharedPhotoPayload.fileName || 'Shared photo',
              receivedAt: sharedPhotoPayload.receivedAt || null,
            }
            : null}
        />
        <p>&copy; 2026 Don Barto Jr.</p>
      </div>
    </main>
  );
}
