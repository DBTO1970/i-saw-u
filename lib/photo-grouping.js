import { deriveCurrentSongLabelFromShowMetadata, normalizeTimeContextLabel } from './photo-show-context';

export function formatDate(value) {
  if (!value) return '';
  const [y, m, day] = String(value).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!y || !m || !day) return String(value);
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
}

export function parseRawExif(rawExif) {
  if (!rawExif) return {};
  if (typeof rawExif === 'string') {
    try {
      const parsed = JSON.parse(rawExif);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof rawExif === 'object' && !Array.isArray(rawExif)) {
    return rawExif;
  }
  return {};
}

export function getSavedShowMetadata(photo) {
  const rawExif = parseRawExif(photo?.raw_exif);
  const showMetadata = rawExif?.showMetadata;
  if (!showMetadata || typeof showMetadata !== 'object' || Array.isArray(showMetadata)) {
    return null;
  }
  return showMetadata;
}

export function deriveYearFromPhoto(photo, showDate) {
  const showYear = typeof showDate === 'string' ? showDate.slice(0, 4) : '';
  if (/^\d{4}$/.test(showYear)) return showYear;

  const candidates = [photo?.date_taken, photo?.liked_at, photo?.created_at];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const match = value.match(/^(\d{4})[-/]/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return String(parsed.getFullYear());
  }

  return 'Unknown Year';
}

export function groupPhotosByYearAndShow(photos) {
  const years = new Map();

  (photos || []).forEach((photo) => {
    const rawExif = parseRawExif(photo?.raw_exif);
    const showMetadata = getSavedShowMetadata(photo);
    const showDate = showMetadata?.matchedShowDate || photo?.matched_show_date || null;
    const year = deriveYearFromPhoto(photo, showDate);

    if (!years.has(year)) {
      years.set(year, new Map());
    }

    const yearGroups = years.get(year);
    const groupKey = showDate ? `show:${showDate}` : 'between-shows';
    if (!yearGroups.has(groupKey)) {
      const venueName = showMetadata?.venueName || showMetadata?.showData?.venueName || null;
      const city = showMetadata?.city || showMetadata?.showData?.city || null;
      const state = showMetadata?.state || showMetadata?.showData?.state || null;
      yearGroups.set(groupKey, {
        key: groupKey,
        showDate,
        label: showDate ? formatDate(showDate) : 'In Between Shows',
        venueName,
        location: [city, state].filter(Boolean).join(', ') || null,
        photos: [],
      });
    }

    const group = yearGroups.get(groupKey);
    const currentSong = deriveCurrentSongLabelFromShowMetadata(showMetadata, rawExif) || null;
    const timeContextLabel = normalizeTimeContextLabel(showMetadata?.timeContextLabel || rawExif?.timeContextLabel || '');
    group.photos.push({
      ...photo,
      rawExif,
      showMetadata,
      currentSong,
      timeContextLabel,
    });
  });

  return Array.from(years.entries())
    .map(([year, groupMap]) => {
      const groups = Array.from(groupMap.values())
        .sort((left, right) => {
          if (!left.showDate && right.showDate) return 1;
          if (left.showDate && !right.showDate) return -1;
          return String(right.showDate || '').localeCompare(String(left.showDate || ''));
        })
        .map((group) => ({
          ...group,
          photos: group.photos.sort((left, right) => String(right.created_at || right.liked_at || '').localeCompare(String(left.created_at || left.liked_at || ''))),
        }));
      return { year, groups };
    })
    .sort((left, right) => {
      if (left.year === 'Unknown Year') return 1;
      if (right.year === 'Unknown Year') return -1;
      return Number(right.year) - Number(left.year);
    });
}
