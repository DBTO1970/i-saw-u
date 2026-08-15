import { describe, expect, it } from 'vitest';
import { normalizeKglwShowPayload, KGLW_CANONICAL_ARTIST_NAME } from '../lib/services/kglw';

describe('normalizeKglwShowPayload', () => {
  it('normalizes a KGLW show response into the shared show format', () => {
    const payload = {
      error: 0,
      data: [
        {
          show_id: '20241101',
          showdate: '2024-11-01',
          venue: 'The Gorge Amphitheatre',
          city: 'George',
          state: 'WA',
          country: 'US',
          setlist: [
            {
              set: 'Set 1',
              song_name: 'Robot Stop',
              duration: '4:57',
              notes: 'Tour debut',
              segue: true,
            },
            {
              set: 'Set 1',
              song_name: 'Big Fig Wasp',
              duration: 248,
            },
            {
              set: 'Encore',
              song_name: 'Magma',
              transition_note: '-> Motor Spirit',
            },
          ],
        },
      ],
    };

    const normalized = normalizeKglwShowPayload(payload, '2024-11-01');

    expect(normalized).toEqual({
      artistName: KGLW_CANONICAL_ARTIST_NAME,
      provider: 'kglw',
      externalId: '20241101',
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
              notes: '-> Motor Spirit',
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
