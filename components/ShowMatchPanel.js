'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getShowByDate, searchLocationAutocomplete, searchShowsByLocation } from '../app/actions/shows';
import ImageExifUploader from './ImageExifUploader';
import ShowMatchCard from './ShowMatchCard';
import LiveModeController from './LiveModeController';

function extractDateFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const candidates = [metadata.dateTimeOriginal, metadata.dateTimeOriginalDisplay, metadata.rawDateTimeOriginal];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed === 'Not available') {
      continue;
    }

    const match = trimmed.match(/(\d{4})[-:](\d{2})[-:](\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
    }
  }

  return null;
}

function extractTimeForTimeInput(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return '';
  }

  const candidates = [metadata.timeTaken, metadata.rawDateTimeOriginal];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || trimmed === 'Not available') {
      continue;
    }

    const match = trimmed.match(/(?:T|\s)?(\d{2}):(\d{2})(?::\d{2})?/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }

  return '';
}

function parseCoordinateNumber(value) {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function formatDateDisplay(date, time) {
  if (!date) {
    return 'Not available';
  }

  const combined = `${date}${time ? `T${time}` : ''}`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) {
    return time ? `${date} ${time}` : date;
  }

  const hasTime = Boolean(time);
  return parsed.toLocaleString(undefined, hasTime
    ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatGapDaysLabel(days) {
  if (typeof days !== 'number' || Number.isNaN(days)) {
    return null;
  }
  if (days === 0) {
    return 'Same date';
  }

  const distance = Math.abs(days);
  const unit = distance === 1 ? 'day' : 'days';
  return days < 0 ? `${distance} ${unit} before photo date` : `${distance} ${unit} after photo date`;
}

function formatVenueSearchGap(days) {
  if (typeof days !== 'number' || Number.isNaN(days)) {
    return null;
  }
  if (days === 0) {
    return 'Same day as photo date';
  }
  return formatGapDaysLabel(days);
}

const SHARED_IMPORT_HISTORY_KEY = 'sharedImportHistoryV1';

function createEmptyPhotoMetadata() {
  return {
    dateTimeOriginal: 'Not available',
    dateTimeOriginalDisplay: 'Not available',
    timeTaken: 'Not available',
    gpsLatitude: 'Not available',
    gpsLongitude: 'Not available',
    dateSource: 'none',
    timeSource: 'none',
    gpsSource: 'none',
    rawDateTimeOriginal: null,
    rawGpsLatitude: null,
    rawGpsLongitude: null,
    rawGpsLatitudeRef: null,
    rawGpsLongitudeRef: null,
    showStartTime: '19:30',
    sidecarFileName: '',
    sidecarUsed: false,
    userTags: [],
  };
}

function createEmptyShowResult() {
  return {
    show: null,
    error: null,
    nearbyShows: [],
    relatedDateShows: [],
  };
}

function formatSharedImportTimestamp(value) {
  if (!value) {
    return 'Unknown time';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString();
}

function readSharedImportHistory() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SHARED_IMPORT_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry) => entry && typeof entry.fileName === 'string').slice(0, 3);
  } catch (error) {
    console.error('Unable to read shared import history from localStorage:', error);
    return [];
  }
}

function writeSharedImportHistory(history) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SHARED_IMPORT_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Unable to save shared import history to localStorage:', error);
  }
}

function mergeSharedImportHistory(history, nextEntry) {
  const safeHistory = Array.isArray(history) ? history : [];
  const normalizedHistory = safeHistory.filter((entry) => entry && typeof entry.fileName === 'string');

  if (!nextEntry) {
    return normalizedHistory.slice(0, 3);
  }

  return [
    nextEntry,
    ...normalizedHistory.filter((entry) => !(entry.fileName === nextEntry.fileName && entry.receivedAt === nextEntry.receivedAt)),
  ].slice(0, 3);
}

