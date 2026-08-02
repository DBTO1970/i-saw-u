function firstNonEmptyString(candidates = []) {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

export function normalizeTimeContextLabel(label) {
  if (typeof label !== 'string' || !label.trim()) {
    return '';
  }

  const normalized = label.trim().toLowerCase();
  if (normalized.includes('set break')) {
    return 'Set Break';
  }
  if (normalized.includes('pre') && normalized.includes('show')) {
    return 'Pre Show';
  }
  if (normalized.includes('post') && normalized.includes('show')) {
    return 'Post Show';
  }
  if (normalized.includes('between') && normalized.includes('show')) {
    return 'Between Shows';
  }

  return label.trim();
}

export function deriveCurrentSongLabelFromContext(context) {
  if (!context || typeof context !== 'object') {
    return '';
  }

  const songLabel = firstNonEmptyString([context.songLabel]);
  if (songLabel) {
    return songLabel;
  }

  return normalizeTimeContextLabel(context.label);
}

export function deriveCurrentSongLabelFromShowMetadata(showMetadata, rawExif = null) {
  const songLabel = firstNonEmptyString([
    showMetadata?.currentSong,
    showMetadata?.songTitle,
    showMetadata?.song_title,
    showMetadata?.calibrationMatchedSong,
    showMetadata?.timingCalibration?.matchedSongLabel,
    rawExif?.currentSong,
    rawExif?.songTitle,
    rawExif?.song_title,
    rawExif?.calibrationMatchedSong,
    rawExif?.timingCalibration?.matchedSongLabel,
  ]);

  if (songLabel) {
    return songLabel;
  }

  return normalizeTimeContextLabel(
    firstNonEmptyString([showMetadata?.timeContextLabel, rawExif?.timeContextLabel])
  );
}
