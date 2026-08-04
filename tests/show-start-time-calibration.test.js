import { describe, expect, it } from 'vitest';
import { buildSetlistSongTimeline, calibrateShowStartTime } from '../lib/show-start-time-calibration';

function createSetlistFixture() {
  return [
    { type: 'set', label: 'Set 1' },
    { type: 'song', label: 'Song A', durationSeconds: 600 },
    { type: 'song', label: 'Song B', durationSeconds: 600 },
    { type: 'set', label: 'Set 2' },
    { type: 'song', label: 'Song C', durationSeconds: 600 },
    { type: 'encore', label: 'Encore' },
    { type: 'song', label: 'Song D', durationSeconds: 600 },
  ];
}

describe('buildSetlistSongTimeline', () => {
  it('accounts for between-song gaps and set/encore breaks in song offsets', () => {
    const songs = buildSetlistSongTimeline(createSetlistFixture(), {
      betweenSongsSeconds: 20,
      setBreakMinutes: 35,
      encoreBreakMinutes: 10,
    });

    expect(songs).toHaveLength(4);
    expect(songs[0].label).toBe('Song A');
    expect(songs[0].startOffsetMs).toBe(0);

    expect(songs[1].label).toBe('Song B');
    expect(songs[1].startOffsetMs).toBe((600 + 20) * 1000);

    expect(songs[2].label).toBe('Song C');
    expect(songs[2].startOffsetMs).toBe((600 + 20 + 600 + 20 + 35 * 60) * 1000);

    expect(songs[3].label).toBe('Song D');
    expect(songs[3].startOffsetMs).toBe((600 + 20 + 600 + 20 + 35 * 60 + 600 + 20 + 10 * 60) * 1000);
  });
});

describe('calibrateShowStartTime', () => {
  it('computes implied show start from target song index (inverse mapping)', () => {
    const setlist = createSetlistFixture();
    const photoTimestamp = new Date('2026-07-10T20:10:00');
    const result = calibrateShowStartTime(photoTimestamp, setlist, {
      targetSongIndex: 2,
      roundToMinutes: 1,
      betweenSongsSeconds: 20,
      setBreakMinutes: 35,
      encoreBreakMinutes: 10,
    });

    expect(result).not.toBeNull();
    expect(result.calibrationSource).toBe('snap-to-song');
    expect(result.matchedSongIndex).toBe(2);
    expect(result.matchedSongLabel).toBe('Song C');

    const expectedOffsetMs = (600 + 20 + 600 + 20 + 35 * 60 + 600 / 2) * 1000;
    expect(photoTimestamp.getTime() - result.impliedShowStart.getTime()).toBe(expectedOffsetMs);
  });

  it('uses typical delay anchor when target song is not provided', () => {
    const setlist = [
      { type: 'set', label: 'Set 1' },
      { type: 'song', label: 'Opener', durationSeconds: 420 },
      { type: 'song', label: 'Second Song', durationSeconds: 420 },
      { type: 'song', label: 'Third Song', durationSeconds: 420 },
      { type: 'song', label: 'Fourth Song', durationSeconds: 420 },
      { type: 'song', label: 'Fifth Song', durationSeconds: 420 },
    ];
    const photoTimestamp = new Date('2026-07-10T20:10:00');

    const result = calibrateShowStartTime(photoTimestamp, setlist, {
      typicalDelayMinutes: 35,
      roundToMinutes: 1,
      betweenSongsSeconds: 0,
    });

    expect(result).not.toBeNull();
    expect(result.calibrationSource).toBe('typical-delay');
    expect(result.matchedSongIndex).toBe(4);
    expect(result.matchedSongLabel).toBe('Fifth Song');
  });

  it('parses EXIF-style timestamps without a timezone as local time', () => {
    const setlist = createSetlistFixture();
    const result = calibrateShowStartTime('2026:07:10 20:10:00', setlist, {
      targetSongIndex: 0,
      roundToMinutes: 1,
    });

    expect(result).not.toBeNull();
    expect(result.showStartTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.referenceShowStartTime).toBe('20:00');
  });

  it('detects a consistent clock drift across multiple photo observations', () => {
    const setlist = [
      { type: 'set', label: 'Set 1' },
      { type: 'song', label: 'Opener', durationSeconds: 600 },
      { type: 'song', label: 'Second Song', durationSeconds: 600 },
    ];

    const result = calibrateShowStartTime(new Date('2026-07-10T20:19:00'), setlist, {
      targetSongIndex: 0,
      roundToMinutes: 1,
      expectedShowStartTime: '20:00',
      observations: [
        { photoTimestamp: new Date('2026-07-10T20:19:00'), targetSongIndex: 0, weight: 1 },
        { photoTimestamp: new Date('2026-07-10T20:20:00'), targetSongIndex: 0, weight: 1 },
      ],
    });

    expect(result).not.toBeNull();
    expect(result.calibrationSource).toBe('consensus');
    expect(result.observationCount).toBe(2);
    expect(result.clockDriftMinutes).toBeGreaterThanOrEqual(13);
    expect(result.showStartTime).toMatch(/^20:1[45]$/);
  });

  it('marks near-boundary matches as fuzzy', () => {
    const setlist = [
      { type: 'set', label: 'Set 1' },
      { type: 'song', label: 'Mike\'s Song', durationSeconds: 180 },
      { type: 'song', label: 'Hydrogen', durationSeconds: 180 },
    ];

    const result = calibrateShowStartTime(new Date('2026-07-10T20:04:30'), setlist, {
      targetSongIndex: 1,
      roundToMinutes: 1,
      expectedShowStartTime: '20:00',
      betweenSongsSeconds: 0,
    });

    expect(result).not.toBeNull();
    expect(result.confidence).toBe('fuzzy');
    expect(result.boundaryMatch).toBe(true);
    expect(result.matchedSongLabels).toEqual(['Mike\'s Song', 'Hydrogen']);
  });

  it('returns null when timestamp is missing or invalid', () => {
    const setlist = createSetlistFixture();
    expect(calibrateShowStartTime(null, setlist)).toBeNull();
    expect(calibrateShowStartTime('invalid-date', setlist)).toBeNull();
  });
});
