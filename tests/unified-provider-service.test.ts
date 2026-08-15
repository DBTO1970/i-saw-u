import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getNormalizedShowByArtistAndDate,
  normalizeProviderShowToLegacyShow,
} from '../lib/setlists/unified-provider-service';

const kglwShowPayload = {
  error: false,
  error_message: '',
  data: [
    {
      show_id: 1764699658,
      showdate: '2026-08-14',
      artist: 'King Gizzard & the Lizard Wizard',
      venuename: 'Meadow Creek',
      city: 'Buena Vista',
      state: 'CO',
      country: 'USA',
    },
    {
      show_id: 1786468290,
      showdate: '2026-08-14',
      artist: 'Stu Mackenzie',
      venuename: 'Meadow Creek',
      city: 'Buena Vista',
      state: 'CO',
      country: 'USA',
    },
  ],
};

const kglwSetlistPayload = {
  error: false,
  error_message: '',
  data: [
    {
      show_id: 1764699658,
      songname: 'Self-Immolate',
      settype: 'Set',
      setnumber: '1',
      position: 1,
      tracktime: '5:23',
      artist: 'King Gizzard & the Lizard Wizard',
    },
    {
      show_id: 1764699658,
      songname: 'Extinction',
      settype: 'Set',
      setnumber: '1',
      position: 2,
      tracktime: '6:00',
      artist: 'King Gizzard & the Lizard Wizard',
    },
    {
      show_id: 1764699658,
      songname: 'The River',
      settype: 'Encore',
      setnumber: '2',
      position: 1,
      tracktime: '9:00',
      artist: 'King Gizzard & the Lizard Wizard',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KGLW provider lookups', () => {
  it('uses the documented KGLW.net show and setlist date endpoints', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://kglw.net/api/v2/shows/showdate/2026-08-14.json') {
        return {
          ok: true,
          status: 200,
          json: async () => kglwShowPayload,
        } as Response;
      }

      if (url === 'https://kglw.net/api/v2/setlists/showdate/2026-08-14.json') {
        return {
          ok: true,
          status: 200,
          json: async () => kglwSetlistPayload,
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const normalizedShow = await getNormalizedShowByArtistAndDate({
      artistName: 'King Gizzard & the Lizard Wizard',
      showDate: '2026-08-14',
    });

    expect(normalizedShow).not.toBeNull();
    expect(normalizedShow?.provider).toBe('kglw');
    expect(normalizedShow?.tier).toBe('tier1_exact');
    expect(normalizedShow?.artistName).toBe('King Gizzard & the Lizard Wizard');
    expect(normalizedShow?.venueName).toBe('Meadow Creek');
    expect(normalizedShow?.sets).toHaveLength(2);
    expect(normalizedShow?.sets[0].songs).toHaveLength(2);
    expect(normalizedShow?.sets[0].songs[0].durationSeconds).toBe(323);

    const legacyShow = normalizeProviderShowToLegacyShow(normalizedShow!);
    expect(legacyShow.setlist[0]).toEqual({ type: 'set', label: 'Set 1' });
    expect(legacyShow.setlist[1]).toMatchObject({
      type: 'song',
      label: 'Self-Immolate',
      durationSeconds: 323,
      set: 'Set 1',
      position: 1,
    });
    expect(legacyShow.setlist[3]).toEqual({ type: 'encore', label: 'Encore' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://kglw.net/api/v2/shows/showdate/2026-08-14.json',
      'https://kglw.net/api/v2/setlists/showdate/2026-08-14.json',
    ]);
  });
});
