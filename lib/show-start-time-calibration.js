const DEFAULT_FALLBACK_SONG_DURATION_SECONDS = 8 * 60;
const DEFAULT_BETWEEN_SONGS_SECONDS = 20;
const DEFAULT_SET_BREAK_MINUTES = 35;
const DEFAULT_ENCORE_BREAK_MINUTES = 10;
const DEFAULT_TYPICAL_DELAY_MINUTES = 35;
const DEFAULT_ROUNDING_MINUTES = 5;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSectionHeader(type) {
  const normalized = normalizeText(type).toLowerCase();
  return normalized === 'set' || normalized === 'encore' || normalized === 'encores';
}

function normalizeDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function clampSongDurationSeconds(value, fallbackSeconds) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallbackSeconds;
}

function inferBreakDurationMs(previousSetLabel, nextSetLabel, setBreakMinutes, encoreBreakMinutes) {
  if (!previousSetLabel || !nextSetLabel) {
    return 0;
  }

  if (normalizeText(nextSetLabel).toLowerCase().includes('encore')) {
    return encoreBreakMinutes * 60 * 1000;
  }

  return setBreakMinutes * 60 * 1000;
}

function formatMinutesTo24h(totalMinutes) {
  const wrappedMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(wrappedMinutes / 60);
  const minutes = wrappedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function roundMinutes(minutes, increment) {
  if (!increment || increment <= 1) {
    return minutes;
  }

  return Math.round(minutes / increment) * increment;
}

export function buildSetlistSongTimeline(setlistTracks = [], options = {}) {
  if (!Array.isArray(setlistTracks) || setlistTracks.length === 0) {
    return [];
  }

  const fallbackSongDurationSeconds = Number.isFinite(options.fallbackSongDurationSeconds)
    ? options.fallbackSongDurationSeconds
    : DEFAULT_FALLBACK_SONG_DURATION_SECONDS;
  const betweenSongsMs = (Number.isFinite(options.betweenSongsSeconds)
    ? options.betweenSongsSeconds
    : DEFAULT_BETWEEN_SONGS_SECONDS) * 1000;
  const setBreakMinutes = Number.isFinite(options.setBreakMinutes)
    ? options.setBreakMinutes
    : DEFAULT_SET_BREAK_MINUTES;
  const encoreBreakMinutes = Number.isFinite(options.encoreBreakMinutes)
    ? options.encoreBreakMinutes
    : DEFAULT_ENCORE_BREAK_MINUTES;

  const entries = setlistTracks.filter((entry) => entry && typeof entry === 'object' && normalizeText(entry.label));
  if (!entries.length) {
    return [];
  }

  const songs = [];
  let cursorMs = 0;
  let activeSetLabel = null;

  entries.forEach((entry) => {
    const entryLabel = normalizeText(entry.label);

    if (isSectionHeader(entry.type)) {
      if (activeSetLabel) {
        cursorMs += inferBreakDurationMs(activeSetLabel, entryLabel, setBreakMinutes, encoreBreakMinutes);
      }
      activeSetLabel = entryLabel;
      return;
    }

    const durationSeconds = clampSongDurationSeconds(entry.durationSeconds, fallbackSongDurationSeconds);
    const durationMs = durationSeconds * 1000;
    const startOffsetMs = cursorMs;
    const endOffsetMs = startOffsetMs + durationMs;

    songs.push({
      index: songs.length,
      label: entryLabel,
      setLabel: activeSetLabel || 'Setlist',
      durationSeconds,
      startOffsetMs,
      endOffsetMs,
      midpointOffsetMs: startOffsetMs + Math.floor(durationMs / 2),
      startOffsetMinutes: Math.round(startOffsetMs / 60000),
      endOffsetMinutes: Math.round(endOffsetMs / 60000),
    });

    cursorMs = endOffsetMs + betweenSongsMs;
  });

  return songs;
}

export function calibrateShowStartTime(photoTimestamp, setlistTracks = [], options = {}) {
  const photoDate = normalizeDate(photoTimestamp);
  if (!photoDate) {
    return null;
  }

  const songs = buildSetlistSongTimeline(setlistTracks, options);
  if (!songs.length) {
    return null;
  }

  const targetSongIndex = Number.isInteger(options.targetSongIndex)
    ? options.targetSongIndex
    : null;

  const anchorSong = targetSongIndex !== null
    ? songs.find((song) => song.index === targetSongIndex) || null
    : null;

  const typicalDelayMinutes = Number.isFinite(options.typicalDelayMinutes)
    ? options.typicalDelayMinutes
    : DEFAULT_TYPICAL_DELAY_MINUTES;

  const inferredSong = anchorSong || songs.reduce((best, song) => {
    if (!best) {
      return song;
    }

    const currentDelta = Math.abs(song.midpointOffsetMs - (typicalDelayMinutes * 60 * 1000));
    const bestDelta = Math.abs(best.midpointOffsetMs - (typicalDelayMinutes * 60 * 1000));
    return currentDelta < bestDelta ? song : best;
  }, null);

  if (!inferredSong) {
    return null;
  }

  const anchorOffsetMs = anchorSong ? inferredSong.startOffsetMs : inferredSong.midpointOffsetMs;
  const impliedShowStart = new Date(photoDate.getTime() - anchorOffsetMs);
  const rawShowStartMinutes = impliedShowStart.getHours() * 60 + impliedShowStart.getMinutes();
  const roundedShowStartMinutes = roundMinutes(
    rawShowStartMinutes,
    Number.isFinite(options.roundToMinutes) ? options.roundToMinutes : DEFAULT_ROUNDING_MINUTES
  );

  return {
    showStartTime: formatMinutesTo24h(roundedShowStartMinutes),
    showStartMinutes: roundedShowStartMinutes,
    impliedShowStart,
    matchedSongIndex: inferredSong.index,
    matchedSongLabel: inferredSong.label,
    calibrationSource: anchorSong ? 'snap-to-song' : 'typical-delay',
    songs,
  };
}
