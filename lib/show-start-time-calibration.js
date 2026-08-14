const DEFAULT_FALLBACK_SONG_DURATION_SECONDS = 8 * 60;
const DEFAULT_BETWEEN_SONGS_SECONDS = 20;
const DEFAULT_SET_BREAK_MINUTES = 35;
const DEFAULT_ENCORE_BREAK_MINUTES = 10;
const DEFAULT_TYPICAL_DELAY_MINUTES = 35;
const DEFAULT_ROUNDING_MINUTES = 5;
const DEFAULT_REFERENCE_SHOW_START = '20:00';
const DEFAULT_REFERENCE_SHOW_START_MINUTES = 20 * 60;
const DEFAULT_FUZZY_BOUNDARY_WINDOW_MINUTES = 3;
const MINUTES_PER_DAY = 24 * 60;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTimeString(value, fallback = DEFAULT_REFERENCE_SHOW_START) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeStringToMinutes(value, fallback = DEFAULT_REFERENCE_SHOW_START_MINUTES) {
  const normalized = normalizeTimeString(value, null);
  if (!normalized) {
    return fallback;
  }

  const [hours, minutes] = normalized.split(':').map((part) => Number(part));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return fallback;
  }

  return hours * 60 + minutes;
}

function wrapMinutes(minutes) {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function shortestMinuteDelta(minutesA, minutesB) {
  const a = wrapMinutes(minutesA);
  const b = wrapMinutes(minutesB);
  let delta = a - b;
  if (delta > MINUTES_PER_DAY / 2) {
    delta -= MINUTES_PER_DAY;
  }
  if (delta < -MINUTES_PER_DAY / 2) {
    delta += MINUTES_PER_DAY;
  }
  return delta;
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
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const exifLikeMatch = trimmed.match(
      /^(\d{4})[:\-](\d{2})[:\-](\d{2})(?:[ T])(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([zZ])|([+-]\d{2}:?\d{2}))?$/
    );
    if (exifLikeMatch) {
      const [, year, month, day, hours, minutes, seconds, fraction = '', zulu, offset] = exifLikeMatch;
      const isoLike = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${fraction ? `.${fraction}` : ''}${zulu || offset || ''}`;
      const parsed = new Date(isoLike);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(trimmed);
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

function scoreConfidenceLevel(confidence) {
  switch (confidence) {
    case 'high':
      return 90;
    case 'medium':
      return 70;
    case 'low':
      return 45;
    case 'fuzzy':
      return 35;
    case 'estimated_match':
      return 55;
    default:
      return 50;
  }
}

function clampConfidenceLabel(value) {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'fuzzy') {
    return value;
  }
  return 'low';
}

function inferBoundaryMatch(photoDate, impliedShowStart, songs, options = {}) {
  if (!photoDate || !impliedShowStart || !Array.isArray(songs) || songs.length === 0) {
    return null;
  }

  const fuzzyWindowMinutes = Number.isFinite(options.fuzzyBoundaryWindowMinutes)
    ? options.fuzzyBoundaryWindowMinutes
    : DEFAULT_FUZZY_BOUNDARY_WINDOW_MINUTES;
  const fuzzyWindowMs = fuzzyWindowMinutes * 60 * 1000;
  const elapsedMs = photoDate.getTime() - impliedShowStart.getTime();

  for (let index = 0; index < songs.length - 1; index += 1) {
    const currentSong = songs[index];
    const nextSong = songs[index + 1];
    const closeToCurrentEnd = Math.abs(elapsedMs - currentSong.endOffsetMs) <= fuzzyWindowMs;
    const closeToNextStart = Math.abs(elapsedMs - nextSong.startOffsetMs) <= fuzzyWindowMs;

    if (closeToCurrentEnd || closeToNextStart) {
      return {
        boundaryMatched: true,
        boundarySongLabels: [currentSong.label, nextSong.label],
        boundaryIndex: index,
      };
    }
  }

  return {
    boundaryMatched: false,
    boundarySongLabels: [],
    boundaryIndex: null,
  };
}

function chooseInferredSong(songs, options = {}) {
  if (!Array.isArray(songs) || songs.length === 0) {
    return null;
  }

  const targetSongIndex = Number.isInteger(options.targetSongIndex) ? options.targetSongIndex : null;
  if (targetSongIndex !== null) {
    return songs.find((song) => song.index === targetSongIndex) || null;
  }

  const typicalDelayMinutes = Number.isFinite(options.typicalDelayMinutes)
    ? options.typicalDelayMinutes
    : DEFAULT_TYPICAL_DELAY_MINUTES;
  const targetOffsetMs = typicalDelayMinutes * 60 * 1000;

  return songs.reduce((best, song) => {
    if (!best) {
      return song;
    }

    const currentDelta = Math.abs(song.midpointOffsetMs - targetOffsetMs);
    const bestDelta = Math.abs(best.midpointOffsetMs - targetOffsetMs);
    return currentDelta < bestDelta ? song : best;
  }, null);
}

function normalizeObservationEntry(photoTimestamp, observation) {
  if (!observation) {
    return { photoTimestamp, weight: 1 };
  }

  if (observation instanceof Date || typeof observation === 'string' || typeof observation === 'number') {
    return { photoTimestamp: observation, weight: 1 };
  }

  const nextPhotoTimestamp = observation.photoTimestamp || observation.timestamp || photoTimestamp;
  const weightValue = Number(observation.weight);
  const confidenceScore = Number(observation.confidenceScore);

  return {
    ...observation,
    photoTimestamp: nextPhotoTimestamp,
    weight: Number.isFinite(weightValue) && weightValue > 0
      ? weightValue
      : Number.isFinite(confidenceScore) && confidenceScore > 0
        ? confidenceScore / 100
        : 1,
  };
}

function calibrateSingleObservation(photoTimestamp, setlistTracks, options = {}) {
  const photoDate = normalizeDate(photoTimestamp);
  if (!photoDate) {
    return null;
  }

  const songs = buildSetlistSongTimeline(setlistTracks, options);
  if (!songs.length) {
    return null;
  }

  const inferredSong = chooseInferredSong(songs, options);
  if (!inferredSong) {
    return null;
  }

  const anchorOffsetMs = inferredSong.midpointOffsetMs;
  const impliedShowStart = new Date(photoDate.getTime() - anchorOffsetMs);
  const rawShowStartMinutes = impliedShowStart.getHours() * 60 + impliedShowStart.getMinutes();
  const roundedShowStartMinutes = roundMinutes(
    rawShowStartMinutes,
    Number.isFinite(options.roundToMinutes) ? options.roundToMinutes : DEFAULT_ROUNDING_MINUTES
  );
  const showStartTime = formatMinutesTo24h(roundedShowStartMinutes);
  const referenceShowStart = normalizeTimeString(options.expectedShowStartTime, DEFAULT_REFERENCE_SHOW_START);
  const referenceShowStartMinutes = timeStringToMinutes(referenceShowStart, DEFAULT_REFERENCE_SHOW_START_MINUTES);
  const boundaryMatch = inferBoundaryMatch(photoDate, impliedShowStart, songs, options);
  const clockDriftMinutes = shortestMinuteDelta(roundedShowStartMinutes, referenceShowStartMinutes);
  const durationCoverage = Number.isFinite(options.durationCoverage) ? options.durationCoverage : 1;
  const estimatedMatch = Boolean(options.estimatedMatch || durationCoverage < 0.5);

  let confidence = Number.isInteger(options.targetSongIndex) ? 'high' : 'medium';
  if (durationCoverage < 0.5) {
    confidence = confidence === 'high' ? 'medium' : 'low';
  }
  if (Math.abs(clockDriftMinutes) >= 12 && confidence === 'medium') {
    confidence = 'low';
  }
  if (boundaryMatch.boundaryMatched) {
    confidence = 'fuzzy';
  } else if (estimatedMatch) {
    confidence = 'estimated_match';
  }

  const confidenceScore = scoreConfidenceLevel(confidence) - (boundaryMatch.boundaryMatched ? 10 : 0);

  return {
    showStartTime,
    showStartMinutes: roundedShowStartMinutes,
    impliedShowStart,
    matchedSongIndex: inferredSong.index,
    matchedSongLabel: inferredSong.label,
    matchedSongLabels: boundaryMatch.boundaryMatched ? boundaryMatch.boundarySongLabels : [inferredSong.label],
    calibrationSource: Number.isInteger(options.targetSongIndex) ? 'snap-to-song' : 'typical-delay',
    confidence,
    confidenceScore: Math.max(0, confidenceScore),
    weight: Number.isFinite(options.weight) && options.weight > 0 ? options.weight : 1,
    clockDriftMinutes,
    referenceShowStartTime: referenceShowStart,
    boundaryMatch: boundaryMatch.boundaryMatched,
    boundarySongLabels: boundaryMatch.boundarySongLabels,
    songs,
  };
}

function aggregateCalibrationResults(results, options = {}) {
  const validResults = results.filter(Boolean);
  if (!validResults.length) {
    return null;
  }

  if (validResults.length === 1) {
    return validResults[0];
  }

  const sorted = [...validResults].sort((left, right) => left.showStartMinutes - right.showStartMinutes);
  const weights = sorted.map((result) => {
    const weight = Number(result.weight);
    if (Number.isFinite(weight) && weight > 0) {
      return weight;
    }
    return result.confidenceScore > 0 ? result.confidenceScore / 100 : 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || sorted.length;
  const targetWeight = totalWeight / 2;

  let runningWeight = 0;
  let consensus = sorted[sorted.length - 1];
  for (let index = 0; index < sorted.length; index += 1) {
    runningWeight += weights[index];
    if (runningWeight >= targetWeight) {
      consensus = sorted[index];
      break;
    }
  }

  const startMinutes = roundMinutes(
    consensus.showStartMinutes,
    Number.isFinite(options.roundToMinutes) ? options.roundToMinutes : DEFAULT_ROUNDING_MINUTES
  );
  const referenceShowStart = normalizeTimeString(options.expectedShowStartTime, DEFAULT_REFERENCE_SHOW_START);
  const referenceShowStartMinutes = timeStringToMinutes(referenceShowStart, DEFAULT_REFERENCE_SHOW_START_MINUTES);
  const clockDriftMinutes = shortestMinuteDelta(startMinutes, referenceShowStartMinutes);
  const minStart = sorted[0].showStartMinutes;
  const maxStart = sorted[sorted.length - 1].showStartMinutes;
  const spreadMinutes = Math.abs(maxStart - minStart);
  const anyBoundaryMatch = sorted.some((result) => result.boundaryMatch);

  let confidence = 'medium';
  if (spreadMinutes <= 2) {
    confidence = 'high';
  } else if (spreadMinutes <= 5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  if (anyBoundaryMatch) {
    confidence = 'fuzzy';
  }

  const consensusSong = sorted.reduce((best, result) => {
    if (!best) {
      return result;
    }
    if (Math.abs(result.showStartMinutes - startMinutes) < Math.abs(best.showStartMinutes - startMinutes)) {
      return result;
    }
    return best;
  }, null);

  return {
    ...consensus,
    showStartMinutes: startMinutes,
    showStartTime: formatMinutesTo24h(startMinutes),
    calibrationSource: 'consensus',
    confidence,
    confidenceScore: scoreConfidenceLevel(confidence),
    clockDriftMinutes,
    referenceShowStartTime: referenceShowStart,
    matchedSongIndex: consensusSong.matchedSongIndex,
    matchedSongLabel: consensusSong.matchedSongLabel,
    matchedSongLabels: consensusSong.matchedSongLabels,
    observationCount: validResults.length,
    observationSpreadMinutes: spreadMinutes,
    observations: validResults,
  };
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
  const observations = Array.isArray(options.observations) && options.observations.length > 0
    ? options.observations.map((observation) => normalizeObservationEntry(photoTimestamp, observation))
    : [normalizeObservationEntry(photoTimestamp, null)];
  const perObservationResults = observations.map((observation) => calibrateSingleObservation(observation.photoTimestamp, setlistTracks, {
    ...options,
    targetSongIndex: Number.isInteger(observation.targetSongIndex) ? observation.targetSongIndex : options.targetSongIndex,
    confidenceScore: observation.confidenceScore,
    weight: observation.weight,
  }));

  if (!perObservationResults.length || perObservationResults.every((result) => !result)) {
    return null;
  }

  const validPairedResults = perObservationResults
    .map((result, index) => (result ? { ...result, weight: observations[index]?.weight ?? result.weight } : null))
    .filter(Boolean);

  if (validPairedResults.length > 1) {
    const aggregated = aggregateCalibrationResults(validPairedResults, options);
    if (aggregated) {
      return aggregated;
    }
  }

  return validPairedResults[0] || perObservationResults.find(Boolean);
}