function AccordionSection({ title, description, open, onToggle, children, accent = 'cyan' }) {
  const accentClasses =
    accent === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';

  return (
    <details
      open={open}
      onToggle={(event) => onToggle?.(event.currentTarget.open)}
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] ${accentClasses}`}>
            {title}
          </span>
          {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-400">{open ? 'Collapse' : 'Expand'}</span>
      </summary>
      <div className="border-t border-slate-800 px-4 py-4">
        {children}
      </div>
    </details>
  );
}

export default function ShowMatchPanel({ initialPhotoMetadata, initialShowResult, initialSharedPhoto = null }) {
  const [photoMetadata, setPhotoMetadata] = useState(initialPhotoMetadata);
  const [showResult, setShowResult] = useState(initialShowResult);
  const [isLoadingShow, setIsLoadingShow] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    () => (initialSharedPhoto ? `Shared photo received: ${initialSharedPhoto.fileName}` : ''),
  );
  const [showLookupDate, setShowLookupDate] = useState(() => extractDateFromMetadata(initialPhotoMetadata) || '');
  const [activeDate, setActiveDate] = useState(() => extractDateFromMetadata(initialPhotoMetadata) || '');

  const [showSupplementalForm, setShowSupplementalForm] = useState(false);
  const [overrideVenueName, setOverrideVenueName] = useState('');
  const [overrideCity, setOverrideCity] = useState('');
  const [overrideState, setOverrideState] = useState('');
  const [overrideLatitude, setOverrideLatitude] = useState('');
  const [overrideLongitude, setOverrideLongitude] = useState('');
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideTime, setOverrideTime] = useState('');
  const [overrideTags, setOverrideTags] = useState('');
  const [venueConfirmedFromShow, setVenueConfirmedFromShow] = useState(false);
  const [locationSearchResults, setLocationSearchResults] = useState([]);
  const [locationSearchMessage, setLocationSearchMessage] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState({ venues: [], cities: [], states: [] });
  const [isLoadingAutocomplete, setIsLoadingAutocomplete] = useState(false);
  const [sharedImportHistory, setSharedImportHistory] = useState([]);
  const [uploaderSessionKey, setUploaderSessionKey] = useState(0);
  const [showStartTime, setShowStartTime] = useState('19:30');
  const [currentSongLabel, setCurrentSongLabel] = useState('');
  const [timeContextLabel, setTimeContextLabel] = useState('');
  const [calibrationMetadata, setCalibrationMetadata] = useState(null);
  const [isMatchSectionOpen, setIsMatchSectionOpen] = useState(true);
  const [isSupplementalSectionOpen, setIsSupplementalSectionOpen] = useState(false);
  const supplementalSectionRef = useRef(null);
  const supplementalVenueInputRef = useRef(null);
  const suppressMissingDateMessageRef = useRef(false);

  const embeddedLat = parseCoordinateNumber(photoMetadata?.rawGpsLatitude);
  const embeddedLon = parseCoordinateNumber(photoMetadata?.rawGpsLongitude);
  const hasEmbeddedGps = embeddedLat !== null && embeddedLon !== null;
  const suggestedShow = showResult?.show ?? null;
  const nearbyShows = Array.isArray(showResult?.nearbyShows) ? showResult.nearbyShows : [];
  const relatedDateShows = Array.isArray(showResult?.relatedDateShows) ? showResult.relatedDateShows : [];
  const supplementalTimeValue = overrideTime || extractTimeForTimeInput(photoMetadata);
  const lookupPhotoDate = overrideDate || extractDateFromMetadata(photoMetadata) || activeDate || '';

  useEffect(() => {
    const storedHistory = readSharedImportHistory();

    if (initialSharedPhoto) {
      const nextEntry = {
        fileName: initialSharedPhoto.fileName || 'Shared photo',
        receivedAt: initialSharedPhoto.receivedAt || new Date().toISOString(),
      };

      const nextHistory = mergeSharedImportHistory(storedHistory, nextEntry);
      writeSharedImportHistory(nextHistory);
      document.cookie = 'sharedPhotoPayload=; Max-Age=0; path=/; SameSite=Lax';
      setSharedImportHistory(nextHistory);
      return;
    }

    setSharedImportHistory(storedHistory);
  }, [initialSharedPhoto]);

  const applyVenueAutocompleteMatch = (value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const exactVenueMatch = autocompleteSuggestions.venues.find(
      (entry) => entry.venueName.toLowerCase() === normalized,
    );
    if (exactVenueMatch) {
      if (exactVenueMatch.city) {
        setOverrideCity(exactVenueMatch.city);
      }
      if (exactVenueMatch.state) {
        setOverrideState(exactVenueMatch.state);
      }
    }
  };

  const applyCityAutocompleteMatch = (value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const cityMatch = autocompleteSuggestions.cities.find(
      (entry) => entry.city.toLowerCase() === normalized,
    );
    if (cityMatch?.state) {
      setOverrideState(cityMatch.state);
    }
  };

  const openManualVenueSearch = () => {
    openSupplementalSection();
    setVenueConfirmedFromShow(false);
    setStatusMessage('Manual venue search/edit mode is open below. Update venue/date/time fields, then save.');

    window.setTimeout(() => {
      supplementalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      supplementalVenueInputRef.current?.focus();
    }, 0);
  };

  const runVenueLocationLookup = async (criteriaOverride = null) => {
    const venueCriteria = criteriaOverride?.venue ?? overrideVenueName;
    const cityCriteria = criteriaOverride?.city ?? overrideCity;
    const stateCriteria = criteriaOverride?.state ?? overrideState;
    const photoDateCriteria = criteriaOverride?.photoDate ?? lookupPhotoDate;

    setIsSearchingLocation(true);
    setLocationSearchMessage('Searching Phish shows by venue/city/state...');

    try {
      const result = await searchShowsByLocation({
        venue: venueCriteria,
        city: cityCriteria,
        state: stateCriteria,
        photoDate: photoDateCriteria,
      });

      const matches = Array.isArray(result?.matches) ? result.matches : [];
      setLocationSearchResults(matches);

      if (result?.error) {
        setLocationSearchMessage(result.error);
      } else {
        setLocationSearchMessage(matches.length > 0 ? `Found ${matches.length} location match${matches.length === 1 ? '' : 'es'}.` : 'No location matches found.');
      }
    } catch {
      setLocationSearchResults([]);
      setLocationSearchMessage('Unable to search by venue/city/state right now.');
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const lookupFromSuggestedVenue = async () => {
    const nextVenue = suggestedShow?.venueName || overrideVenueName;
    const nextCity = suggestedShow?.city || overrideCity;
    const nextState = suggestedShow?.state || overrideState;

    openSupplementalSection();
    setVenueConfirmedFromShow(false);
    setOverrideVenueName(nextVenue);
    setOverrideCity(nextCity);
    setOverrideState(nextState);
    setStatusMessage('Searching with suggested venue/location details...');

    window.setTimeout(() => {
      supplementalSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      supplementalVenueInputRef.current?.focus();
    }, 0);

    await runVenueLocationLookup({
      venue: nextVenue,
      city: nextCity,
      state: nextState,
      photoDate: lookupPhotoDate,
    });
  };

  const openSupplementalSection = useCallback(() => {
    setShowSupplementalForm(true);
    setIsSupplementalSectionOpen(true);
  }, []);

  useEffect(() => {
    if (!showSupplementalForm && hasEmbeddedGps) {
      return;
    }

    const venueQuery = overrideVenueName.trim();
    const cityQuery = overrideCity.trim();
    const stateQuery = overrideState.trim();
    const selectedVenue = overrideVenueName.trim();

    if (!venueQuery && !cityQuery && !stateQuery) {
      setAutocompleteSuggestions({ venues: [], cities: [], states: [] });
      return;
    }

    let isActive = true;
    setIsLoadingAutocomplete(true);
    const timer = window.setTimeout(() => {
      searchLocationAutocomplete({
        venueQuery,
        cityQuery,
        stateQuery,
        selectedVenue,
      })
        .then((result) => {
          if (!isActive) {
            return;
          }
          setAutocompleteSuggestions({
            venues: Array.isArray(result?.venues) ? result.venues : [],
            cities: Array.isArray(result?.cities) ? result.cities : [],
            states: Array.isArray(result?.states) ? result.states : [],
          });
        })
        .catch(() => {
          if (isActive) {
            setAutocompleteSuggestions({ venues: [], cities: [], states: [] });
          }
        })
        .finally(() => {
          if (isActive) {
            setIsLoadingAutocomplete(false);
          }
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [hasEmbeddedGps, overrideCity, overrideState, overrideVenueName, showSupplementalForm]);

  useEffect(() => {
    if (!activeDate) {
      setIsLoadingShow(false);
      return;
    }

    let isActive = true;
    setIsLoadingShow(true);
    setStatusMessage('Looking up the matching Phish show...');

    getShowByDate(activeDate)
      .then((result) => {
        if (!isActive) {
          return;
        }
        setShowResult(result);
        if (result?.show) {
          setStatusMessage('Show match found.');
          return;
        }

        const nearbyCount = Array.isArray(result?.nearbyShows) ? result.nearbyShows.length : 0;
        const relatedCount = Array.isArray(result?.relatedDateShows) ? result.relatedDateShows.length : 0;
        if (nearbyCount > 0 || relatedCount > 0) {
          setStatusMessage('No Phish show happened on that exact date. Showing nearby and historical alternatives.');
          return;
        }

        setStatusMessage('No show found for that date.');
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setShowResult({ show: null, error: 'Unable to load show data right now.' });
        setStatusMessage('Unable to load show data right now.');
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingShow(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [activeDate]);

  useEffect(() => {
    const dateFromMetadata = extractDateFromMetadata(photoMetadata);
    if (!dateFromMetadata) {
      if (suppressMissingDateMessageRef.current) {
        suppressMissingDateMessageRef.current = false;
        setStatusMessage('Cleared current photo. Pick or upload a new image to start over.');
        return;
      }
      setStatusMessage('No embedded capture date was found in this file. Use Search by date, or load a sidecar file under Advanced if your cloud export separated metadata.');
      return;
    }

    setShowLookupDate(dateFromMetadata);
    setActiveDate(dateFromMetadata);
    setOverrideDate((current) => current || dateFromMetadata);
  }, [photoMetadata]);

  const effectiveShow = useMemo(() => {
    const baseShow = suggestedShow ? { ...suggestedShow } : {};

    if (overrideVenueName.trim()) {
      baseShow.venueName = overrideVenueName.trim();
    }
    if (overrideCity.trim()) {
      baseShow.city = overrideCity.trim();
    }
    if (overrideState.trim()) {
      baseShow.state = overrideState.trim();
    }

    const manualLat = parseCoordinateNumber(overrideLatitude);
    const manualLon = parseCoordinateNumber(overrideLongitude);
    if (manualLat !== null) {
      baseShow.latitude = manualLat;
    }
    if (manualLon !== null) {
      baseShow.longitude = manualLon;
    }

    if (overrideDate.trim()) {
      baseShow.date = overrideDate.trim();
    } else if (!baseShow.date && activeDate) {
      baseShow.date = activeDate;
    }

    if (!baseShow.venueName && !baseShow.city && !baseShow.state && !baseShow.date) {
      return null;
    }

    return baseShow;
  }, [activeDate, overrideCity, overrideDate, overrideLatitude, overrideLongitude, overrideState, overrideVenueName, suggestedShow]);

  const effectivePhotoMetadata = useMemo(() => {
    const next = { ...photoMetadata };

    const manualLat = parseCoordinateNumber(overrideLatitude);
    const manualLon = parseCoordinateNumber(overrideLongitude);
    if (manualLat !== null) {
      next.rawGpsLatitude = manualLat;
      next.gpsLatitude = String(manualLat);
    }
    if (manualLon !== null) {
      next.rawGpsLongitude = manualLon;
      next.gpsLongitude = String(manualLon);
    }

    if (overrideDate.trim()) {
      next.dateTimeOriginal = overrideDate.trim();
      next.dateTimeOriginalDisplay = formatDateDisplay(overrideDate.trim(), overrideTime.trim());
      next.rawDateTimeOriginal = `${overrideDate.trim()}${overrideTime.trim() ? ` ${overrideTime.trim()}` : ''}`;
      next.dateSource = 'manual';
    }

    if (overrideTime.trim()) {
      next.timeTaken = overrideTime.trim();
      next.timeSource = 'manual';
    }

    if (overrideTags.trim()) {
      next.userTags = overrideTags
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else {
      next.userTags = [];
    }

    if (venueConfirmedFromShow) {
      next.locationSource = 'show-confirmed';
      next.gpsSource = 'show-confirmed';
    } else if (manualLat !== null && manualLon !== null) {
      next.locationSource = 'manual';
      next.gpsSource = 'manual';
    }

    next.showStartTime = showStartTime;

    return next;
  }, [overrideDate, overrideLatitude, overrideLongitude, overrideTags, overrideTime, photoMetadata, showStartTime, venueConfirmedFromShow]);

  const photoDerivedDate = useMemo(() => extractDateFromMetadata(effectivePhotoMetadata), [effectivePhotoMetadata]);

  const clearCurrentPhotoAndStartOver = () => {
    suppressMissingDateMessageRef.current = true;
    setUploaderSessionKey((current) => current + 1);
    setPhotoMetadata(createEmptyPhotoMetadata());
    setShowResult(createEmptyShowResult());
    setShowLookupDate('');
    setActiveDate('');
    setShowSupplementalForm(false);
    setVenueConfirmedFromShow(false);
    setOverrideVenueName('');
    setOverrideCity('');
    setOverrideState('');
    setOverrideLatitude('');
    setOverrideLongitude('');
    setOverrideDate('');
    setOverrideTime('');
    setOverrideTags('');
    setLocationSearchResults([]);
    setLocationSearchMessage('');
    setAutocompleteSuggestions({ venues: [], cities: [], states: [] });
    setShowStartTime('19:30');
    setCurrentSongLabel('');
    setTimeContextLabel('');
    setCalibrationMetadata(null);
    setIsMatchSectionOpen(true);
    setIsSupplementalSectionOpen(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap justify-stretch sm:justify-end">
      <button
        type="button"
        onClick={clearCurrentPhotoAndStartOver}
        className="w-full rounded-lg border border-rose-500/60 px-3 py-2.5 text-xs font-medium text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/10 sm:w-auto"
      >
        Clear current photo and start over
      </button>
      </div>

    <ImageExifUploader
      key={`image-uploader-${uploaderSessionKey}`}
      onMetadataChange={setPhotoMetadata}
      matchedShowDate={effectiveShow?.date || ''}
      showStartTime={showStartTime}
      showData={effectiveShow}
      currentSongLabel={currentSongLabel}
      timeContextLabel={timeContextLabel}
      calibrationMetadata={calibrationMetadata}
    />

    <LiveModeController />

    {initialSharedPhoto ? (
      <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
        Shared photo received from your device share sheet: <strong>{initialSharedPhoto.fileName}</strong>
      </div>
    ) : null}

    {sharedImportHistory.length > 0 ? (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Recent shared imports</p>
        <ul className="mt-2 space-y-1 text-xs text-slate-300">
          {sharedImportHistory.map((entry, index) => (
            <li key={`${entry.fileName}-${entry.receivedAt}-${index}`} className="flex items-center justify-between gap-2">
              <span className="truncate">{entry.fileName}</span>
              <span className="text-slate-500">{formatSharedImportTimestamp(entry.receivedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : null}

    <AccordionSection
      title="Show matching"
      description="Search by date, confirm the show, and review the match."
      open={isMatchSectionOpen}
      onToggle={setIsMatchSectionOpen}
    >
      <div className="space-y-4">
        {statusMessage && !isLoadingShow ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            {statusMessage}
          </div>
        ) : null}

        {isLoadingShow ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            Looking up the matching Phish show...
          </div>
        ) : null}

        <form
          className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 sm:flex-row sm:items-end sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!showLookupDate) {
              setStatusMessage('Please select a date before searching.');
              return;
            }
            setActiveDate(showLookupDate);
          }}
        >
          <label className="flex-1 text-sm text-slate-300">
            Search by date
            <input
              type="date"
              value={showLookupDate}
              onChange={(event) => {
                const selectedDate = event.target.value;
                setShowLookupDate(selectedDate);
                if (!selectedDate) {
                  setStatusMessage('Please select a date before searching.');
                  return;
                }
                setActiveDate(selectedDate);
                setStatusMessage(`Looking up show for ${selectedDate}...`);
              }}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-cyan-500/50 focus:ring"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 sm:w-auto"
          >
            Find show
          </button>
        </form>

        {photoDerivedDate ? (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 sm:flex-row sm:flex-wrap sm:items-center">
            <span>
              Photo date detected: <strong className="text-white">{photoDerivedDate}</strong>
            </span>
            <button
              type="button"
              className="w-full rounded-md border border-slate-600 px-2 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto"
              onClick={() => {
                setShowLookupDate(photoDerivedDate);
                setActiveDate(photoDerivedDate);
                setStatusMessage(`Using photo date ${photoDerivedDate} for show search.`);
                setIsMatchSectionOpen(true);
              }}
              >
              Use photo date
              </button>
          </div>
        ) : null}

        {!hasEmbeddedGps && suggestedShow ? (
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-slate-200">
            <p className="text-sm">
              <strong>No GPS metadata found in this photo.</strong>
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Based on the photo date ({extractDateFromMetadata(photoMetadata) || 'unknown'}), was this taken at <strong>{suggestedShow.venueName || 'this venue'}</strong> in {suggestedShow.city || 'unknown city'}, {suggestedShow.state || 'unknown state'}?
            </p>
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                disabled={isSearchingLocation}
                className="w-full rounded-lg border border-cyan-500/60 px-3 py-2.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                onClick={lookupFromSuggestedVenue}
              >
                {isSearchingLocation ? 'Searching venue/city/state...' : 'Lookup by venue/city/state'}
              </button>
              <button
                type="button"
                className="w-full rounded-lg bg-cyan-500 px-3 py-2.5 text-xs font-medium text-slate-950 transition hover:bg-cyan-400 sm:w-auto"
                onClick={() => {
                  setVenueConfirmedFromShow(true);
                  openSupplementalSection();
                  setOverrideVenueName(suggestedShow.venueName || '');
                  setOverrideCity(suggestedShow.city || '');
                  setOverrideState(suggestedShow.state || '');
                  if (suggestedShow.latitude != null) {
                    setOverrideLatitude(String(suggestedShow.latitude));
                  }
                  if (suggestedShow.longitude != null) {
                    setOverrideLongitude(String(suggestedShow.longitude));
                  }
                  setStatusMessage('Show venue confirmed. You can edit metadata details below.');
                }}
              >
                Yes, confirm show
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-600 px-3 py-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto"
                onClick={openManualVenueSearch}
              >
                Search different venue / edit metadata
              </button>
            </div>
          </div>
        ) : null}

        {effectiveShow ? (
          <ShowMatchCard
            photoMetadata={effectivePhotoMetadata}
            show={effectiveShow}
            showStartTime={showStartTime}
            onShowStartTimeChange={(nextTime) => {
              setShowStartTime(nextTime);
            }}
            onTimeContextChange={(context) => {
              setCurrentSongLabel(context?.songLabel || '');
              setTimeContextLabel(context?.label || '');
            }}
            onCalibrationChange={(nextCalibrationMetadata) => {
              setCalibrationMetadata(nextCalibrationMetadata || null);
            }}
          />
        ) : null}

        {!suggestedShow && (nearbyShows.length > 0 || relatedDateShows.length > 0) ? (
          <div className="space-y-4">
            {nearbyShows.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-400">Nearby shows (within 6 days)</h3>
                <ul className="mt-3 space-y-2">
                  {nearbyShows.map((show) => (
                    <li key={`nearby-${show.date}-${show.venueName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-sm text-slate-200">
                        <p className="font-medium text-white">{show.venueName || 'Unknown venue'}</p>
                        <p className="text-xs text-slate-400">
                          {show.date} • {[show.city, show.state].filter(Boolean).join(', ') || 'Unknown location'}
                        </p>
                        <p className="text-xs text-cyan-300">{show.relationLabel || formatGapDaysLabel(show.dayOffset)}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                        onClick={() => {
                          setShowLookupDate(show.date);
                          setActiveDate(show.date);
                          setStatusMessage(`Using ${show.date} to fetch show details and setlist timing.`);
                          setIsMatchSectionOpen(true);
                        }}
                      >
                        Use this show date
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {relatedDateShows.length > 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-400">Same month/day in other years (or ±1 day)</h3>
                <ul className="mt-3 space-y-2">
                  {relatedDateShows.map((show) => (
                    <li key={`related-${show.date}-${show.venueName}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                      <div className="text-sm text-slate-200">
                        <p className="font-medium text-white">{show.venueName || 'Unknown venue'}</p>
                        <p className="text-xs text-slate-400">
                          {show.date} • {[show.city, show.state].filter(Boolean).join(', ') || 'Unknown location'}
                        </p>
                        <p className="text-xs text-cyan-300">{show.relationLabel || 'Related date match'}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                        onClick={() => {
                          setShowLookupDate(show.date);
                          setActiveDate(show.date);
                          setStatusMessage(`Using ${show.date} to fetch show details and setlist timing.`);
                          setIsMatchSectionOpen(true);
                        }}
                      >
                        Use this show date
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </AccordionSection>

    <AccordionSection
      title="Supplemental photo metadata"
      description="Add manual venue, location, or timestamp details when the file metadata is incomplete."
      open={isSupplementalSectionOpen}
      onToggle={setIsSupplementalSectionOpen}
      accent="amber"
    >
      <div ref={supplementalSectionRef}>
        <p className="text-xs text-slate-400">
          Add details manually when embedded EXIF/XMP location or timestamp is missing.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">
            Venue
            <input
              ref={supplementalVenueInputRef}
              list="venue-autocomplete-options"
              value={overrideVenueName}
              onChange={(e) => {
                setOverrideVenueName(e.target.value);
                applyVenueAutocompleteMatch(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-300">
            City
            <input
              list="city-autocomplete-options"
              value={overrideCity}
              onChange={(e) => {
                setOverrideCity(e.target.value);
                applyCityAutocompleteMatch(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-300">
            State
            <input list="state-autocomplete-options" value={overrideState} onChange={(e) => setOverrideState(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Latitude
            <input value={overrideLatitude} onChange={(e) => setOverrideLatitude(e.target.value)} placeholder="e.g. 40.7505" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Longitude
            <input value={overrideLongitude} onChange={(e) => setOverrideLongitude(e.target.value)} placeholder="e.g. -73.9934" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Date
            <input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300">
            Time
            <input type="time" value={supplementalTimeValue} onChange={(e) => setOverrideTime(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-slate-300 md:col-span-2">
            Tags (comma-separated)
            <input value={overrideTags} onChange={(e) => setOverrideTags(e.target.value)} placeholder="friends, lawn, opener set" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" />
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            disabled={isSearchingLocation}
            className="w-full rounded-lg border border-cyan-500/60 px-3 py-2.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            onClick={() => runVenueLocationLookup()}
          >
            {isSearchingLocation ? 'Searching venue/city/state...' : 'Lookup by venue/city/state'}
          </button>
          <button
            type="button"
            className="w-full rounded-lg bg-cyan-500 px-3 py-2.5 text-xs font-medium text-slate-950 transition hover:bg-cyan-400 sm:w-auto"
            onClick={() => {
              if (overrideDate) {
                setShowLookupDate(overrideDate);
                setActiveDate(overrideDate);
                setIsMatchSectionOpen(true);
              }
              setStatusMessage('Supplemental metadata saved for this photo.');
            }}
          >
            Save supplemental metadata
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-slate-600 px-3 py-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 sm:w-auto"
            onClick={() => {
              setVenueConfirmedFromShow(false);
              setOverrideVenueName('');
              setOverrideCity('');
              setOverrideState('');
              setOverrideLatitude('');
              setOverrideLongitude('');
              setOverrideDate(extractDateFromMetadata(photoMetadata) || '');
              setOverrideTime('');
              setOverrideTags('');
              setStatusMessage('Supplemental metadata cleared.');
            }}
          >
            Clear supplemental metadata
          </button>
        </div>

        {locationSearchMessage ? <p className="mt-3 text-xs text-slate-300">{locationSearchMessage}</p> : null}
        {isLoadingAutocomplete ? <p className="mt-2 text-xs text-slate-500">Loading venue/city/state suggestions...</p> : null}

        {locationSearchResults.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Venue/location matches</p>
            <ul className="mt-2 space-y-2">
              {locationSearchResults.map((match) => (
                <li key={`location-match-${match.date}-${match.venueName}-${match.city}-${match.state}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-xs text-slate-200">
                    <p className="font-medium text-white">{match.venueName || 'Unknown venue'}</p>
                    <p className="text-slate-400">
                      {match.date} • {[match.city, match.state].filter(Boolean).join(', ') || 'Unknown location'}
                    </p>
                    <p className="text-cyan-300">
                      Score {match.matchScore}
                      {formatVenueSearchGap(match.dayDifference) ? ` • ${formatVenueSearchGap(match.dayDifference)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
                    onClick={() => {
                      setOverrideVenueName(match.venueName || '');
                      setOverrideCity(match.city || '');
                      setOverrideState(match.state || '');
                      if (match.latitude != null) {
                        setOverrideLatitude(String(match.latitude));
                      }
                      if (match.longitude != null) {
                        setOverrideLongitude(String(match.longitude));
                      }
                      if (match.date) {
                        setOverrideDate(match.date);
                        setShowLookupDate(match.date);
                        setActiveDate(match.date);
                        setIsMatchSectionOpen(true);
                      }
                      setStatusMessage(`Using matched venue: ${match.venueName || 'Unknown venue'} (${match.date || 'unknown date'}).`);
                    }}
                  >
                    Use this match
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <datalist id="venue-autocomplete-options">
          {autocompleteSuggestions.venues.map((entry) => (
            <option
              key={`venue-option-${entry.venueName}-${entry.city}-${entry.state}`}
              value={entry.venueName}
              label={`${entry.city}, ${entry.state}${entry.count ? ` (${entry.count})` : ''}`}
            />
          ))}
        </datalist>
        <datalist id="city-autocomplete-options">
          {autocompleteSuggestions.cities.map((entry) => (
            <option
              key={`city-option-${entry.city}-${entry.state}`}
              value={entry.city}
              label={`${entry.state}${entry.count ? ` (${entry.count})` : ''}`}
            />
          ))}
        </datalist>
        <datalist id="state-autocomplete-options">
          {autocompleteSuggestions.states.map((entry) => (
            <option
              key={`state-option-${entry.state}`}
              value={entry.state}
              label={entry.count ? `(${entry.count})` : ''}
            />
          ))}
        </datalist>
      </div>
    </AccordionSection>
    </div>
  );
}
