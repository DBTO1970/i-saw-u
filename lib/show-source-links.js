function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeProvider(provider) {
  return normalizeText(provider).toLowerCase();
}

function isHttpUrl(value) {
  const candidate = normalizeText(value);
  return candidate.startsWith('https://') || candidate.startsWith('http://');
}

function inferProviderFromUrl(url) {
  const value = normalizeText(url).toLowerCase();
  if (!value) {
    return '';
  }
  if (value.includes('phish.net')) {
    return 'phishnet';
  }
  if (value.includes('kglw.net')) {
    return 'kglw';
  }
  if (value.includes('setlist.fm')) {
    return 'setlistfm';
  }
  if (value.includes('elgoose.net')) {
    return 'elgoose';
  }
  if (value.includes('relisten.net')) {
    return 'relisten';
  }
  if (value.includes('bmfsdb')) {
    return 'bmfsdb';
  }
  return '';
}

export function getProviderSiteLabel(provider) {
  switch (normalizeProvider(provider)) {
    case 'phishnet':
      return 'phish.net';
    case 'kglw':
      return 'kglw.net';
    case 'setlistfm':
      return 'Setlist.fm';
    case 'elgoose':
      return 'elgoose.net';
    case 'relisten':
      return 'Relisten';
    case 'bmfsdb':
      return 'bmfsdb';
    default:
      return 'source site';
  }
}

export function inferArtistNameFromProvider(provider) {
  switch (normalizeProvider(provider)) {
    case 'phishnet':
      return 'Phish';
    case 'kglw':
      return 'King Gizzard & the Lizard Wizard';
    case 'elgoose':
      return 'Goose';
    default:
      return null;
  }
}

function buildSetlistFmSearchUrl(artistName, showDate) {
  const queryParts = [normalizeText(artistName), normalizeText(showDate)].filter(Boolean);
  if (queryParts.length === 0) {
    return 'https://www.setlist.fm/';
  }
  return `https://www.setlist.fm/search?query=${encodeURIComponent(queryParts.join(' '))}`;
}

function buildProviderFallbackUrl(provider, showDate, artistName) {
  const normalizedDate = normalizeText(showDate);
  switch (normalizeProvider(provider)) {
    case 'phishnet':
      return normalizedDate
        ? `https://phish.net/setlists/?d=${encodeURIComponent(normalizedDate)}`
        : 'https://phish.net/setlists/';
    case 'kglw':
      return normalizedDate
        ? `https://kglw.net/api/v2/setlists/showdate/${encodeURIComponent(normalizedDate)}.json`
        : 'https://kglw.net/setlists/';
    case 'setlistfm':
      return buildSetlistFmSearchUrl(artistName, normalizedDate);
    case 'elgoose':
      return normalizedDate
        ? `https://elgoose.net/api/v1/shows/${encodeURIComponent(normalizedDate)}`
        : 'https://elgoose.net/';
    case 'relisten':
      return 'https://relisten.net/';
    case 'bmfsdb':
      return 'https://bmfsdb.com/';
    default:
      return null;
  }
}

export function getShowSourceLink({ showData, showDate, provider, artistName }) {
  const payload = showData && typeof showData === 'object' && !Array.isArray(showData) ? showData : {};
  const explicitUrlCandidates = [
    payload.externalShowUrl,
    payload.showUrl,
    payload.show_url,
    payload.setlistUrl,
    payload.setlist_url,
    payload.permalink,
    payload.url,
    payload.phishNetUrl,
  ];

  const explicitUrl = explicitUrlCandidates.find((candidate) => isHttpUrl(candidate)) || null;
  const resolvedProvider = normalizeProvider(
    provider
    || payload.provider
    || (explicitUrl ? inferProviderFromUrl(explicitUrl) : ''),
  );
  const resolvedArtistName = normalizeText(
    artistName
    || payload.artistName
    || payload.artist_name,
  );
  const fallbackUrl = buildProviderFallbackUrl(resolvedProvider, showDate || payload.date || payload.showDate, resolvedArtistName);
  const url = explicitUrl || fallbackUrl;

  if (!url) {
    return null;
  }

  return {
    url,
    label: getProviderSiteLabel(resolvedProvider),
    provider: resolvedProvider || null,
  };
}
