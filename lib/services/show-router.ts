import type { Database } from '../supabase/types';
import { createAdminClient } from '../supabase/server';
import type { NormalizedShow } from '../../types/provider';
import { getNormalizedShowByArtistAndDate } from '../setlists/unified-provider-service';
import { fetchKglwShowByDate, KGLW_CANONICAL_ARTIST_NAME } from './kglw';

type ProviderFetchInput = {
  artistName: string;
  showDate: string;
  phishNetApiKey?: string;
  setlistFmApiKey?: string;
};

type SongRow = Database['public']['Tables']['songs']['Row'];
type SetType = Database['public']['Enums']['set_type'];

const KGLW_ARTIST_KEYS = new Set([
  'king gizzard',
  'king gizzard & the lizard wizard',
  'king gizzard and the lizard wizard',
  'kglw',
]);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toArtistKey(artistName: string): string {
  return normalizeText(artistName).toLowerCase();
}

export function isKglwArtistName(artistName: string): boolean {
  return KGLW_ARTIST_KEYS.has(toArtistKey(artistName));
}

function getAdminClientSafely() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

function inferSetType(setName: string, setIndex: number): SetType {
  const normalized = normalizeText(setName).toLowerCase();
  if (normalized.includes('encore') || normalized === 'e') {
    return 'encore';
  }
  if (setIndex === 0) {
    return 'set_1';
  }
  if (setIndex === 1) {
    return 'set_2';
  }
  return 'other';
}

async function getCachedKglwShowByDate(showDate: string): Promise<NormalizedShow | null> {
  const supabase = getAdminClientSafely();
  if (!supabase) {
    return null;
  }

  const { data: showRow, error: showError } = await supabase
    .from('shows')
    .select('id, artist_name, provider, external_show_id, show_date, venue_name, city, state, country, created_at, updated_at')
    .eq('provider', 'kglw')
    .eq('show_date', showDate)
    .maybeSingle();

  if (showError) {
    console.error('Failed to read cached KGLW show:', showError);
    return null;
  }

  if (!showRow) {
    return null;
  }

  const { data: setlistRows, error: setlistError } = await supabase
    .from('setlists')
    .select('id, show_id, set_name, set_type, position, created_at')
    .eq('show_id', showRow.id)
    .order('position', { ascending: true });

  if (setlistError) {
    console.error('Failed to read cached KGLW setlists:', setlistError);
    return null;
  }

  const setlistIds = (setlistRows ?? []).map((row) => row.id);
  const { data: songRows, error: songError } = setlistIds.length
    ? await supabase
      .from('songs')
      .select('id, setlist_id, title, position, duration_seconds, notes, created_at')
      .in('setlist_id', setlistIds)
      .order('position', { ascending: true })
    : { data: [], error: null };

  if (songError) {
    console.error('Failed to read cached KGLW songs:', songError);
    return null;
  }

  const songsBySetlistId = new Map<string, SongRow[]>();
  (songRows ?? []).forEach((songRow) => {
    const songs = songsBySetlistId.get(songRow.setlist_id) ?? [];
    songs.push(songRow);
    songsBySetlistId.set(songRow.setlist_id, songs);
  });

  return {
    artistName: showRow.artist_name,
    provider: 'kglw',
    externalId: showRow.external_show_id,
    showDate: showRow.show_date,
    venueName: showRow.venue_name ?? '',
    city: showRow.city ?? '',
    state: showRow.state ?? undefined,
    country: showRow.country ?? 'US',
    tier: 'tier1_exact',
    sets: (setlistRows ?? []).map((setRow) => ({
      setName: setRow.set_name,
      songs: (songsBySetlistId.get(setRow.id) ?? []).map((songRow) => ({
        title: songRow.title,
        position: songRow.position,
        durationSeconds: songRow.duration_seconds ?? undefined,
        notes: songRow.notes ?? undefined,
      })),
    })),
  };
}

async function cacheKglwShow(show: NormalizedShow): Promise<void> {
  if (show.provider !== 'kglw') {
    return;
  }

  const supabase = getAdminClientSafely();
  if (!supabase) {
    return;
  }

  const { data: showRow, error: showError } = await supabase
    .from('shows')
    .upsert({
      artist_name: show.artistName,
      provider: show.provider,
      external_show_id: show.externalId,
      show_date: show.showDate,
      venue_name: show.venueName || null,
      city: show.city || null,
      state: show.state || null,
      country: show.country || null,
    }, {
      onConflict: 'provider,external_show_id',
    })
    .select('id, artist_name, provider, external_show_id, show_date, venue_name, city, state, country, created_at, updated_at')
    .single();

  if (showError || !showRow) {
    console.error('Failed to cache KGLW show:', showError);
    return;
  }

  const { error: deleteSetlistsError } = await supabase
    .from('setlists')
    .delete()
    .eq('show_id', showRow.id);

  if (deleteSetlistsError) {
    console.error('Failed to clear cached KGLW setlists:', deleteSetlistsError);
    return;
  }

  if (!show.sets.length) {
    return;
  }

  const { data: insertedSetlists, error: setlistError } = await supabase
    .from('setlists')
    .insert(show.sets.map((set, index) => ({
      show_id: showRow.id,
      set_name: set.setName,
      set_type: inferSetType(set.setName, index),
      position: index + 1,
    })))
    .select('id, show_id, set_name, set_type, position, created_at');

  if (setlistError) {
    console.error('Failed to cache KGLW setlists:', setlistError);
    return;
  }

  const setlistIdByPosition = new Map<number, string>();
  (insertedSetlists ?? []).forEach((setlistRow) => {
    setlistIdByPosition.set(setlistRow.position, setlistRow.id);
  });

  const songRows = show.sets.flatMap((set, setIndex) => {
    const setlistId = setlistIdByPosition.get(setIndex + 1);
    if (!setlistId) {
      return [];
    }

    return set.songs.map((song) => ({
      setlist_id: setlistId,
      title: song.title,
      position: song.position,
      duration_seconds: song.durationSeconds ?? null,
      notes: song.notes ?? null,
    }));
  });

  if (!songRows.length) {
    return;
  }

  const { error: songError } = await supabase
    .from('songs')
    .insert(songRows);

  if (songError) {
    console.error('Failed to cache KGLW songs:', songError);
  }
}

export async function getRoutedShowByArtistAndDate(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  const normalizedArtistName = isKglwArtistName(input.artistName)
    ? KGLW_CANONICAL_ARTIST_NAME
    : normalizeText(input.artistName);

  if (!isKglwArtistName(normalizedArtistName)) {
    return getNormalizedShowByArtistAndDate({
      ...input,
      artistName: normalizedArtistName,
    });
  }

  const cachedShow = await getCachedKglwShowByDate(input.showDate);
  if (cachedShow) {
    return cachedShow;
  }

  const normalizedShow = await fetchKglwShowByDate(input.showDate);
  if (normalizedShow) {
    await cacheKglwShow(normalizedShow);
  }
  return normalizedShow;
}
