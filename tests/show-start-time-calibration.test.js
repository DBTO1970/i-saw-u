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

    const expectedOffsetMs = (600 + 20 + 600 + 20 + 35 * 60) * 1000;
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

  it('returns null when timestamp is missing or invalid', () => {
    const setlist = createSetlistFixture();
    expect(calibrateShowStartTime(null, setlist)).toBeNull();
    expect(calibrateShowStartTime('invalid-date', setlist)).toBeNull();
  });
});
