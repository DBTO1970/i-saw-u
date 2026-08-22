import { describe, expect, it } from 'vitest';
import { getShowSourceLink, inferArtistNameFromProvider } from '../lib/show-source-links';

describe('getShowSourceLink', () => {
  it('builds a provider-specific Setlist.fm search link when no direct show URL exists', () => {
    const result = getShowSourceLink({
      showData: { provider: 'setlistfm', artistName: 'Billy Strings' },
      showDate: '2026-08-14',
    });

    expect(result).toEqual({
      url: 'https://www.setlist.fm/search?query=Billy%20Strings%202026-08-14',
      label: 'Setlist.fm',
      provider: 'setlistfm',
    });
  });

  it('infers provider label from an explicit URL host when provider is missing', () => {
    const result = getShowSourceLink({
      showData: {
        showUrl: 'https://kglw.net/setlists/king-gizzard-and-the-lizard-wizard-august-14-2026-meadow-creek-buena-vista-co-usa.html',
      },
      showDate: '2026-08-14',
    });

    expect(result?.label).toBe('kglw.net');
    expect(result?.provider).toBe('kglw');
  });
});

describe('inferArtistNameFromProvider', () => {
  it('returns the expected canonical artist for known providers', () => {
    expect(inferArtistNameFromProvider('kglw')).toBe('King Gizzard & the Lizard Wizard');
    expect(inferArtistNameFromProvider('phishnet')).toBe('Phish');
    expect(inferArtistNameFromProvider('setlistfm')).toBeNull();
  });
});
