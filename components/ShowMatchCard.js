'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getPhishInShowLinks } from '../app/actions/shows';
import { saveShowToLibrary, removeShowFromLibraryByDate } from '../app/actions/user-library';
import { buildSetlistSongTimeline, calibrateShowStartTime } from '../lib/show-start-time-calibration';

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function parseCoordinate(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }

  if (Array.isArray(value)) {
    const [degrees, minutes, seconds] = value;
    const degreeValue = parseCoordinate(degrees);
    const minuteValue = parseCoordinate(minutes);
    const secondValue = parseCoordinate(seconds);

    if (degreeValue === null || minuteValue === null || secondValue === null) {
      return null;
    }

    return degreeValue + minuteValue / 60 + secondValue / 3600;
  }

  if (value && typeof value === 'object') {
    if (typeof value.numerator === 'number' && typeof value.denominator === 'number') {
      return value.numerator / value.denominator;
    }

    if (value.value) {
      return parseCoordinate(value.value);
    }
  }

  return null;
}

function formatDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sourceLabel(source) {
  switch (source) {
    case 'exif':
      return 'EXIF';
    case 'xmp':
      return 'XMP';
    case 'iptc':
      return 'IPTC';
    case 'embedded':
      return 'Embedded';
    case 'sidecar':
      return 'Sidecar';
    case 'manual':
      return 'Manual';
    case 'show-confirmed':
      return 'Show Confirmed';
    case 'file-last-modified':
      return 'File Timestamp';
    default:
      return 'Unknown';
  }
}

