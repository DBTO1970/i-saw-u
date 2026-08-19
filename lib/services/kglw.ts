import type { NormalizedShow } from '../../types/provider';

type JsonObject = Record<string, unknown>;

export const KGLW_CANONICAL_ARTIST_NAME = 'King Gizzard & the Lizard Wizard';

const KGLW_API_BASE_URL = 'https://kglw.net/api/v2';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function parseTransitionNote(song: JsonObject): string | undefined {
  const rawTransition = song.transition ?? song.transition_note ?? song.transition_notes ?? song.segue_note ?? song.segue_text;

  if (typeof rawTransition === 'string') {
    const trimmed = rawTransition.trim();
    // ", " and ">" are segue marker punctuation (same convention as Phish.net's trans_mark).
    // Convert them to a human-readable label rather than passing through raw punctuation.
    if (trimmed === ',' || trimmed === '>' || trimmed === '->' || trimmed === '>>' || trimmed === ', ') {
      return 'Segue into next song';
    }
    if (trimmed) {
      return trimmed;
    }
  }

  if (typeof rawTransition === 'boolean' || typeof rawTransition === 'number') {
    return rawTransition === true || rawTransition === 1 ? 'Segue into next song' : undefined;
  }

  const segue = song.segue;
  if (typeof segue === 'string') {
    const trimmed = segue.trim();
    if (trimmed === ',' || trimmed === '>' || trimmed === '->' || trimmed === '>>' || trimmed === ', ') {
      return 'Segue into next song';
    }
    if (trimmed) {
      return trimmed;
    }
  }

  const booleanTransitionValues = [
    song.is_segue,
    song.is_transition,
    song.segued,
    typeof segue === 'boolean' || typeof segue === 'number' ? segue : null,
  ];
  const hasSegueFlag = booleanTransitionValues.some((value) => value === true || value === 1 || value === '1');
  return hasSegueFlag ? 'Segue into next song' : undefined;
}

function buildSongNotes(song: JsonObject): string | undefined {
  const parts = [
    normalizeText(song.notes ?? song.note ?? song.footnote ?? song.annotation),
    parseTransitionNote(song),
  ].filter(Boolean);

  if (!parts.length) {
    return undefined;
  }

  return [...new Set(parts)].join(' • ');
}

// Build sets from the flat per-song rows returned by the KGLW setlists endpoint.
// Each row carries setnumber + settype to identify which set the song belongs to,
// and songname for the title — distinct from the nested structure used by other providers.
function buildKglwSetsFromRows(rows: JsonObject[]): NormalizedShow['sets'] {
  const grouped = new Map<string, NormalizedShow['sets'][number]>();

  const sorted = [...rows].sort((a, b) => {
    const aSet = Number(a.setnumber ?? Number.MAX_SAFE_INTEGER);
    const bSet = Number(b.setnumber ?? Number.MAX_SAFE_INTEGER);
    if (aSet !== bSet) {
      return aSet - bSet;
    }
    return Number(a.position ?? Number.MAX_SAFE_INTEGER) - Number(b.position ?? Number.MAX_SAFE_INTEGER);
  });

  sorted.forEach((row, index) => {
    const title = normalizeText(row.songname ?? row.song_name ?? row.song ?? row.title ?? row.name);
    if (!title) {
      return;
    }

    const setName = normalizeSetName(
      row.settype && row.setnumber ? `${row.settype} ${row.setnumber}` : (row.settype ?? row.setnumber),
      grouped.size,
    );
    const setEntry = grouped.get(setName) ?? { setName, songs: [] };

    setEntry.songs.push({
      title,
      position: setEntry.songs.length + 1,
      durationSeconds: parseDurationSeconds(row.tracktime ?? row.duration_seconds ?? row.duration ?? row.length),
      notes: buildSongNotes(row),
    });
    grouped.set(setName, setEntry);
  });

  return [...grouped.values()];
}

function pickShowRows(payload: unknown): JsonObject[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const payloadObject = payload as JsonObject;
  const errorCode = Number(payloadObject.error ?? 0);
  if (Number.isFinite(errorCode) && errorCode !== 0) {
    return [];
  }

  return Array.isArray(payloadObject.data) ? payloadObject.data as JsonObject[] : [];
}

export function normalizeKglwShowPayload(payload: unknown, showDate: string): NormalizedShow | null {
  const rows = pickShowRows(payload);
  if (!rows.length) {
    return null;
  }

  // The KGLW setlists endpoint returns flat per-song rows. Each row carries
  // show-level metadata (venue, city, show_id, etc.) in addition to song data.
  // Use the first row as the source of show-level fields.
  const firstRow = rows[0];
  const rawShowId = firstRow.show_id ?? firstRow.id ?? firstRow.uuid;
  const externalId = rawShowId != null ? String(rawShowId).trim() : showDate;

  return {
    artistName: KGLW_CANONICAL_ARTIST_NAME,
    provider: 'kglw',
    externalId: externalId || showDate,
    showDate: normalizeText(firstRow.showdate ?? firstRow.date) || showDate,
    venueName: normalizeText(firstRow.venuename ?? firstRow.venue ?? firstRow.venue_name),
    city: normalizeText(firstRow.city ?? firstRow.city_name),
    state: normalizeText(firstRow.state ?? firstRow.state_name) || undefined,
    country: normalizeText(firstRow.country ?? firstRow.country_name) || 'US',
    tier: 'tier1_exact',
    sets: buildKglwSetsFromRows(rows),
  };
}

export async function fetchKglwShowByDate(showDate: string): Promise<NormalizedShow | null> {
  const url = `${KGLW_API_BASE_URL}/setlists/showdate/${encodeURIComponent(showDate)}.json`;
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
    throw new Error(`KGLW request failed (${response.status}): ${url}`);
  }

  const payload = await response.json();
  return normalizeKglwShowPayload(payload, showDate);
}
