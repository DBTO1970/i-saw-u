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
  const directTransition = normalizeText(
    song.transition
    ?? song.transition_note
    ?? song.transition_notes
    ?? song.segue_note
    ?? song.segue_text
    ?? song.segue,
  );
  if (directTransition) {
    return directTransition;
  }

  const booleanTransitionValues = [
    song.is_segue,
    song.segue,
    song.is_transition,
    song.transition,
    song.segued,
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

function buildKglwSets(rawSongs: unknown): NormalizedShow['sets'] {
  const grouped = new Map<string, NormalizedShow['sets'][number]>();

  asArray(rawSongs).forEach((rawSong, index) => {
    const song = rawSong && typeof rawSong === 'object' ? rawSong as JsonObject : null;
    const title = song
      ? normalizeText(song.song_name ?? song.name ?? song.title ?? song.song ?? song.track)
      : normalizeText(rawSong);

    if (!title) {
      return;
    }

    const setName = normalizeSetName(
      song?.set ?? song?.set_name ?? song?.setName ?? song?.section ?? song?.section_name ?? song?.set_num,
      grouped.size,
    );
    const setEntry = grouped.get(setName) ?? { setName, songs: [] };
    const notes = song ? buildSongNotes(song) : undefined;

    setEntry.songs.push({
      title,
      position: setEntry.songs.length + 1,
      durationSeconds: song
        ? parseDurationSeconds(song.duration_seconds ?? song.duration ?? song.length ?? song.tracktime)
        : undefined,
      notes,
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

  const show = rows.find((row) => normalizeText(row.showdate) === showDate) ?? rows[0];
  const sets = buildKglwSets(show.setlist ?? show.songs ?? show.song_list ?? show.tracks ?? show.playlist);

  return {
    artistName: KGLW_CANONICAL_ARTIST_NAME,
    provider: 'kglw',
    externalId: normalizeText(show.show_id ?? show.id ?? show.uuid) || showDate,
    showDate: normalizeText(show.showdate ?? show.date) || showDate,
    venueName: normalizeText(show.venue ?? show.venue_name),
    city: normalizeText(show.city ?? show.city_name),
    state: normalizeText(show.state ?? show.state_name) || undefined,
    country: normalizeText(show.country ?? show.country_name) || 'US',
    tier: 'tier1_exact',
    sets,
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
