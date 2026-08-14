export type UnifiedProvider = 'phishnet' | 'elgoose' | 'relisten' | 'bmfsdb' | 'setlistfm';

export type ProviderTier = 'tier1_exact' | 'tier2_fallback';

export interface NormalizedShow {
  artistName: string;
  provider: UnifiedProvider;
  externalId: string;
  showDate: string; // YYYY-MM-DD
  venueName: string;
  city: string;
  state?: string;
  country: string;
  tier: ProviderTier;
  sets: {
    setName: string;
    songs: {
      title: string;
      position: number;
      durationSeconds?: number;
    }[];
  }[];
}
