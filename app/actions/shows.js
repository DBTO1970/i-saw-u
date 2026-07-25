'use server';

const NO_SHOW_RESULT = {
  show: null,
  error: 'No show found for the requested date.',
  nearbyShows: [],
  relatedDateShows: [],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EARLIEST_PHISH_SHOW_YEAR = 1983;
const MAX_HISTORICAL_LOOKUPS = 40;
const MAX_HISTORICAL_RESULTS = 12;
const PHISH_SHOW_INDEX_LIMIT = 5000;
const PHISH_SHOW_INDEX_TTL_MS = 10 * 60 * 1000;
const MAX_LOCATION_MATCHES = 20;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 12;

let phishShowsCache = null;
let phishShowsCacheUpdatedAt = 0;

function isValidDateString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeSearchToken(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDateParts(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseDateStringAsUtc(value) {
  const parts = parseDateParts(value);
  if (!parts) {
    return null;
  }

  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    utcDate.getUTCFullYear() !== parts.year
    || utcDate.getUTCMonth() + 1 !== parts.month
    || utcDate.getUTCDate() !== parts.day
  ) {
    return null;
  }

  return utcDate;
}

function addUtcDays(dateString, days) {
  const parsed = parseDateStringAsUtc(dateString);
  if (!parsed) {
    return null;
  }

  const next = new Date(parsed.getTime() + days * MS_PER_DAY);
  return formatUtcDate(next);
}

function differenceInUtcDays(fromDate, toDate) {
  const from = parseDateStringAsUtc(fromDate);
  const to = parseDateStringAsUtc(toDate);
  if (!from || !to) {
    return null;
  }

  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

function scoreFieldMatch(criteriaValue, candidateValue, weights) {
  if (!criteriaValue || !candidateValue) {
    return { score: 0, matched: false };
  }

  if (criteriaValue === candidateValue) {
    return { score: weights.exact, matched: true };
  }

  if (candidateValue.includes(criteriaValue) || criteriaValue.includes(candidateValue)) {
    return { score: weights.contains, matched: true };
  }

  const criteriaTokens = criteriaValue.split(' ').filter(Boolean);
  if (criteriaTokens.length === 0) {
    return { score: 0, matched: false };
  }

  const matchedTokens = criteriaTokens.filter((token) => candidateValue.includes(token)).length;
  if (matchedTokens === 0) {
    return { score: 0, matched: false };
  }

  return {
    score: Math.round(weights.partial * (matchedTokens / criteriaTokens.length)),
    matched: true,
  };
}

function scoreDateProximity(photoDate, showDate) {
  const dayDifference = differenceInUtcDays(photoDate, showDate);
  if (dayDifference === null) {
    return { score: 0, dayDifference: null };
  }

  const absDays = Math.abs(dayDifference);
  if (absDays === 0) return { score: 30, dayDifference };
  if (absDays <= 1) return { score: 20, dayDifference };
  if (absDays <= 7) return { score: 10, dayDifference };
  if (absDays <= 30) return { score: 5, dayDifference };
  return { score: 0, dayDifference };
}

function extractCoordinate(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  return null;
}

function buildPhishNetShowUrl(showRecord, fallbackDate) {
  const directUrl = normalizeText(
    showRecord?.url
    || showRecord?.showurl
    || showRecord?.setlist_url
    || showRecord?.setlistUrl
    || showRecord?.permalink,
  );

  if (directUrl) {
    if (directUrl.startsWith('http://') || directUrl.startsWith('https://')) {
      return directUrl;
    }
    if (directUrl.startsWith('/')) {
      return `https://phish.net${directUrl}`;
    }
  }

  const dateForLookup = normalizeText(showRecord?.showdate || fallbackDate);
  if (!dateForLookup) {
    return null;
  }

  return `https://phish.net/setlists/?d=${encodeURIComponent(dateForLookup)}`;
}

function getDataRows(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  if (Array.isArray(payload?.response?.data)) {
    return payload.response.data;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.shows)) {
    return payload.shows;
  }

  return [];
}

function selectShowRecord(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const phishRecord = rows.find((row) => normalizeText(row?.artist_name).toLowerCase() === 'phish');
  if (phishRecord) {
    return phishRecord;
  }

  return rows[0] ?? null;
}

function parseSetPosition(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function normalizeSetLabel(rawSet) {
  const setValue = normalizeText(rawSet);
  if (!setValue) {
    return null;
  }

  const upper = setValue.toUpperCase();
  if (upper === 'E' || upper.startsWith('E')) {
    return 'Encore';
  }

  return `Set ${setValue}`;
}

function parseTracktimeSeconds(tracktime) {
  const raw = normalizeText(tracktime);
  if (!raw) {
    return null;
  }

  const parts = raw.split(':').map((entry) => Number(entry));
  if (parts.some((entry) => Number.isNaN(entry))) {
    return null;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function buildSetlistEntries(setlistRows, showId) {
  if (!Array.isArray(setlistRows) || setlistRows.length === 0) {
    return [];
  }

  const phishRows = setlistRows.filter((row) => normalizeText(row?.artist_name).toLowerCase() === 'phish');
  const scopedRows = phishRows.filter((row) => Number(row?.showid) === Number(showId));
  const rows = scopedRows.length > 0 ? scopedRows : phishRows;

  const sortedRows = [...rows].sort((left, right) => {
    const leftSet = normalizeText(left?.set);
    const rightSet = normalizeText(right?.set);

    if (leftSet !== rightSet) {
      return leftSet.localeCompare(rightSet, undefined, { numeric: true, sensitivity: 'base' });
    }

    return parseSetPosition(left?.position) - parseSetPosition(right?.position);
  });

  const entries = [];
  let activeSetLabel = null;

  sortedRows.forEach((row) => {
    const song = normalizeText(row?.song);
    if (!song) {
      return;
    }

    const setLabel = normalizeSetLabel(row?.set) || 'Setlist';
    if (setLabel !== activeSetLabel) {
      entries.push({
        type: setLabel === 'Encore' ? 'encore' : 'set',
        label: setLabel,
      });
      activeSetLabel = setLabel;
    }

    const notesParts = [
      normalizeText(row?.transition),
      normalizeText(row?.footnote),
      normalizeText(row?.jamchart_description),
    ].filter(Boolean);

    entries.push({
      type: 'song',
      label: song,
      notes: notesParts.join(' ').trim() || null,
      durationSeconds: parseTracktimeSeconds(row?.tracktime),
      set: normalizeText(row?.set),
      position: parseSetPosition(row?.position),
    });
  });

  return entries;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    next: {
      revalidate: 0,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

function buildShowFromRecord(showRecord, fallbackDate, parsedSetlist = [], coordinates = {}) {
  const rawLatitude = extractCoordinate(showRecord.latitude || showRecord.lat || showRecord.venue_latitude || showRecord.venueLatitude || showRecord.venue_lat);
  const rawLongitude = extractCoordinate(showRecord.longitude || showRecord.lon || showRecord.venue_longitude || showRecord.venueLongitude || showRecord.venue_lon);

  return {
    date: normalizeText(showRecord.showdate || fallbackDate),
    venueName: normalizeText(showRecord.venue || showRecord.venue_name || showRecord.venueName),
    city: normalizeText(showRecord.city || showRecord.cityName || showRecord.city_name),
    state: normalizeText(showRecord.state || showRecord.stateName || showRecord.state_name),
    phishNetUrl: buildPhishNetShowUrl(showRecord, fallbackDate),
    latitude: rawLatitude ?? coordinates.latitude ?? null,
    longitude: rawLongitude ?? coordinates.longitude ?? null,
    setlistNotes: normalizeText(showRecord.setlist_notes || showRecord.setlistnotes),
    setlist: Array.isArray(parsedSetlist) ? parsedSetlist : [],
  };
}

async function fetchShowRecordByDate(dateString, apiKey) {
  const showsUrl = `https://api.phish.net/v5/shows/showdate/${dateString}.json?apikey=${apiKey}`;
  const showsPayload = await fetchJson(showsUrl);
  const showRows = getDataRows(showsPayload);
  return selectShowRecord(showRows);
}

async function fetchPrimaryShow(dateString, apiKey) {
  const setlistsUrl = `https://api.phish.net/v5/setlists/showdate/${dateString}.json?apikey=${apiKey}`;
  const [showRecord, setlistsPayload] = await Promise.all([
    fetchShowRecordByDate(dateString, apiKey),
    fetchJson(setlistsUrl),
  ]);

  if (!showRecord) {
    return null;
  }

  const setlistRows = getDataRows(setlistsPayload);
  const parsedSetlist = buildSetlistEntries(setlistRows, showRecord.showid);
  const rawLatitude = extractCoordinate(showRecord.latitude || showRecord.lat || showRecord.venue_latitude || showRecord.venueLatitude || showRecord.venue_lat);
  const rawLongitude = extractCoordinate(showRecord.longitude || showRecord.lon || showRecord.venue_longitude || showRecord.venueLongitude || showRecord.venue_lon);
  const geocodedVenue = rawLatitude === null || rawLongitude === null ? await geocodeVenue(showRecord) : { latitude: rawLatitude, longitude: rawLongitude };

  return buildShowFromRecord(showRecord, dateString, parsedSetlist, geocodedVenue);
}

async function fetchShowSummaryByDate(dateString, apiKey) {
  const showRecord = await fetchShowRecordByDate(dateString, apiKey);
  if (!showRecord) {
    return null;
  }
  return buildShowFromRecord(showRecord, dateString);
}

function buildNearbyRelationLabel(dayOffset) {
  if (dayOffset === 0) {
    return 'Same date';
  }

  const distance = Math.abs(dayOffset);
  const unit = distance === 1 ? 'day' : 'days';
  return dayOffset < 0 ? `${distance} ${unit} before photo date` : `${distance} ${unit} after photo date`;
}

async function findNearbyShows(dateString, apiKey) {
  const offsets = [];
  for (let offset = -6; offset <= 6; offset += 1) {
    if (offset !== 0) {
      offsets.push(offset);
    }
  }

  const nearbyCandidates = await mapWithConcurrency(offsets, 4, async (offset) => {
    const candidateDate = addUtcDays(dateString, offset);
    if (!candidateDate) {
      return null;
    }

    const show = await fetchShowSummaryByDate(candidateDate, apiKey);
    if (!show) {
      return null;
    }

    return {
      ...show,
      dayOffset: offset,
      relationLabel: buildNearbyRelationLabel(offset),
    };
  });

  return nearbyCandidates
    .filter(Boolean)
    .sort((left, right) => Math.abs(left.dayOffset) - Math.abs(right.dayOffset))
    .slice(0, 8);
}

function createHistoricalCandidates(dateString) {
  const parts = parseDateParts(dateString);
  if (!parts) {
    return [];
  }

  const currentYear = new Date().getUTCFullYear();
  const candidatesByDate = new Map();
  const yearOrder = [];

  for (let yearDelta = 1; parts.year - yearDelta >= EARLIEST_PHISH_SHOW_YEAR || parts.year + yearDelta <= currentYear; yearDelta += 1) {
    const before = parts.year - yearDelta;
    const after = parts.year + yearDelta;
    if (after <= currentYear) {
      yearOrder.push(after);
    }
    if (before >= EARLIEST_PHISH_SHOW_YEAR) {
      yearOrder.push(before);
    }
  }

  for (const year of yearOrder) {
    for (const dayOffset of [-1, 0, 1]) {
      const baseDate = new Date(Date.UTC(year, parts.month - 1, parts.day));
      if (
        baseDate.getUTCFullYear() !== year
        || baseDate.getUTCMonth() + 1 !== parts.month
        || baseDate.getUTCDate() !== parts.day
      ) {
        continue;
      }

      const shifted = new Date(baseDate.getTime() + dayOffset * MS_PER_DAY);
      const candidateDate = formatUtcDate(shifted);
      const existing = candidatesByDate.get(candidateDate);
      const nextCandidate = {
        date: candidateDate,
        dayOffset,
        yearOffset: Math.abs(year - parts.year),
      };

      if (!existing || Math.abs(dayOffset) < Math.abs(existing.dayOffset)) {
        candidatesByDate.set(candidateDate, nextCandidate);
      }
    }

    if (candidatesByDate.size >= MAX_HISTORICAL_LOOKUPS) {
      break;
    }
  }

  return [...candidatesByDate.values()];
}

function buildHistoricalRelationLabel(dayOffset) {
  if (dayOffset === 0) {
    return 'Same month/day in another year';
  }

  return dayOffset < 0
    ? '1 day before this month/day in another year'
    : '1 day after this month/day in another year';
}

async function findHistoricalRelatedShows(dateString, apiKey) {
  const candidates = createHistoricalCandidates(dateString);
  if (candidates.length === 0) {
    return [];
  }

  const results = [];

  for (const candidate of candidates) {
    const show = await fetchShowSummaryByDate(candidate.date, apiKey);
    if (!show) {
      continue;
    }

    const dateGapDays = differenceInUtcDays(dateString, show.date);
    results.push({
      ...show,
      relationLabel: buildHistoricalRelationLabel(candidate.dayOffset),
      dayOffsetFromMonthDay: candidate.dayOffset,
      dateGapDays,
      yearOffset: candidate.yearOffset,
    });

    if (results.length >= MAX_HISTORICAL_RESULTS) {
      break;
    }
  }

  return results.sort((left, right) => {
    if (Math.abs(left.dayOffsetFromMonthDay) !== Math.abs(right.dayOffsetFromMonthDay)) {
      return Math.abs(left.dayOffsetFromMonthDay) - Math.abs(right.dayOffsetFromMonthDay);
    }
    if (left.yearOffset !== right.yearOffset) {
      return left.yearOffset - right.yearOffset;
    }
    return right.date.localeCompare(left.date);
  });
}

async function fetchAllPhishShows(apiKey) {
  const now = Date.now();
  if (phishShowsCache && now - phishShowsCacheUpdatedAt < PHISH_SHOW_INDEX_TTL_MS) {
    return phishShowsCache;
  }

  const showsUrl = `https://api.phish.net/v5/shows/artist/phish.json?apikey=${apiKey}&limit=${PHISH_SHOW_INDEX_LIMIT}`;
  const payload = await fetchJson(showsUrl);
  const rows = getDataRows(payload);

  phishShowsCache = Array.isArray(rows) ? rows : [];
  phishShowsCacheUpdatedAt = now;
  return phishShowsCache;
}

async function geocodeVenue(showRecord) {
  const venue = normalizeText(showRecord?.venue || showRecord?.venue_name || showRecord?.venueName);
  const city = normalizeText(showRecord?.city || showRecord?.city_name || showRecord?.cityName);
  const state = normalizeText(showRecord?.state || showRecord?.state_name || showRecord?.stateName);

  if (!venue && !city && !state) {
    return { latitude: null, longitude: null };
  }

  const query = encodeURIComponent([venue, city, state].filter(Boolean).join(', '));
  const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${query}&format=jsonv2&limit=1`;

  try {
    const response = await fetch(geocodeUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'i-saw-u/1.0',
      },
      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) {
      return { latitude: null, longitude: null };
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      return { latitude: null, longitude: null };
    }

    const top = payload[0];
    return {
      latitude: extractCoordinate(top?.lat),
      longitude: extractCoordinate(top?.lon),
    };
  } catch {
    return { latitude: null, longitude: null };
  }
}

function buildLocationMatch(showRecord, criteria) {
  const venue = normalizeSearchToken(showRecord?.venue || showRecord?.venue_name || showRecord?.venueName);
  const city = normalizeSearchToken(showRecord?.city || showRecord?.city_name || showRecord?.cityName);
  const state = normalizeSearchToken(showRecord?.state || showRecord?.state_name || showRecord?.stateName);

  const venueCriteria = normalizeSearchToken(criteria.venue);
  const cityCriteria = normalizeSearchToken(criteria.city);
  const stateCriteria = normalizeSearchToken(criteria.state);

  const venueMatch = scoreFieldMatch(venueCriteria, venue, { exact: 120, contains: 80, partial: 45 });
  const cityMatch = scoreFieldMatch(cityCriteria, city, { exact: 85, contains: 55, partial: 30 });
  const stateMatch = scoreFieldMatch(stateCriteria, state, { exact: 70, contains: 40, partial: 20 });
  const photoDate = isValidDateString(criteria.photoDate) ? criteria.photoDate : null;
  const dateProximity = photoDate ? scoreDateProximity(photoDate, normalizeText(showRecord?.showdate)) : { score: 0, dayDifference: null };
  const score = venueMatch.score + cityMatch.score + stateMatch.score + dateProximity.score;

  const matchedFieldCount = [venueMatch, cityMatch, stateMatch].filter((entry) => entry.matched).length;
  if (matchedFieldCount === 0 || score <= 0) {
    return null;
  }

  return {
    score,
    dayDifference: dateProximity.dayDifference,
  };
}

function buildAutocompleteVenueItem(row) {
  return {
    venueName: normalizeText(row?.venue || row?.venue_name || row?.venueName),
    city: normalizeText(row?.city || row?.city_name || row?.cityName),
    state: normalizeText(row?.state || row?.state_name || row?.stateName),
    showDate: normalizeText(row?.showdate),
  };
}

function scoreAutocompleteCandidate(query, candidateToken) {
  if (!query) {
    return 1;
  }

  if (candidateToken === query) {
    return 300;
  }
  if (candidateToken.startsWith(query)) {
    return 200;
  }
  if (candidateToken.includes(query)) {
    return 120;
  }

  const queryTokens = query.split(' ').filter(Boolean);
  if (!queryTokens.length) {
    return 0;
  }

  const matched = queryTokens.filter((token) => candidateToken.includes(token)).length;
  if (!matched) {
    return 0;
  }

  return 60 + matched * 10;
}

function normalizeSongTitleForMatch(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreSongTitleMatch(expectedSongTitle, candidateSongTitle) {
  const expected = normalizeSongTitleForMatch(expectedSongTitle);
  const candidate = normalizeSongTitleForMatch(candidateSongTitle);
  if (!expected || !candidate) {
    return 0;
  }

  if (expected === candidate) {
    return 300;
  }
  if (candidate.startsWith(expected) || expected.startsWith(candidate)) {
    return 220;
  }
  if (candidate.includes(expected) || expected.includes(candidate)) {
    return 160;
  }

  const expectedTokens = expected.split(' ').filter(Boolean);
  if (!expectedTokens.length) {
    return 0;
  }

  const matchedTokenCount = expectedTokens.filter((token) => candidate.includes(token)).length;
  if (!matchedTokenCount) {
    return 0;
  }

  return 80 + matchedTokenCount * 20;
}

function selectBestTrackForSong(tracks, songTitle) {
  if (!Array.isArray(tracks) || !songTitle) {
    return null;
  }

  let bestTrack = null;
  let bestScore = 0;

  tracks.forEach((track) => {
    const score = scoreSongTitleMatch(songTitle, track?.title);
    if (score > bestScore) {
      bestScore = score;
      bestTrack = track;
    }
  });

  return bestScore > 0 ? bestTrack : null;
}

async function fetchPhishInShowByDate(dateString) {
  const url = `https://phish.in/api/v2/shows/${dateString}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    next: {
      revalidate: 3600,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Phish.in show lookup failed with status ${response.status}`);
  }

  return response.json();
}

export async function getPhishInShowLinks({ dateString, songTitle } = {}) {
  if (!isValidDateString(dateString)) {
    return {
      showUrl: null,
      songUrl: null,
      songTitle: null,
      audioStatus: null,
      error: 'Please provide a valid show date for Phish.in lookup.',
    };
  }

  try {
    const show = await fetchPhishInShowByDate(dateString);
    if (!show) {
      return {
        showUrl: null,
        songUrl: null,
        songTitle: null,
        audioStatus: null,
        error: null,
      };
    }

    const bestTrack = selectBestTrackForSong(show.tracks, songTitle);
    const songSlug = normalizeText(bestTrack?.slug);

    return {
      showUrl: `https://phish.in/${dateString}`,
      songUrl: songSlug ? `https://phish.in/${dateString}/${encodeURIComponent(songSlug)}` : null,
      songTitle: normalizeText(bestTrack?.title) || null,
      audioStatus: normalizeText(show.audio_status) || null,
      error: null,
    };
  } catch (error) {
    console.error('Failed to fetch Phish.in show links:', error);
    return {
      showUrl: null,
      songUrl: null,
      songTitle: null,
      audioStatus: null,
      error: 'Unable to load Phish.in links right now.',
    };
  }
}

export async function searchShowsByLocation(criteria) {
  const venue = normalizeText(criteria?.venue);
  const city = normalizeText(criteria?.city);
  const state = normalizeText(criteria?.state);
  const photoDate = normalizeText(criteria?.photoDate);

  if (!venue && !city && !state) {
    return {
      matches: [],
      error: 'Enter at least one of venue, city, or state to search.',
    };
  }

  const apiKey = process.env.PHISHNET_API_KEY;
  if (!apiKey) {
    return {
      matches: [],
      error: 'The PHISHNET_API_KEY environment variable is not configured.',
    };
  }

  try {
    const showRows = await fetchAllPhishShows(apiKey);
    const scored = showRows
      .map((row) => {
        const locationMatch = buildLocationMatch(row, { venue, city, state, photoDate });
        if (!locationMatch) {
          return null;
        }

        return {
          ...buildShowFromRecord(row, normalizeText(row?.showdate)),
          matchScore: locationMatch.score,
          dayDifference: locationMatch.dayDifference,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.matchScore !== left.matchScore) {
          return right.matchScore - left.matchScore;
        }

        const leftGap = typeof left.dayDifference === 'number' ? Math.abs(left.dayDifference) : Number.MAX_SAFE_INTEGER;
        const rightGap = typeof right.dayDifference === 'number' ? Math.abs(right.dayDifference) : Number.MAX_SAFE_INTEGER;
        if (leftGap !== rightGap) {
          return leftGap - rightGap;
        }

        return right.date.localeCompare(left.date);
      })
      .slice(0, MAX_LOCATION_MATCHES);

    return {
      matches: scored,
      error: scored.length === 0 ? 'No venue/location matches found for those fields.' : null,
    };
  } catch (error) {
    console.error('Failed to search Phish shows by location:', error);
    return {
      matches: [],
      error: 'Unable to search shows by venue/city/state right now.',
    };
  }
}

export async function searchLocationAutocomplete(criteria) {
  const venueQuery = normalizeSearchToken(criteria?.venueQuery);
  const cityQuery = normalizeSearchToken(criteria?.cityQuery);
  const stateQuery = normalizeSearchToken(criteria?.stateQuery);
  const selectedVenue = normalizeSearchToken(criteria?.selectedVenue);

  const apiKey = process.env.PHISHNET_API_KEY;
  if (!apiKey) {
    return {
      venues: [],
      cities: [],
      states: [],
      error: 'The PHISHNET_API_KEY environment variable is not configured.',
    };
  }

  try {
    const rows = await fetchAllPhishShows(apiKey);
    const venuesByKey = new Map();
    const citiesByKey = new Map();
    const statesByKey = new Map();

    rows.forEach((row) => {
      const venueItem = buildAutocompleteVenueItem(row);
      const venueToken = normalizeSearchToken(venueItem.venueName);
      const cityToken = normalizeSearchToken(venueItem.city);
      const stateToken = normalizeSearchToken(venueItem.state);

      if (!venueItem.venueName || !venueItem.city || !venueItem.state) {
        return;
      }

      const venueScore = scoreAutocompleteCandidate(venueQuery, venueToken)
        + scoreAutocompleteCandidate(cityQuery, cityToken)
        + scoreAutocompleteCandidate(stateQuery, stateToken);
      if (venueScore > 0) {
        const key = `${venueItem.venueName}|${venueItem.city}|${venueItem.state}`;
        const existing = venuesByKey.get(key);
        if (!existing) {
          venuesByKey.set(key, { ...venueItem, score: venueScore, count: 1 });
        } else {
          existing.count += 1;
          existing.score = Math.max(existing.score, venueScore);
          if (venueItem.showDate > existing.showDate) {
            existing.showDate = venueItem.showDate;
          }
        }
      }

      const venueFilterPass = !selectedVenue || venueToken === selectedVenue;
      if (venueFilterPass) {
        const cityScore = scoreAutocompleteCandidate(cityQuery, cityToken) + scoreAutocompleteCandidate(stateQuery, stateToken);
        if (cityScore > 0) {
          const key = `${venueItem.city}|${venueItem.state}`;
          const existing = citiesByKey.get(key);
          if (!existing) {
            citiesByKey.set(key, { city: venueItem.city, state: venueItem.state, score: cityScore, count: 1 });
          } else {
            existing.count += 1;
            existing.score = Math.max(existing.score, cityScore);
          }
        }

        const stateScore = scoreAutocompleteCandidate(stateQuery, stateToken) + scoreAutocompleteCandidate(cityQuery, cityToken);
        if (stateScore > 0) {
          const key = venueItem.state;
          const existing = statesByKey.get(key);
          if (!existing) {
            statesByKey.set(key, { state: venueItem.state, score: stateScore, count: 1 });
          } else {
            existing.count += 1;
            existing.score = Math.max(existing.score, stateScore);
          }
        }
      }
    });

    const venues = [...venuesByKey.values()]
      .sort((left, right) => right.score - left.score || right.count - left.count || right.showDate.localeCompare(left.showDate))
      .slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS)
      .map(({ venueName, city, state, count }) => ({ venueName, city, state, count }));

    const cities = [...citiesByKey.values()]
      .sort((left, right) => right.score - left.score || right.count - left.count || left.city.localeCompare(right.city))
      .slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS)
      .map(({ city, state, count }) => ({ city, state, count }));

    const states = [...statesByKey.values()]
      .sort((left, right) => right.score - left.score || right.count - left.count || left.state.localeCompare(right.state))
      .slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS)
      .map(({ state, count }) => ({ state, count }));

    return {
      venues,
      cities,
      states,
      error: null,
    };
  } catch (error) {
    console.error('Failed to build location autocomplete:', error);
    return {
      venues: [],
      cities: [],
      states: [],
      error: 'Unable to load autocomplete suggestions right now.',
    };
  }
}

export async function getShowByDate(dateString) {
  if (!isValidDateString(dateString)) {
    return {
      ...NO_SHOW_RESULT,
      error: 'Please provide a valid date in YYYY-MM-DD format.',
    };
  }

  const apiKey = process.env.PHISHNET_API_KEY;
  if (!apiKey) {
    return {
      ...NO_SHOW_RESULT,
      error: 'The PHISHNET_API_KEY environment variable is not configured.',
    };
  }

  try {
    const primaryShow = await fetchPrimaryShow(dateString, apiKey);
    if (primaryShow) {
      return {
        show: primaryShow,
        error: null,
        nearbyShows: [],
        relatedDateShows: [],
      };
    }

    const [nearbyShows, relatedDateShows] = await Promise.all([
      findNearbyShows(dateString, apiKey),
      findHistoricalRelatedShows(dateString, apiKey),
    ]);

    return {
      ...NO_SHOW_RESULT,
      error: 'No show found for the requested date. Here are nearby and historical alternatives.',
      nearbyShows,
      relatedDateShows,
    };
  } catch (error) {
    console.error('Failed to fetch Phish show data:', error);
    return {
      ...NO_SHOW_RESULT,
      error: 'Unable to fetch show data at the moment.',
    };
  }
}