function sourceConfidence(source) {
  switch (source) {
    case 'exif':
    case 'xmp':
    case 'iptc':
    case 'embedded':
      return { label: 'High', classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' };
    case 'manual':
    case 'show-confirmed':
    case 'sidecar':
      return { label: 'Medium', classes: 'border-amber-500/40 bg-amber-500/10 text-amber-300' };
    case 'file-last-modified':
      return { label: 'Low', classes: 'border-rose-500/40 bg-rose-500/10 text-rose-300' };
    default:
      return { label: 'Unknown', classes: 'border-slate-600 bg-slate-800/40 text-slate-300' };
  }
}

function getColorClasses(color) {
  switch (color) {
    case 'green':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    case 'yellow':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'red':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
    default:
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
  }
}

function parsePhotoDateTime(photoMetadata) {
  const date = typeof photoMetadata?.dateTimeOriginal === 'string' ? photoMetadata.dateTimeOriginal : null;
  const time = typeof photoMetadata?.timeTaken === 'string' && photoMetadata.timeTaken !== 'Not available' ? photoMetadata.timeTaken : null;
  if (date && date !== 'Not available') {
    const combined = `${date}T${time || '12:00:00'}`;
    const parsedFromFields = new Date(combined);
    if (!Number.isNaN(parsedFromFields.getTime())) {
      return parsedFromFields;
    }
  }

  const raw = photoMetadata?.rawDateTimeOriginal;
  if (raw) {
    let rawValue = String(raw).replace(' ', 'T');
    if (time && !/T\d{2}:\d{2}/.test(rawValue)) {
      rawValue = `${rawValue.split('T')[0]}T${time}`;
    }
    const parsedRaw = new Date(rawValue);
    if (!Number.isNaN(parsedRaw.getTime())) {
      return parsedRaw;
    }
  }

  return null;
}

function parseShowDate(show) {
  if (!show?.date) {
    return null;
  }

  const parsed = new Date(`${show.date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferBreakDurationMs(previousSetTitle, nextSetTitle) {
  if (!previousSetTitle || !nextSetTitle) {
    return 0;
  }

  if (nextSetTitle.toLowerCase().includes('encore')) {
    return 10 * 60 * 1000;
  }

  return 35 * 60 * 1000;
}

function buildSongTimeline(entries, showStart) {
  const normalizedEntries = entries.filter((entry) => entry.type && entry.label);
  if (!normalizedEntries.length) {
    return { segments: [], durationCoverage: 0 };
  }

  const songEntries = normalizedEntries.filter((entry) => entry.type !== 'set' && entry.type !== 'encore' && entry.type !== 'encores');
  if (!songEntries.length) {
    return { segments: [], durationCoverage: 0 };
  }

  const songsWithDuration = songEntries.filter((entry) => typeof entry.durationSeconds === 'number' && entry.durationSeconds > 0).length;
  const durationCoverage = songsWithDuration / songEntries.length;
  const fallbackDurationMs = 8 * 60 * 1000;
  const betweenSongsMs = 20 * 1000;
  const segments = [];
  let cursor = new Date(showStart.getTime());
  let currentSetTitle = null;

  normalizedEntries.forEach((entry) => {
    const isSetHeader = entry.type === 'set' || entry.type === 'encore' || entry.type === 'encores';
    if (isSetHeader) {
      if (currentSetTitle) {
        const breakDurationMs = inferBreakDurationMs(currentSetTitle, entry.label);
        if (breakDurationMs > 0) {
          const start = new Date(cursor.getTime());
          const end = new Date(cursor.getTime() + breakDurationMs);
          segments.push({
            type: 'break',
            label: `Break before ${entry.label}`,
            start,
            end,
          });
          cursor = end;
        }
      }
      currentSetTitle = entry.label;
      return;
    }

    const durationMs = typeof entry.durationSeconds === 'number' && entry.durationSeconds > 0
      ? entry.durationSeconds * 1000
      : fallbackDurationMs;
    const start = new Date(cursor.getTime());
    const end = new Date(cursor.getTime() + durationMs);
    segments.push({
      ...entry,
      type: 'song',
      setTitle: currentSetTitle,
      start,
      end,
    });
    cursor = new Date(end.getTime() + betweenSongsMs);
  });

  return { segments, durationCoverage };
}

function inferTimeContext(photoMetadata, show, setlistEntries, startTimeString = '19:30') {
  const photoDateTime = parsePhotoDateTime(photoMetadata);
  const showDate = parseShowDate(show);
  if (!photoDateTime || !showDate) {
    return null;
  }

  const diffHours = (photoDateTime.getTime() - showDate.getTime()) / (1000 * 60 * 60);
  if (Math.abs(diffHours) > 24) {
    return {
      phase: 'outside',
      label: 'Outside ±24h of show date',
      confidence: 'low',
      color: 'red',
      songContext: null,
    };
  }

  const showStart = new Date(`${show.date}T${startTimeString}:00`);
  const { segments, durationCoverage } = buildSongTimeline(setlistEntries, showStart);
  const showEnd = segments.length > 0
    ? new Date(segments[segments.length - 1].end.getTime())
    : new Date(`${show.date}T23:30:00`);

  const calculateConfidenceAndColor = (hasExactSongMatch) => {
    if (hasExactSongMatch && durationCoverage >= 0.8) {
      return { confidence: 'high', color: 'green' };
    }
    if (durationCoverage >= 0.5) {
      return { confidence: 'medium', color: 'yellow' };
    }
    return { confidence: 'low', color: 'red' };
  };

  if (photoDateTime < showStart) {
    return {
      phase: 'pre',
      label: 'Pre-show',
      confidence: 'medium',
      color: 'yellow',
      songContext: null,
    };
  }

  if (photoDateTime > showEnd) {
    return {
      phase: 'post',
      label: 'Post-show',
      confidence: 'medium',
      color: 'yellow',
      songContext: null,
    };
  }

  const songSegments = segments.filter((segment) => segment.type === 'song');
  const matchIndex = songSegments.findIndex(
    (segment) => photoDateTime >= segment.start && photoDateTime <= segment.end
  );

  if (matchIndex !== -1) {
    const currentSong = songSegments[matchIndex];
    const songBefore = songSegments[matchIndex - 1] || null;
    const songAfter = songSegments[matchIndex + 1] || null;

    const { confidence, color } = calculateConfidenceAndColor(true);

    return {
      phase: 'during',
      label: `Estimated song: ${currentSong.label}`,
      confidence,
      color,
      songLabel: currentSong.label,
      songContext: {
        previous: songBefore ? { label: songBefore.label, color: 'yellow' } : null,
        current: { label: currentSong.label, color },
        next: songAfter ? { label: songAfter.label, color: 'yellow' } : null,
      },
    };
  }

  const breakMatch = segments.find(
    (segment) => segment.type === 'break' && photoDateTime >= segment.start && photoDateTime <= segment.end
  );

  const { confidence, color } = calculateConfidenceAndColor(false);

  if (breakMatch) {
    return {
      phase: 'during',
      label: breakMatch.label,
      confidence,
      color,
      songContext: null,
    };
  }

  return {
    phase: 'during',
    label: 'During show (song estimate unavailable)',
    confidence,
    color: 'red',
    songContext: null,
  };
}

function formatSetlist(setlist = []) {
  if (!Array.isArray(setlist) || setlist.length === 0) {
    return [];
  }

  return setlist.map((entry) => {
    if (typeof entry === 'string') {
      return {
        label: entry,
        type: 'song',
      };
    }

    if (entry && typeof entry === 'object') {
      const rawLabel = entry.label || entry.title || entry.name || entry.song || entry.text || '';
      const type = entry.type || entry.section || entry.kind || 'song';
      const notes = entry.notes || entry.note || entry.footnote || '';
      return {
        label: rawLabel,
        type: String(type).toLowerCase(),
        notes: typeof notes === 'string' ? notes.trim() : '',
        durationSeconds: entry.durationSeconds,
      };
    }

    return {
      label: '',
      type: 'song',
      notes: '',
    };
  }).filter((entry) => entry.label);
}

function renderSetlist(entries, currentSongLabel) {
  if (!entries.length) {
    return <p className="text-sm text-slate-400">No setlist data available.</p>;
  }

  const sections = [];
  let activeSection = null;

  entries.forEach((entry) => {
    const isSectionHeader = entry.type === 'set' || entry.type === 'encore' || entry.type === 'encores';

    if (isSectionHeader) {
      activeSection = {
        title: entry.label,
        songs: [],
      };
      sections.push(activeSection);
      return;
    }

    if (!activeSection) {
      activeSection = {
        title: 'Setlist',
        songs: [],
      };
      sections.push(activeSection);
    }

    activeSection.songs.push(entry);
  });

  return (
    <div className="space-y-3">
      {sections.map((section, sectionIndex) => (
        <div key={`${section.title}-${sectionIndex}`} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-400">{section.title}</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-300">
            {section.songs.map((item, index) => {
              const isMatched = currentSongLabel && item.label.toLowerCase() === currentSongLabel.toLowerCase();
              return (
                <li key={`${section.title}-${index}`} className={`flex items-start gap-2 rounded-lg p-1 transition-colors ${isMatched ? 'bg-cyan-500/10 border border-cyan-500/30' : ''}`}>
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${isMatched ? 'bg-cyan-300 animate-pulse' : 'bg-cyan-500'}`} />
                  <span className="flex-1">
                    <span className={isMatched ? 'font-semibold text-cyan-200' : ''}>{item.label}</span>
                    {item.notes ? <span className="block text-xs text-slate-500">{item.notes}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function renderPhishInAudioMessage(phishInLinks) {
  const status = String(phishInLinks?.audioStatus || '').toLowerCase();
  if (!status) {
    return null;
  }

  if (status === 'missing') {
    return 'No audio is currently available for this show on phish.in.';
  }

  if (status === 'partial') {
    return 'Partial audio is available for this show on phish.in.';
  }

  if (status === 'complete') {
    return 'Complete audio is available for this show on phish.in.';
  }

  return null;
}

// Convert minutes past midnight (e.g. 1170) to formatted string "7:30 PM"
function formatMinutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
  return `${displayHours}:${displayMinutes} ${period}`;
}

// Convert minutes past midnight to "HH:MM" 24h string
function formatMinutesTo24h(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hStr = hours < 10 ? `0${hours}` : hours;
  const mStr = minutes < 10 ? `0${minutes}` : minutes;
  return `${hStr}:${mStr}`;
}

function parseTimeStringToMinutes(value) {
  if (typeof value !== 'string') {
    return 19 * 60 + 30;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return 19 * 60 + 30;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return 19 * 60 + 30;
  }

  return hours * 60 + minutes;
}

export default function ShowMatchCard({ photoMetadata, show, showStartTime = '19:30', onShowStartTimeChange, onTimeContextChange, onCalibrationChange, initialIsBookmarked = false }) {
  const [startMinutes, setStartMinutes] = useState(() => parseTimeStringToMinutes(showStartTime));
  const [snapSongIndex, setSnapSongIndex] = useState('');
  const [snapMessage, setSnapMessage] = useState('');
  const [calibrationSource, setCalibrationSource] = useState('manual-slider');
  const [calibrationSongLabel, setCalibrationSongLabel] = useState('');

  useEffect(() => {
    setStartMinutes(parseTimeStringToMinutes(showStartTime));
  }, [showStartTime]);

  const startTimeFormatted = useMemo(() => formatMinutesToTime(startMinutes), [startMinutes]);
  const startTime24h = useMemo(() => formatMinutesTo24h(startMinutes), [startMinutes]);

  // Use refs so the effects only re-fire when values change, not when callback
  // references change (which would cause an infinite render loop in callers).
  const onShowStartTimeChangeRef = useRef(onShowStartTimeChange);
  onShowStartTimeChangeRef.current = onShowStartTimeChange;
  useEffect(() => {
    onShowStartTimeChangeRef.current?.(startTime24h);
  }, [startTime24h]);

  const locationVerified = useMemo(() => {
    const photoLat = parseCoordinate(photoMetadata?.rawGpsLatitude ?? photoMetadata?.gpsLatitude);
    const photoLon = parseCoordinate(photoMetadata?.rawGpsLongitude ?? photoMetadata?.gpsLongitude);
    const venueLat = parseCoordinate(show?.latitude || show?.lat || show?.venueLatitude || show?.venue_lat);
    const venueLon = parseCoordinate(show?.longitude || show?.lon || show?.venueLongitude || show?.venue_lon);

    if (photoLat === null || photoLon === null || venueLat === null || venueLon === null) {
      return false;
    }

    return haversineMiles(photoLat, photoLon, venueLat, venueLon) <= 5;
  }, [photoMetadata, show]);

  const setlistEntries = useMemo(() => formatSetlist(show?.setlist), [show]);
  const photoTimestamp = useMemo(() => parsePhotoDateTime(photoMetadata), [photoMetadata]);
  const setlistSongTimeline = useMemo(() => buildSetlistSongTimeline(setlistEntries), [setlistEntries]);
  const defaultCalibration = useMemo(
    () => calibrateShowStartTime(photoTimestamp, setlistEntries),
    [photoTimestamp, setlistEntries]
  );
  const dateSource = photoMetadata?.dateSource || 'unknown';
  const timeSource = photoMetadata?.timeSource || dateSource || 'unknown';
  const gpsSource = photoMetadata?.gpsSource || photoMetadata?.locationSource || 'unknown';
  const dateConfidence = sourceConfidence(dateSource);
  const timeConfidence = sourceConfidence(timeSource);
  const gpsConfidence = sourceConfidence(gpsSource);

  const timeContext = useMemo(
    () => inferTimeContext(photoMetadata, show, setlistEntries, startTime24h),
    [photoMetadata, show, setlistEntries, startTime24h]
  );

  useEffect(() => {
    if (!defaultCalibration || showStartTime !== '19:30') {
      return;
    }

    setStartMinutes(defaultCalibration.showStartMinutes);
    setCalibrationSource(defaultCalibration.calibrationSource || 'typical-delay');
    setCalibrationSongLabel(defaultCalibration.matchedSongLabel || '');
    setSnapMessage(`Calibrated from EXIF using typical timing near ${defaultCalibration.matchedSongLabel}.`);
  }, [defaultCalibration, showStartTime]);

  const onTimeContextChangeRef = useRef(onTimeContextChange);
  onTimeContextChangeRef.current = onTimeContextChange;
  useEffect(() => {
    onTimeContextChangeRef.current?.(timeContext || null);
  }, [timeContext]);

  const onCalibrationChangeRef = useRef(onCalibrationChange);
  onCalibrationChangeRef.current = onCalibrationChange;
  useEffect(() => {
    const confidence = calibrationSource === 'snap-to-song'
      ? 'high'
      : calibrationSource === 'typical-delay'
        ? 'medium'
        : 'low';

    onCalibrationChangeRef.current?.({
      source: calibrationSource,
      confidence,
      matchedSongLabel: calibrationSongLabel || timeContext?.songLabel || null,
      showStartTime: startTime24h,
    });
  }, [calibrationSource, calibrationSongLabel, timeContext?.songLabel, startTime24h]);

  const [phishInLinks, setPhishInLinks] = useState({
    showUrl: null,
    songUrl: null,
    songTitle: null,
    audioStatus: null,
    error: null,
    loading: false,
  });
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [bookmarkStatus, setBookmarkStatus] = useState(null);
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked);

  const handleBookmarkToggle = async () => {
    if (!show?.date) return;

    setIsBookmarking(true);
    setBookmarkStatus(null);

    if (isBookmarked) {
      const res = await removeShowFromLibraryByDate(show.date);
      if (res.success) {
        setIsBookmarked(false);
        setBookmarkStatus({ type: 'success', text: 'Bookmark removed.' });
      } else {
        setBookmarkStatus({ type: 'error', text: res.error || 'Failed to remove bookmark.' });
      }
    } else {
      const res = await saveShowToLibrary(
        show.date,
        {
          venue: show.venueName,
          city: show.city,
          state: show.state,
          location: [show.city, show.state].filter(Boolean).join(', '),
          setlistNotes: show.setlistNotes,
        },
        ''
      );
      if (res.success) {
        setIsBookmarked(true);
        setBookmarkStatus({ type: 'success', text: 'Show bookmarked!' });
      } else {
        setBookmarkStatus({ type: 'error', text: res.error || 'Failed to bookmark show.' });
      }
    }

    setIsBookmarking(false);
  };

  const phishInAudioMessage = useMemo(() => renderPhishInAudioMessage(phishInLinks), [phishInLinks]);

  useEffect(() => {
    if (!show?.date) {
      setPhishInLinks({
        showUrl: null,
        songUrl: null,
        songTitle: null,
        audioStatus: null,
        error: null,
        loading: false,
      });
      return;
    }

    let isActive = true;
    setPhishInLinks((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    getPhishInShowLinks({ dateString: show.date, songTitle: timeContext?.songLabel || null })
      .then((result) => {
        if (!isActive) {
          return;
        }
        setPhishInLinks({
          showUrl: result?.showUrl || null,
          songUrl: result?.songUrl || null,
          songTitle: result?.songTitle || null,
          audioStatus: result?.audioStatus || null,
          error: result?.error || null,
          loading: false,
        });
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setPhishInLinks({
          showUrl: null,
          songUrl: null,
          songTitle: null,
          audioStatus: null,
          error: 'Unable to load Phish.in links right now.',
          loading: false,
        });
      });

    return () => {
      isActive = false;
    };
  }, [show?.date, timeContext?.songLabel]);

  const applyAutoCalibration = () => {
    if (!defaultCalibration) {
      return;
    }

    setStartMinutes(defaultCalibration.showStartMinutes);
    setCalibrationSource(defaultCalibration.calibrationSource || 'typical-delay');
    setCalibrationSongLabel(defaultCalibration.matchedSongLabel || '');
    setSnapMessage(`Calibrated from EXIF using typical timing near ${defaultCalibration.matchedSongLabel}.`);
  };

  const handleSnapToSong = (value) => {
    setSnapSongIndex(value);
    setSnapMessage('');

    if (!photoTimestamp || value === '') {
      return;
    }

    const nextSongIndex = Number(value);
    if (Number.isNaN(nextSongIndex)) {
      return;
    }

    const snapResult = calibrateShowStartTime(photoTimestamp, setlistEntries, {
      targetSongIndex: nextSongIndex,
      roundToMinutes: 1,
    });

    if (!snapResult) {
      return;
    }

    setStartMinutes(snapResult.showStartMinutes);
    setCalibrationSource('snap-to-song');
    setCalibrationSongLabel(snapResult.matchedSongLabel || '');
    setSnapMessage(`Snapped to ${snapResult.matchedSongLabel}.`);
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-400">Show match</p>
            {show?.date && (
              <button
                onClick={handleBookmarkToggle}
                disabled={isBookmarking}
                className={`flex items-center space-x-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 ${
                  isBookmarked
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400'
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" stroke="currentColor"
                  fill={isBookmarked ? 'currentColor' : 'none'}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span>
                  {isBookmarking
                    ? (isBookmarked ? 'Removing…' : 'Saving…')
                    : (isBookmarked ? 'Bookmarked' : 'Bookmark Show')}
                </span>
              </button>
            )}
          </div>

          {bookmarkStatus && (
            <div className={`mt-2 rounded-xl border p-2 text-xs font-medium ${
              bookmarkStatus.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}>
              {bookmarkStatus.text}
            </div>
          )}

          <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">{show?.venueName || 'Unknown venue'}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {show?.city || 'Unknown city'}, {show?.state || 'Unknown state'} • {formatDate(show?.date)}
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${dateConfidence.classes}`}>
              Date source: {sourceLabel(dateSource)} ({dateConfidence.label})
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${timeConfidence.classes}`}>
              Time source: {sourceLabel(timeSource)} ({timeConfidence.label})
            </span>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${gpsConfidence.classes}`}>
              Location source: {sourceLabel(gpsSource)} ({gpsConfidence.label})
            </span>
            {timeContext ? (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getColorClasses(timeContext.color)}`}>
                {timeContext.label} ({timeContext.confidence} confidence)
              </span>
            ) : null}
          </div>

          {/* Start Time Adjuster & Visual Indicator Slider */}
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
            <p className="text-xs text-slate-300">
              This is based on an estimated start time of: <span className="font-semibold text-cyan-300">{startTimeFormatted}</span>. Use slider to adjust.
            </p>

            {defaultCalibration ? (
              <p className="mt-2 text-xs text-slate-400">
                Auto estimate from EXIF suggests <span className="font-semibold text-cyan-300">{defaultCalibration.showStartTime}</span> around {defaultCalibration.matchedSongLabel}.
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-slate-500 font-mono">5:00 PM</span>
              <input
                type="range"
                min={17 * 60} // 5:00 PM
                max={22 * 60} // 10:00 PM
                step={5}      // 5-minute increments
                value={startMinutes}
                onChange={(e) => {
                  setStartMinutes(Number(e.target.value));
                  setCalibrationSource('manual-slider');
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-400"
              />
              <span className="text-xs text-slate-500 font-mono">10:00 PM</span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="text-xs text-slate-300">
                Snap photo to song
                <select
                  value={snapSongIndex}
                  onChange={(event) => handleSnapToSong(event.target.value)}
                  disabled={!photoTimestamp || setlistSongTimeline.length === 0}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Choose a song…</option>
                  {setlistSongTimeline.map((song) => (
                    <option key={`snap-song-${song.index}-${song.label}`} value={song.index}>
                      {song.index + 1}. {song.label} ({song.setLabel})
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={applyAutoCalibration}
                disabled={!defaultCalibration}
                className="self-end rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-calibrate
              </button>
            </div>

            {snapMessage ? <p className="mt-2 text-xs text-cyan-300">{snapMessage}</p> : null}

            {/* Visual Indicator of Photo Phase */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Photo Position:</span>
                {timeContext?.phase === 'pre' && (
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                    Pre-Show
                  </span>
                )}
                {timeContext?.phase === 'during' && (
                  <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-300">
                    During Show ({timeContext.songLabel || 'Live'})
                  </span>
                )}
                {timeContext?.phase === 'post' && (
                  <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">
                    Post-Show
                  </span>
                )}
                {timeContext?.phase === 'outside' && (
                  <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-300">
                    Outside Show Window
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Song Neighborhood View (Song Before -> Song Match -> Song After) */}
          {timeContext?.songContext && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
              {timeContext.songContext.previous && (
                <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs opacity-75 ${getColorClasses(timeContext.songContext.previous.color)}`}>
                  ← Prev: {timeContext.songContext.previous.label}
                </span>
              )}

              <span className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold ${getColorClasses(timeContext.songContext.current.color)}`}>
                Now: {timeContext.songContext.current.label}
              </span>

              {timeContext.songContext.next && (
                <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs opacity-75 ${getColorClasses(timeContext.songContext.next.color)}`}>
                  Next: {timeContext.songContext.next.label} →
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1 text-xs text-cyan-300">
            {show?.phishNetUrl ? (
              <a href={show.phishNetUrl} target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                Open this show on phish.net
              </a>
            ) : null}
            {phishInLinks.loading ? <span className="text-slate-400">Loading Phish.in links...</span> : null}
            {!phishInLinks.loading && !phishInLinks.error && !phishInLinks.showUrl ? (
              <span className="text-amber-300">No phish.in show page was found for this date.</span>
            ) : null}
            {phishInLinks.showUrl ? (
              <a href={phishInLinks.showUrl} target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                Open this show on phish.in
              </a>
            ) : null}
            {timeContext?.songLabel && phishInLinks.songUrl ? (
              <a href={phishInLinks.songUrl} target="_blank" rel="noreferrer" className="underline hover:text-cyan-200">
                Open estimated song on phish.in ({phishInLinks.songTitle || timeContext.songLabel})
              </a>
            ) : null}
            {!phishInLinks.loading && !phishInLinks.error && timeContext?.songLabel && phishInLinks.showUrl && !phishInLinks.songUrl ? (
              <span className="text-slate-400">A matching track link was not found for the estimated song on phish.in.</span>
            ) : null}
            {phishInAudioMessage ? <span className="text-amber-300">{phishInAudioMessage}</span> : null}
            {phishInLinks.error ? <span className="text-amber-300">{phishInLinks.error}</span> : null}
          </div>
        </div>
        {locationVerified ? (
          <span className="inline-flex items-center self-start rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-300">
            Location Verified
          </span>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Photo metadata</p>
          <dl className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Date</dt>
              <dd className="sm:text-right">{photoMetadata?.dateTimeOriginalDisplay || photoMetadata?.dateTimeOriginal || 'Unknown'}</dd>
            </div>
            {photoMetadata?.timeTaken ? (
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-slate-500">Time</dt>
                <dd className="sm:text-right">{photoMetadata.timeTaken}</dd>
              </div>
            ) : null}
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Show start time</dt>
              <dd className="sm:text-right">{showStartTime || '19:30'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Latitude</dt>
              <dd className="break-all sm:text-right">{photoMetadata?.gpsLatitude || 'Unknown'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Longitude</dt>
              <dd className="break-all sm:text-right">{photoMetadata?.gpsLongitude || 'Unknown'}</dd>
            </div>
            {photoMetadata?.locationSource ? (
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-slate-500">Location source</dt>
                <dd className="sm:text-right">{photoMetadata.locationSource}</dd>
              </div>
            ) : null}
            {Array.isArray(photoMetadata?.userTags) && photoMetadata.userTags.length > 0 ? (
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-slate-500">Tags</dt>
                <dd className="break-words sm:text-right">{photoMetadata.userTags.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Show details</p>
          <dl className="mt-3 space-y-2 text-sm text-slate-300">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Venue</dt>
              <dd className="sm:text-right">{show?.venueName || 'Unknown'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Location</dt>
              <dd className="sm:text-right">{[show?.city, show?.state].filter(Boolean).join(', ') || 'Unknown'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-slate-500">Date</dt>
              <dd className="sm:text-right">{formatDate(show?.date)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Setlist</p>
        <div className="mt-3">{renderSetlist(setlistEntries, timeContext?.songLabel)}</div>
        {show?.setlistNotes ? (
          <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
            {show.setlistNotes}
          </p>
        ) : null}
      </div>
    </div>
  );
}