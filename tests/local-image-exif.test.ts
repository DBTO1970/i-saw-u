import { describe, expect, it } from 'vitest';
import { extractCleanPhotoExifFromTags } from '../lib/local-image-exif';

describe('extractCleanPhotoExifFromTags', () => {
  it('prefers DateTimeOriginal and parses GPS plus camera model', () => {
    const parsed = extractCleanPhotoExifFromTags({
      DateTimeOriginal: { description: '2026:08:01 20:14:09' },
      CreateDate: { description: '2026:08:01 20:14:12' },
      GPSLatitude: { value: [40, 45, 30] },
      GPSLongitude: { value: [73, 59, 11] },
      GPSLatitudeRef: { value: 'N' },
      GPSLongitudeRef: { value: 'W' },
      Model: { description: 'Pixel 9 Pro' },
    });

    expect(parsed.rawDateTimeOriginal).toBe('2026:08:01 20:14:09');
    expect(parsed.dateTimeOriginal).toBe('2026-08-01');
    expect(parsed.timeTaken).toBe('20:14:09');
    expect(parsed.cameraModel).toBe('Pixel 9 Pro');
    expect(parsed.gpsLatitude).toBeCloseTo(40.758333, 5);
    expect(parsed.gpsLongitude).toBeCloseTo(-73.986389, 5);
  });

  it('returns null-safe fields when metadata is missing', () => {
    const parsed = extractCleanPhotoExifFromTags({});
    expect(parsed.rawDateTimeOriginal).toBeNull();
    expect(parsed.dateTimeOriginal).toBeNull();
    expect(parsed.timeTaken).toBeNull();
    expect(parsed.gpsLatitude).toBeNull();
    expect(parsed.gpsLongitude).toBeNull();
    expect(parsed.cameraModel).toBeNull();
  });
});
