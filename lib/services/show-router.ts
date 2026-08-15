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

type ShowRow = Database['public']['Tables']['shows']['Row'];
type ShowIdRow = Pick<ShowRow, 'id'>;
type ShowInsert = Database['public']['Tables']['shows']['Insert'];
type SetlistRow = Database['public']['Tables']['setlists']['Row'];
type SetlistInsert = Database['public']['Tables']['setlists']['Insert'];
type SongRow = Database['public']['Tables']['songs']['Row'];
type SongInsert = Database['public']['Tables']['songs']['Insert'];
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

async function deleteCachedKglwShow(showId: string, context: string) {
  const supabase = getAdminClientSafely();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from('shows')
    .delete()
    .eq('id', showId);

  if (error) {
    console.error(`Failed to delete cached KGLW show after ${context}:`, error);
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

  const { data: rawShowRow, error: showError } = await supabase
    .from('shows')
    .select('id, artist_name, external_show_id, show_date, venue_name, city, state, country')
    .eq('provider', 'kglw')
    .eq('show_date', showDate)
    .maybeSingle();
  const showRow = rawShowRow as ShowRow | null;

  if (showError) {
    console.error('Failed to read cached KGLW show:', showError);
    return null;
  }

  if (!showRow) {
    return null;
  }

  const { data: rawSetlistRows, error: setlistError } = await supabase
    .from('setlists')
    .select('id, show_id, set_name, set_type, position, created_at')
    .eq('show_id', showRow.id)
    .order('position', { ascending: true });
  const setlistRows = (rawSetlistRows ?? []) as SetlistRow[];

  if (setlistError) {
    console.error('Failed to read cached KGLW setlists:', setlistError);
    return null;
  }

  if (!setlistRows.length) {
    return null;
  }

  const setlistIds = setlistRows.map((row) => row.id);
  const { data: rawSongRows, error: songError } = setlistIds.length
    ? await supabase
      .from('songs')
      .select('id, setlist_id, title, position, duration_seconds, notes, created_at')
      .in('setlist_id', setlistIds)
      .order('position', { ascending: true })
    : { data: [], error: null };
  const songRows = (rawSongRows ?? []) as SongRow[];

  if (songError) {
    console.error('Failed to read cached KGLW songs:', songError);
    return null;
  }

  if (!songRows.length) {
    return null;
  }

  const songsBySetlistId = new Map<string, SongRow[]>();
  songRows.forEach((songRow) => {
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
    sets: setlistRows.map((setRow) => ({
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

  const showPayload: ShowInsert = {
    artist_name: show.artistName,
    provider: show.provider,
    external_show_id: show.externalId,
    show_date: show.showDate,
    venue_name: show.venueName || null,
    city: show.city || null,
    state: show.state || null,
    country: show.country || 'US',
  };

  const { data: rawShowRow, error: showError } = await supabase
    .from('shows')
    .insert([showPayload] as never)
    .select('id')
    .single();
  const showRow = rawShowRow as ShowIdRow | null;

  if (showError?.code === '23505') {
    return;
  }

  if (showError || !showRow) {
    console.error('Failed to cache KGLW show:', showError);
    return;
  }

  if (!show.sets.length) {
    await deleteCachedKglwShow(showRow.id, 'empty set cache write');
    return;
  }

  const setlistPayload: SetlistInsert[] = show.sets.map((set, index) => ({
    show_id: showRow.id,
    set_name: set.setName,
    set_type: inferSetType(set.setName, index),
    position: index + 1,
  }));

  const { data: rawInsertedSetlists, error: setlistError } = await supabase
    .from('setlists')
    .insert(setlistPayload as never)
    .select('id, show_id, set_name, set_type, position, created_at');
  const insertedSetlists = (rawInsertedSetlists ?? []) as SetlistRow[];

  if (setlistError) {
    await deleteCachedKglwShow(showRow.id, 'setlist cache write failure');
    console.error('Failed to cache KGLW setlists:', setlistError);
    return;
  }

  const setlistIdByPosition = new Map<number, string>();
  insertedSetlists.forEach((setlistRow) => {
    setlistIdByPosition.set(setlistRow.position, setlistRow.id);
  });

  const songRows: SongInsert[] = show.sets.flatMap((set, setIndex) => {
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
    await deleteCachedKglwShow(showRow.id, 'empty song cache write');
    return;
  }

  const { error: songError } = await supabase
    .from('songs')
    .insert(songRows as never);

  if (songError) {
    await deleteCachedKglwShow(showRow.id, 'song cache write failure');
    console.error('Failed to cache KGLW songs:', songError);
  }
}

export async function getRoutedShowByArtistAndDate(input: ProviderFetchInput): Promise<NormalizedShow | null> {
  const isKglwRoute = isKglwArtistName(input.artistName);
  const normalizedArtistName = isKglwRoute
    ? KGLW_CANONICAL_ARTIST_NAME
    : normalizeText(input.artistName);

  if (!isKglwRoute) {
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
