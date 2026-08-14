import type { NormalizedShow, UnifiedProvider } from '../../types/provider';

type JsonObject = Record<string, unknown>;

type ProviderFetchInput = {
  artistName: string;
  showDate: string;
  phishNetApiKey?: string;
  setlistFmApiKey?: string;
};

type LegacyShow = {
  date: string;
  venueName: string;
  city: string;
  state: string;
  phishNetUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  setlistNotes: string | null;
  setlist: Array<{
    type: 'set' | 'encore' | 'song';
    label: string;
    notes?: string | null;
    durationSeconds?: number | null;
    set?: string;
    position?: number;
  }>;
  provider: UnifiedProvider;
  artistName: string;
};

const RELISTEN_ARTIST_SLUGS: Record<string, string> = {
  'grateful dead': 'grateful-dead',
  goose: 'goose',
  'dead and company': 'dead-and-company',
  'tedeschi trucks band': 'tedeschi-trucks-band',
  'widespread panic': 'widespread-panic',
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toArtistKey(artistName: string): string {
  return normalizeText(artistName).toLowerCase();
}

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  const raw = normalizeText(value);
  if (!raw) {
    return undefined;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const parts = raw.split(':').map((entry) => Number(entry));
  if (parts.some((entry) => Number.isNaN(entry))) {
    return undefined;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return undefined;
}

function normalizeSetName(rawSetName: unknown, fallbackIndex: number): string {
  const raw = normalizeText(rawSetName);
  if (!raw) {
    return `Set ${fallbackIndex + 1}`;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'e' || normalized.includes('encore')) {
    return 'Encore';
  }

  if (/^set\s*\d+$/i.test(raw)) {
    return raw.replace(/\s+/g, ' ').trim();
  }

  if (/^\d+$/.test(raw)) {
    return `Set ${raw}`;
  }

  return raw;
}

async function fetchJsonOrThrow<T>(url: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    next: {
      revalidate: 3600,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${url}`);
  }

  return response.json() as Promise<T>;
}

function pickPhishDataRows(payload: unknown): JsonObject[] {
  const asObject = payload && typeof payload === 'object' ? payload as JsonObject : null;
  if (!asObject) {
    return [];
  }

  const response = asObject.response;
  if (response && typeof response === 'object' && Array.isArray((response as JsonObject).data)) {
    return (response as JsonObject).data as JsonObject[];
  }
  if (Array.isArray(asObject.data)) {
    return asObject.data as JsonObject[];
  }
  if (Array.isArray(asObject.shows)) {
    return asObject.shows as JsonObject[];
  }

  return [];
}

function buildSetsFromPhishRows(rows: JsonObject[]): NormalizedShow['sets'] {
  const grouped = new Map<string, NormalizedShow['sets'][number]>();

  const sorted = [...rows].sort((left, right) => {
    const leftSet = normalizeText(left.set);
    const rightSet = normalizeText(right.set);
    if (leftSet !== rightSet) {
      return leftSet.localeCompare(rightSet, undefined, { numeric: true, sensitivity: 'base' });
    }
    const leftPosition = Number(left.position ?? Number.MAX_SAFE_INTEGER);
    const rightPosition = Number(right.position ?? Number.MAX_SAFE_INTEGER);
    return leftPosition - rightPosition;
  });

  sorted.forEach((row, index) => {
    const title = normalizeText(row.song);
    if (!title) {
      return;
    }

    const setName = normalizeSetName(row.set, index);
    const songsSet = grouped.get(setName) ?? { setName, songs: [] };
    songsSet.songs.push({
      title,
      position: songsSet.songs.length + 1,
      durationSeconds: parseDurationSeconds(row.tracktime),
    });
    grouped.set(setName, songsSet);
  });

  return [...grouped.values()];
}

function buildSetsFromStructuredData(rawSets: unknown): NormalizedShow['sets'] {
  const sets = asArray(rawSets);
  return sets
    .map((rawSet, setIndex) => {
      const setObject = rawSet && typeof rawSet === 'object' ? rawSet as JsonObject : {};
      const songs = asArray(setObject.songs ?? setObject.song)
        .map((rawSong, songIndex) => {
          const song = rawSong && typeof rawSong === 'object' ? rawSong as JsonObject : {};
          const title = normalizeText(song.title ?? song.name ?? song.song);
          if (!title) {
            return null;
          }
          return {
            title,
            position: songIndex + 1,
            durationSeconds: parseDurationSeconds(song.durationSeconds ?? song.duration ?? song.tracktime ?? song.length),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (songs.length === 0) {
        return null;
      }

      return {
        setName: normalizeSetName(setObject.setName ?? setObject.name ?? setObject.set, setIndex),
        songs,
      };
    })
    .filter((set): set is NonNullable<typeof set> => set !== null);
}

async function fetchFromPhishNet(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  if (!input.phishNetApiKey) {
    throw new Error('PHISHNET_API_KEY is required for Phish setlist ingestion.');
  }

  const base = 'https://api.phish.net/v5';
  const showUrl = `${base}/shows/showdate/${input.showDate}.json?apikey=${encodeURIComponent(input.phishNetApiKey)}`;
  const setlistUrl = `${base}/setlists/showdate/${input.showDate}.json?apikey=${encodeURIComponent(input.phishNetApiKey)}`;

  const [showPayload, setlistPayload] = await Promise.all([
    fetchJsonOrThrow<unknown>(showUrl),
    fetchJsonOrThrow<unknown>(setlistUrl),
  ]);

  if (!showPayload) {
    return null;
  }

  const showRows = pickPhishDataRows(showPayload);
  if (!showRows.length) {
    return null;
  }

  const showRecord = showRows.find((row) => normalizeText(row.artist_name).toLowerCase() === 'phish') ?? showRows[0];
  const showId = normalizeText(showRecord.showid ?? showRecord.id);
  const setlistRows = pickPhishDataRows(setlistPayload);
  const scopedSetlistRows = showId
    ? setlistRows.filter((row) => normalizeText(row.showid) === showId)
    : setlistRows;

  return {
    artistName: 'Phish',
    provider: 'phishnet',
    externalId: showId || input.showDate,
    showDate: normalizeText(showRecord.showdate) || input.showDate,
    venueName: normalizeText(showRecord.venue ?? showRecord.venue_name),
    city: normalizeText(showRecord.city ?? showRecord.city_name),
    state: normalizeText(showRecord.state ?? showRecord.state_name) || undefined,
    country: normalizeText(showRecord.country ?? showRecord.country_name) || 'US',
    tier: 'tier1_exact',
    sets: buildSetsFromPhishRows(scopedSetlistRows),
  };
}

async function fetchFromElGoose(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  const url = `https://elgoose.net/api/v1/shows/${input.showDate}`;
  const payload = await fetchJsonOrThrow<unknown>(url);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadObject = payload as JsonObject;
  const rows = Array.isArray(payloadObject.data) ? payloadObject.data as JsonObject[] : [];
  if (!rows.length) {
    return null;
  }

  const show = rows[0];
  return {
    artistName: normalizeText(show.artist_name) || 'Goose',
    provider: 'elgoose',
    externalId: normalizeText(show.showid ?? show.id ?? show.uuid) || input.showDate,
    showDate: normalizeText(show.showdate ?? show.date) || input.showDate,
    venueName: normalizeText(show.venue ?? show.venue_name),
    city: normalizeText(show.city ?? show.city_name),
    state: normalizeText(show.state ?? show.state_name) || undefined,
    country: normalizeText(show.country ?? show.country_name) || 'US',
    tier: 'tier1_exact',
    sets: buildSetsFromStructuredData(show.sets ?? show.setlist),
  };
}

async function fetchFromRelisten(input: ProviderFetchInput, artistSlug: string): Promise<NormalizedShow | null> {
  const base = normalizeText(process.env.RELISTEN_API_BASE_URL) || 'https://relisten.net/api/v1';
  const url = `${base}/shows/${encodeURIComponent(artistSlug)}/${input.showDate}`;
  const payload = await fetchJsonOrThrow<unknown>(url);
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const show = payload as JsonObject;
  return {
    artistName: normalizeText(show.artist ?? show.artistName ?? input.artistName) || input.artistName,
    provider: 'relisten',
    externalId: normalizeText(show.id ?? show.uuid ?? show.showid) || input.showDate,
    showDate: normalizeText(show.date ?? show.showDate) || input.showDate,
    venueName: normalizeText(show.venue ?? show.venueName),
    city: normalizeText(show.city),
    state: normalizeText(show.state) || undefined,
    country: normalizeText(show.country) || 'US',
    tier: 'tier1_exact',
    sets: buildSetsFromStructuredData(show.sets ?? show.tracks),
  };
}

function toSetlistFmDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

function fromSetlistFmDate(date: string, fallback: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) {
    return fallback;
  }
  const [day, month, year] = parts;
  if (!year || !month || !day) {
    return fallback;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function fetchFromSetlistFm(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  if (!input.setlistFmApiKey) {
    throw new Error('SETLISTFM_API_KEY is required for fallback setlist ingestion.');
  }

  const url = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(input.artistName)}&date=${encodeURIComponent(toSetlistFmDate(input.showDate))}&p=1`;
  const payload = await fetchJsonOrThrow<unknown>(url, {
    headers: {
      'x-api-key': input.setlistFmApiKey,
    },
  });

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const payloadObject = payload as JsonObject;
  const setlists = asArray(payloadObject.setlist) as JsonObject[];
  if (!setlists.length) {
    return null;
  }

  const match = setlists[0];
  const setsRoot = match.sets && typeof match.sets === 'object' ? match.sets as JsonObject : {};
  const sets = asArray(setsRoot.set)
    .map((rawSet, setIndex) => {
      const setObject = rawSet && typeof rawSet === 'object' ? rawSet as JsonObject : {};
      const songs = asArray(setObject.song)
        .map((rawSong, songIndex) => {
          const song = rawSong && typeof rawSong === 'object' ? rawSong as JsonObject : {};
          const title = normalizeText(song.name);
          if (!title) {
            return null;
          }
          return {
            title,
            position: songIndex + 1,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (!songs.length) {
        return null;
      }

      return {
        setName: normalizeSetName(setObject.name ?? setObject.encore, setIndex),
        songs,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const venue = match.venue && typeof match.venue === 'object' ? match.venue as JsonObject : {};
  const city = venue.city && typeof venue.city === 'object' ? venue.city as JsonObject : {};
  const country = city.country && typeof city.country === 'object' ? city.country as JsonObject : {};

  return {
    artistName: normalizeText(match.artist && typeof match.artist === 'object' ? (match.artist as JsonObject).name : input.artistName) || input.artistName,
    provider: 'setlistfm',
    externalId: normalizeText(match.id) || `${input.artistName}-${input.showDate}`,
    showDate: fromSetlistFmDate(normalizeText(match.eventDate), input.showDate),
    venueName: normalizeText(venue.name),
    city: normalizeText(city.name),
    state: normalizeText(city.state) || undefined,
    country: normalizeText(country.code ?? country.name) || 'US',
    tier: 'tier2_fallback',
    sets,
  };
}

export async function getNormalizedShowByArtistAndDate(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  if (!isValidDateString(input.showDate)) {
    throw new Error('showDate must be in YYYY-MM-DD format.');
  }

  const artistName = normalizeText(input.artistName);
  if (!artistName) {
    throw new Error('artistName is required for provider lookup.');
  }

  const artistKey = toArtistKey(artistName);
  if (artistKey === 'phish') {
    return fetchFromPhishNet(input);
  }
  if (artistKey === 'goose') {
    const goose = await fetchFromElGoose(input);
    if (goose) {
      return goose;
    }
    return fetchFromRelisten(input, 'goose');
  }

  const relistenSlug = RELISTEN_ARTIST_SLUGS[artistKey];
  if (relistenSlug) {
    const relisten = await fetchFromRelisten(input, relistenSlug);
    if (relisten) {
      return relisten;
    }
  }

  return fetchFromSetlistFm(input);
}

export function normalizeProviderShowToLegacyShow(normalizedShow: NormalizedShow): LegacyShow {
  const setlist: LegacyShow['setlist'] = [];
  normalizedShow.sets.forEach((set) => {
    const normalizedSetLabel = normalizeSetName(set.setName, setlist.length);
    setlist.push({
      type: normalizedSetLabel === 'Encore' ? 'encore' : 'set',
      label: normalizedSetLabel,
    });
    set.songs.forEach((song) => {
      setlist.push({
        type: 'song',
        label: song.title,
        notes: null,
        durationSeconds: song.durationSeconds ?? null,
        set: normalizedSetLabel,
        position: song.position,
      });
    });
  });

  return {
    date: normalizedShow.showDate,
    venueName: normalizedShow.venueName,
    city: normalizedShow.city,
    state: normalizedShow.state ?? '',
    phishNetUrl: normalizedShow.provider === 'phishnet'
      ? `https://phish.net/setlists/?d=${encodeURIComponent(normalizedShow.showDate)}`
      : null,
    latitude: null,
    longitude: null,
    setlistNotes: null,
    setlist,
    provider: normalizedShow.provider,
    artistName: normalizedShow.artistName,
  };
}
