import { describe, expect, it } from 'vitest';
import { normalizeKglwShowPayload, KGLW_CANONICAL_ARTIST_NAME } from '../lib/services/kglw';

describe('normalizeKglwShowPayload', () => {
  it('normalizes a KGLW setlists endpoint response (flat per-song rows) into the shared show format', () => {
    // The KGLW /api/v2/setlists/showdate endpoint returns one row per song,
    // each carrying show-level metadata (venue, city, show_id, etc.) as well.
    const payload = {
      error: 0,
      data: [
        {
          show_id: 1694538149,
          showdate: '2024-11-01',
          songname: 'Robot Stop',
          settype: 'Set',
          setnumber: '1',
          position: 1,
          tracktime: '4:57',
          footnote: 'Tour debut',
          transition: ', ',
          venuename: 'The Gorge Amphitheatre',
          city: 'George',
          state: 'WA',
          country: 'US',
        },
        {
          show_id: 1694538149,
          showdate: '2024-11-01',
          songname: 'Big Fig Wasp',
          settype: 'Set',
          setnumber: '1',
          position: 2,
          tracktime: '4:08',
          footnote: '',
          transition: '',
          venuename: 'The Gorge Amphitheatre',
          city: 'George',
          state: 'WA',
          country: 'US',
        },
        {
          show_id: 1694538149,
          showdate: '2024-11-01',
          songname: 'Magma',
          settype: 'Encore',
          setnumber: '2',
          position: 1,
          tracktime: '',
          footnote: '',
          transition: '> Motor Spirit',
          venuename: 'The Gorge Amphitheatre',
          city: 'George',
          state: 'WA',
          country: 'US',
        },
      ],
    };

    const normalized = normalizeKglwShowPayload(payload, '2024-11-01');

    expect(normalized).toEqual({
      artistName: KGLW_CANONICAL_ARTIST_NAME,
      provider: 'kglw',
      externalId: '1694538149',
      showDate: '2024-11-01',
      venueName: 'The Gorge Amphitheatre',
      city: 'George',
      state: 'WA',
      country: 'US',
      tier: 'tier1_exact',
      sets: [
        {
          setName: 'Set 1',
          songs: [
            {
              title: 'Robot Stop',
              position: 1,
              durationSeconds: 297,
              notes: 'Tour debut • Segue into next song',
            },
            {
              title: 'Big Fig Wasp',
              position: 2,
              durationSeconds: 248,
              notes: undefined,
            },
          ],
        },
        {
          setName: 'Encore',
          songs: [
            {
              title: 'Magma',
              position: 1,
              durationSeconds: undefined,
              notes: '> Motor Spirit',
            },
          ],
        },
      ],
    });
  });

  it('returns null when the API payload reports an error', () => {
    expect(normalizeKglwShowPayload({ error: 1, data: [] }, '2024-11-01')).toBeNull();
  });
});
