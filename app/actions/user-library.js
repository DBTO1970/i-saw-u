'use server';

import { createClient } from '../../lib/supabase/server';
import { createHash } from 'crypto';

function toObjectOrEmpty(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function applyShowMetadata(rawExifValue, matchedShowDate, showStartTime) {
  const nextRawExif = { ...toObjectOrEmpty(rawExifValue) };
  const nextShowMetadata = {
    ...toObjectOrEmpty(nextRawExif.showMetadata),
    matchedShowDate: matchedShowDate || null,
    showStartTime: showStartTime || null,
  };

  nextRawExif.showMetadata = nextShowMetadata;
  nextRawExif.showStartTime = showStartTime || null;
  nextRawExif.matchedShowDate = matchedShowDate || null;

  return nextRawExif;
}

function normalizePhotoVisibility(photo) {
  if (!photo) {
    return false;
  }

  if (typeof photo.is_public === 'boolean') {
    return photo.is_public;
  }

  const rawExifValue = toObjectOrEmpty(photo.raw_exif);
  const visibilityCandidates = [
    rawExifValue.is_public,
    rawExifValue.isPublic,
    rawExifValue.visibility,
  ];

  for (const candidate of visibilityCandidates) {
    if (typeof candidate === 'boolean') {
      return candidate;
    }

    if (typeof candidate === 'string') {
      const normalizedValue = candidate.toLowerCase();
      if (normalizedValue === 'public' || normalizedValue === 'true') {
        return true;
      }
      if (normalizedValue === 'private' || normalizedValue === 'false') {
        return false;
      }
    }
  }

  return false;
}

function withNormalizedVisibility(photo) {
  if (!photo) {
    return photo;
  }

  return {
    ...photo,
    is_public: normalizePhotoVisibility(photo),
  };
}

function buildVisibilityAwareRawExif(rawExifValue, isPublic) {
  const nextRawExif = { ...toObjectOrEmpty(rawExifValue) };
  nextRawExif.is_public = !!isPublic;
  nextRawExif.isPublic = !!isPublic;
  nextRawExif.visibility = isPublic ? 'public' : 'private';
  return nextRawExif;
}

async function verifyPhotoRecordExists(supabase, userId, photoId) {
  const { data, error } = await supabase
    .from('photos')
    .select('id')
    .eq('id', photoId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return true;
}

function isVisibilitySchemaError(error) {
  const message = error?.message || '';
  return (
    message.includes("Could not find the 'is_public' column") ||
    message.includes('schema cache') ||
    (message.includes('column') && message.includes('is_public'))
  );
}

function visibilitySchemaMissingMessage(error) {
  if (isVisibilitySchemaError(error)) {
    return 'Your Supabase database is missing the photos.is_public column. Apply migration 03_add_public_photo_visibility.sql, then refresh the schema cache.';
  }
  return null;
}

function normalizePhotoHash(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function isPhotoHashDuplicateError(error) {
  const code = error?.code || '';
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '23505' && (
      message.includes('idx_photos_user_photo_hash_unique') ||
      message.includes('(user_id, photo_hash)')
    )
  );
}

async function removeStorageObjectSafely(supabase, storagePath) {
  if (!storagePath) {
    return;
  }
  try {
    await supabase.storage.from('user-photos').remove([storagePath]);
  } catch (error) {
    console.error('Storage cleanup failed after photo save error:', {
      storagePath,
      error,
    });
  }
}

/**
 * Save photo & metadata to user library and Supabase Storage
 */
export async function savePhotoToLibrary(formData) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User is not authenticated.' };
    }

    const file = formData.get('file');
    const fileName = formData.get('fileName') || 'photo.webp';
    const dateTaken = formData.get('dateTaken') || null;
    const timeTaken = formData.get('timeTaken') || null;
    const gpsLatitudeRaw = formData.get('gpsLatitude');
    const gpsLongitudeRaw = formData.get('gpsLongitude');
    const matchedShowDate = formData.get('matchedShowDate') || null;
    const showStartTimeRaw = formData.get('showStartTime');
    const showStartTime = typeof showStartTimeRaw === 'string' && /^\d{2}:\d{2}$/.test(showStartTimeRaw)
      ? showStartTimeRaw
      : null;
    const rawExifJson = formData.get('rawExif') || '{}';
    const parsedRawExif = applyShowMetadata(JSON.parse(rawExifJson), matchedShowDate, showStartTime);
    const submittedPhotoHash = normalizePhotoHash(formData.get('photoHash'));
    const directStoragePath = formData.get('storagePath');
    const directPhotoId = formData.get('photoId');
    const directMimeType = formData.get('mimeType');
    const directFileSizeRaw = formData.get('fileSize');

    const hasServerUploadFile = file && typeof file !== 'string';
    const hasDirectUploadMetadata = typeof directStoragePath === 'string' && typeof directPhotoId === 'string';

    if (!hasServerUploadFile && !hasDirectUploadMetadata) {
      return { success: false, error: 'No image file or direct upload metadata provided.' };
    }

    let photoId = hasDirectUploadMetadata ? directPhotoId : crypto.randomUUID();
    let storagePath = hasDirectUploadMetadata ? directStoragePath : `${user.id}/${photoId}.webp`;
    let mimeType = hasDirectUploadMetadata && typeof directMimeType === 'string' && directMimeType.trim()
      ? directMimeType.trim()
      : 'image/webp';
    let fileSize = null;
    let photoHash = submittedPhotoHash;

    if (!storagePath.startsWith(`${user.id}/`)) {
      return { success: false, error: 'Invalid storage path for authenticated user.' };
    }

    if (hasServerUploadFile) {
      // Legacy path: server-side upload through Vercel route.
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      photoHash = createHash('sha256').update(buffer).digest('hex');

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(storagePath, buffer, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage Upload Error:', uploadError);
        return { success: false, error: uploadError.message };
      }

      fileSize = buffer.length;
      mimeType = 'image/webp';
    } else {
      const parsedSize = Number(directFileSizeRaw);
      fileSize = Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : null;
      if (!photoHash) {
        return { success: false, error: 'Missing photo hash for duplicate detection.' };
      }
    }

    const baseInsertPayload = {
      id: photoId,
      user_id: user.id,
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      date_taken: toNullableDate(dateTaken),
      time_taken: toNullableTime(timeTaken),
      gps_latitude: gpsLatitudeRaw ? (Number.isFinite(parseFloat(gpsLatitudeRaw)) ? parseFloat(gpsLatitudeRaw) : null) : null,
      gps_longitude: gpsLongitudeRaw ? (Number.isFinite(parseFloat(gpsLongitudeRaw)) ? parseFloat(gpsLongitudeRaw) : null) : null,
      photo_hash: photoHash,
      matched_show_date: toNullableDate(matchedShowDate),
      show_start_time: showStartTime,
      raw_exif: buildVisibilityAwareRawExif(parsedRawExif, false),
      is_public: false,
    };

    // 2. Insert record into 'photos' database table
    const { data: photoRecord, error: dbError } = await supabase
      .from('photos')
      .insert(baseInsertPayload)
      .select()
      .single();

    if (dbError && isVisibilitySchemaError(dbError)) {
      const fallbackPayload = { ...baseInsertPayload };
      delete fallbackPayload.is_public;
      const { data: fallbackPhotoRecord, error: fallbackDbError } = await supabase
        .from('photos')
        .insert(fallbackPayload)
        .select()
        .single();

      if (fallbackDbError && isPhotoHashDuplicateError(fallbackDbError)) {
        await removeStorageObjectSafely(supabase, storagePath);
        const { data: existingPhoto } = await supabase
          .from('photos')
          .select('id')
          .eq('user_id', user.id)
          .eq('photo_hash', photoHash)
          .maybeSingle();
        return {
          success: false,
          errorCode: 'duplicate_photo',
          duplicatePhotoId: existingPhoto?.id || null,
          error: 'This photo has already been uploaded to your library.',
        };
      }

      if (fallbackDbError) {
        await removeStorageObjectSafely(supabase, storagePath);
        console.error('DB Insert Error:', fallbackDbError);
        return { success: false, error: fallbackDbError.message };
      }

      const createdPhotoId = fallbackPhotoRecord?.id || photoId;
      const exists = await verifyPhotoRecordExists(supabase, user.id, createdPhotoId);
      if (!exists) {
        return { success: false, error: 'Photo saved to storage, but library record was not found.' };
      }

      await autoBookmarkShow(supabase, user.id, matchedShowDate, parsedRawExif);
      return { success: true, photoId: createdPhotoId };
    }

    if (dbError) {
      if (isPhotoHashDuplicateError(dbError)) {
        await removeStorageObjectSafely(supabase, storagePath);
        const { data: existingPhoto } = await supabase
          .from('photos')
          .select('id')
          .eq('user_id', user.id)
          .eq('photo_hash', photoHash)
          .maybeSingle();
        return {
          success: false,
          errorCode: 'duplicate_photo',
          duplicatePhotoId: existingPhoto?.id || null,
          error: 'This photo has already been uploaded to your library.',
        };
      }
      await removeStorageObjectSafely(supabase, storagePath);
      console.error('DB Insert Error:', dbError);
      return { success: false, error: dbError.message };
    }

    const createdPhotoId = photoRecord?.id || photoId;
    const exists = await verifyPhotoRecordExists(supabase, user.id, createdPhotoId);
    if (!exists) {
      return { success: false, error: 'Photo saved to storage, but library record was not found.' };
    }

    await autoBookmarkShow(supabase, user.id, matchedShowDate, parsedRawExif);
    return { success: true, photoId: createdPhotoId };
  } catch (error) {
    console.error('savePhotoToLibrary Error:', error);
    return { success: false, error: error.message || 'Failed to save photo.' };
  }
}

/**
 * Silently upsert a show bookmark when a photo with a matched show date is saved.
 * Only inserts — existing bookmarks (with user notes etc.) are left untouched.
 */
async function autoBookmarkShow(supabase, userId, matchedShowDate, rawExif) {
  if (!matchedShowDate) {
    return;
  }

  try {
    const showMetadata = toObjectOrEmpty(toObjectOrEmpty(rawExif)?.showMetadata);
    const showData = toObjectOrEmpty(showMetadata?.showData);
    const venueName = showMetadata?.venueName || showData?.venueName || null;
    const city = showMetadata?.city || showData?.city || null;
    const state = showMetadata?.state || showData?.state || null;
    const location = [city, state].filter(Boolean).join(', ') || null;

    await supabase
      .from('saved_shows')
      .upsert(
        {
          user_id: userId,
          show_date: matchedShowDate,
          venue_name: venueName,
          location: location,
          show_data: Object.keys(showData).length > 0 ? showData : {},
          user_notes: '',
        },
        { onConflict: 'user_id,show_date', ignoreDuplicates: true }
      );
  } catch (error) {
    console.error('autoBookmarkShow Error:', error);
  }
}

/**
 * Save or update a show in the user's library
 */
export async function saveShowToLibrary(showDate, showData, userNotes = '') {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User is not authenticated.' };
    }

    const { data, error } = await supabase
      .from('saved_shows')
      .upsert({
        user_id: user.id,
        show_date: showDate,
        venue_name: showData?.venue || showData?.venue_name || null,
        location: showData?.location || null,
        show_data: showData || {},
        user_notes: userNotes,
      }, { onConflict: 'user_id,show_date' })
      .select()
      .single();

    if (error) {
      console.error('Save Show DB Error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, show: data };
  } catch (error) {
    console.error('saveShowToLibrary Error:', error);
    return { success: false, error: error.message || 'Failed to save show.' };
  }
}

/**
 * Fetch all photos saved in the user's library
 */
export async function getUserLibraryPhotos() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photos: [], error: 'User not authenticated' };
    }

    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { photos: [], error: error.message };
    }

    const normalizedPhotos = (photos || []).map(withNormalizedVisibility);
    const photoIds = normalizedPhotos.map((photo) => photo.id);
    let likeCountByPhoto = new Map();

    if (photoIds.length > 0) {
      const { data: likeRows, error: likeError } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .in('photo_id', photoIds);

      if (!likeError) {
        likeCountByPhoto = new Map();
        (likeRows || []).forEach((row) => {
          likeCountByPhoto.set(row.photo_id, (likeCountByPhoto.get(row.photo_id) || 0) + 1);
        });
      }
    }

    // Generate signed URLs for private photos
    const photosWithUrls = await Promise.all(
      normalizedPhotos.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(photo.storage_path, 60 * 60); // 1 hour valid link
        return {
          ...photo,
          url: signedData?.signedUrl || null,
          like_count: likeCountByPhoto.get(photo.id) || 0,
        };
      })
    );

    return { photos: photosWithUrls, error: null };
  } catch (error) {
    return { photos: [], error: error.message };
  }
}

/**
 * Fetch one photo from the user's library
 */
export async function getUserLibraryPhotoById(photoId) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photo: null, error: 'User not authenticated' };
    }

    const { data: photo, error } = await supabase
      .from('photos')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', user.id)
      .single();

    if (error || !photo) {
      return { photo: null, error: error?.message || 'Photo not found' };
    }

    const { data: signedData } = await supabase.storage
      .from('user-photos')
      .createSignedUrl(photo.storage_path, 60 * 60);

    const { count: likeCount } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', photo.id);

    return {
      photo: {
        ...withNormalizedVisibility(photo),
        url: signedData?.signedUrl || null,
        like_count: likeCount || 0,
      },
      error: null,
    };
  } catch (error) {
    return { photo: null, error: error.message };
  }
}

/**
 * Fetch adjacent photo IDs (newer/older) around a photo in the user's library order.
 */
export async function getUserLibraryPhotoSiblings(photoId) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { previousPhotoId: null, nextPhotoId: null, error: 'User not authenticated' };
    }

    const { data: rows, error } = await supabase
      .from('photos')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { previousPhotoId: null, nextPhotoId: null, error: error.message };
    }

    const ids = (rows || []).map((row) => row.id);
    const currentIndex = ids.findIndex((id) => id === photoId);
    if (currentIndex < 0) {
      return { previousPhotoId: null, nextPhotoId: null, error: 'Photo not found' };
    }

    return {
      previousPhotoId: currentIndex > 0 ? ids[currentIndex - 1] : null,
      nextPhotoId: currentIndex < ids.length - 1 ? ids[currentIndex + 1] : null,
      error: null,
    };
  } catch (error) {
    return { previousPhotoId: null, nextPhotoId: null, error: error.message };
  }
}

function toNullableText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function toNullableDate(value) {
  const trimmed = toNullableText(value);
  if (!trimmed) {
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function toNullableTime(value) {
  const trimmed = toNullableText(value);
  if (!trimmed) {
    return null;
  }
  return /^\d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? trimmed : null;
}

function toNullableFloat(value) {
  const trimmed = toNullableText(value);
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Update editable metadata on a photo
 */
export async function updateUserLibraryPhotoMetadata(photoId, payload) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const rawExifText = typeof payload?.rawExif === 'string' ? payload.rawExif.trim() : '';
    let rawExifValue = {};
    if (rawExifText) {
      rawExifValue = JSON.parse(rawExifText);
    }

    const updates = {
      show_start_time: toNullableTime(payload?.showStartTime),
      matched_show_date: toNullableDate(payload?.matchedShowDate),
    };

    const updatesWithRawExif = {
      file_name: toNullableText(payload?.fileName) || 'Untitled photo',
      date_taken: toNullableDate(payload?.dateTaken),
      time_taken: toNullableTime(payload?.timeTaken),
      show_start_time: updates.show_start_time,
      matched_show_date: updates.matched_show_date,
      gps_latitude: toNullableFloat(payload?.gpsLatitude),
      gps_longitude: toNullableFloat(payload?.gpsLongitude),
      raw_exif: applyShowMetadata(rawExifValue, updates.matched_show_date, updates.show_start_time),
    };

    const { data, error } = await supabase
      .from('photos')
      .update(updatesWithRawExif)
      .eq('id', photoId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to update photo metadata.' };
    }

    return { success: true, photo: data };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to update photo metadata.' };
  }
}

/**
 * Fetch all shows saved in the user's library
 */
export async function getUserSavedShows() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { shows: [], error: 'User not authenticated' };
    }

    const { data: shows, error } = await supabase
      .from('saved_shows')
      .select('*')
      .eq('user_id', user.id)
      .order('show_date', { ascending: false });

    if (error) {
      return { shows: [], error: error.message };
    }

    let publicPhotoCounts = new Map();
    const { data: publicPhotoRows, error: publicPhotoError } = await supabase
      .from('photos')
      .select('matched_show_date, user_id, is_public, raw_exif');

    if (!publicPhotoError) {
      (publicPhotoRows || []).forEach((row) => {
        const normalizedRow = withNormalizedVisibility(row);
        if (!normalizedRow.matched_show_date || normalizedRow.user_id === user.id || normalizedRow.is_public !== true) {
          return;
        }
        publicPhotoCounts.set(normalizedRow.matched_show_date, (publicPhotoCounts.get(normalizedRow.matched_show_date) || 0) + 1);
      });
    }

    const showsWithCounts = (shows || []).map((show) => ({
      ...show,
      public_photo_count: publicPhotoCounts.get(show.show_date) || 0,
    }));

    return { shows: showsWithCounts, error: null };
  } catch (error) {
    return { shows: [], error: error.message };
  }
}

/**
 * Fetch Phish shows that recently received public fan photos from other users.
 * Not limited to the user's bookmarked shows — any matched show with public photos qualifies.
 */
export async function getRecentFanPhotoShows(limit = 8) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { shows: [], error: 'User not authenticated' };
    }

    // Fetch all public photos from other users that are matched to a Phish show
    const { data: photoRows, error: photoRowsError } = await supabase
      .from('photos')
      .select('*')
      .neq('user_id', user.id)
      .not('matched_show_date', 'is', null)
      .order('created_at', { ascending: false });

    if (photoRowsError) {
      return { shows: [], error: visibilitySchemaMissingMessage(photoRowsError) || photoRowsError.message };
    }

    // Fetch the current user's saved shows for venue info enrichment
    const { data: savedShows } = await supabase
      .from('saved_shows')
      .select('show_date, venue_name, location')
      .eq('user_id', user.id);

    const savedShowMap = new Map((savedShows || []).map((s) => [s.show_date, s]));

    // Group public photos by show date
    const statsByShowDate = new Map();
    (photoRows || []).forEach((photoRow) => {
      const normalizedPhoto = withNormalizedVisibility(photoRow);
      if (!normalizedPhoto?.matched_show_date || normalizedPhoto.is_public !== true) {
        return;
      }

      const showDate = normalizedPhoto.matched_show_date;
      const current = statsByShowDate.get(showDate) || {
        show_date: showDate,
        venue_name: null,
        location: null,
        new_public_photo_count: 0,
        latest_public_photo_at: null,
        _firstPhoto: normalizedPhoto,
      };

      current.new_public_photo_count += 1;
      if (
        normalizedPhoto.created_at &&
        (!current.latest_public_photo_at || normalizedPhoto.created_at > current.latest_public_photo_at)
      ) {
        current.latest_public_photo_at = normalizedPhoto.created_at;
      }

      statsByShowDate.set(showDate, current);
    });

    // Enrich each show entry with venue info
    for (const [showDate, stats] of statsByShowDate) {
      const saved = savedShowMap.get(showDate);
      if (saved) {
        stats.venue_name = saved.venue_name;
        stats.location = saved.location;
      } else {
        const rawExif = toObjectOrEmpty(stats._firstPhoto?.raw_exif);
        const showMetadata = toObjectOrEmpty(rawExif?.showMetadata);
        const city = showMetadata?.city || null;
        const state = showMetadata?.state || null;
        stats.venue_name = showMetadata?.venueName || null;
        stats.location = [city, state].filter(Boolean).join(', ') || null;
      }
      delete stats._firstPhoto;
    }

    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.floor(Number(limit)))
      : 8;

    const recentShows = Array.from(statsByShowDate.values())
      .sort((left, right) =>
        String(right.latest_public_photo_at || '').localeCompare(String(left.latest_public_photo_at || ''))
      )
      .slice(0, normalizedLimit);

    return { shows: recentShows, error: null };
  } catch (error) {
    return { shows: [], error: error.message };
  }
}

/**
 * Fetch a single saved show by show_date for the current user.
 */
export async function getUserSavedShowByDate(showDate) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { show: null, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('saved_shows')
      .select('*')
      .eq('user_id', user.id)
      .eq('show_date', showDate)
      .maybeSingle();

    if (error) {
      return { show: null, error: error.message };
    }

    return { show: data || null, error: null };
  } catch (error) {
    return { show: null, error: error.message };
  }
}

/**
 * Fetch all user-library photos that match a given show date,
 * with signed URLs included.
 */
export async function getUserPhotosForShow(showDate) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photos: [], error: 'User not authenticated' };
    }

    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .eq('user_id', user.id)
      .eq('matched_show_date', showDate)
      .order('created_at', { ascending: true });

    if (error) {
      return { photos: [], error: error.message };
    }

    const normalizedPhotos = (photos || []).map(withNormalizedVisibility);

    const photosWithUrls = await Promise.all(
      normalizedPhotos.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(photo.storage_path, 60 * 60);
        return { ...photo, url: signedData?.signedUrl || null };
      })
    );

    return { photos: photosWithUrls, error: null };
  } catch (error) {
    return { photos: [], error: error.message };
  }
}

/**
 * Delete a photo from library
 */
export async function deletePhotoFromLibrary(photoId, storagePath) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    if (storagePath) {
      const { error: storageError } = await supabase.storage.from('user-photos').remove([storagePath]);
      if (storageError) {
        return { success: false, error: storageError.message };
      }
    }

    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('id', photoId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Remove a bookmarked show by show_date (for the current user).
 */
export async function removeShowFromLibraryByDate(showDate) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('saved_shows')
      .delete()
      .eq('user_id', user.id)
      .eq('show_date', showDate);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Delete a saved show from library (by row id)
 */
export async function deleteSavedShow(showId) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('saved_shows')
      .delete()
      .eq('id', showId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Toggle a photo's public visibility for the authenticated owner.
 */
export async function togglePhotoVisibility(photoId, isPublic) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('photos')
      .update({ is_public: !!isPublic })
      .eq('id', photoId)
      .eq('user_id', user.id)
      .select('id, is_public')
      .single();

    if (error && isVisibilitySchemaError(error)) {
      const { data: existingPhoto, error: existingError } = await supabase
        .from('photos')
        .select('raw_exif')
        .eq('id', photoId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingError) {
        return { success: false, error: existingError.message };
      }

      const nextRawExif = buildVisibilityAwareRawExif(existingPhoto?.raw_exif, !!isPublic);
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('photos')
        .update({ raw_exif: nextRawExif })
        .eq('id', photoId)
        .eq('user_id', user.id)
        .select('id, raw_exif')
        .single();

      if (fallbackError) {
        return { success: false, error: visibilitySchemaMissingMessage(fallbackError) || fallbackError.message };
      }

      return { success: true, photo: withNormalizedVisibility({ ...fallbackData, is_public: !!isPublic }) };
    }

    if (error) {
      return { success: false, error: visibilitySchemaMissingMessage(error) || error.message };
    }

    return { success: true, photo: withNormalizedVisibility(data) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Fetch public photos for a show, including creator profiles and basic fan stats.
 */
export async function getPublicPhotosForShow(showDate) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photos: [], error: 'User not authenticated' };
    }

    const { data: photos, error } = await supabase
      .from('photos')
      .select('*')
      .eq('matched_show_date', showDate)
      .order('created_at', { ascending: false });

    if (error) {
      return { photos: [], error: visibilitySchemaMissingMessage(error) || error.message };
    }

    const normalizedPhotos = (photos || []).map(withNormalizedVisibility);
    const publicPhotos = normalizedPhotos.filter((photo) => photo.is_public === true);
    const userIds = [...new Set(publicPhotos.map((photo) => photo.user_id).filter(Boolean))];
    if (userIds.length === 0) {
      return { photos: [], error: null };
    }

    const photoIds = publicPhotos.map((p) => p.id);

    const [{ data: profiles, error: profileError }, { data: showRows, error: showRowsError }, { data: userPhotoRows, error: userPhotoRowsError }, { data: likeRows, error: likeRowsError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', userIds),
      supabase
        .from('saved_shows')
        .select('user_id')
        .in('user_id', userIds),
      supabase
        .from('photos')
        .select('user_id, is_public, raw_exif')
        .in('user_id', userIds),
      supabase
        .from('photo_likes')
        .select('photo_id, user_id')
        .in('photo_id', photoIds),
    ]);

    const safeProfiles = profileError ? [] : (profiles || []);
    const safeShowRows = showRowsError ? [] : (showRows || []);
    const safeUserPhotoRows = userPhotoRowsError ? [] : (userPhotoRows || []);
    const safeLikeRows = likeRowsError ? [] : (likeRows || []);

    const profileById = new Map(safeProfiles.map((profile) => [profile.id, profile]));
    const showsAttendedByUser = new Map();
    const publicPhotosByUser = new Map();
    const likeCountByPhoto = new Map();
    const likedByMeSet = new Set();

    safeShowRows.forEach((row) => {
      showsAttendedByUser.set(row.user_id, (showsAttendedByUser.get(row.user_id) || 0) + 1);
    });

    safeUserPhotoRows.forEach((row) => {
      if (normalizePhotoVisibility(row) === true) {
        publicPhotosByUser.set(row.user_id, (publicPhotosByUser.get(row.user_id) || 0) + 1);
      }
    });

    safeLikeRows.forEach((row) => {
      likeCountByPhoto.set(row.photo_id, (likeCountByPhoto.get(row.photo_id) || 0) + 1);
      if (row.user_id === user.id) {
        likedByMeSet.add(row.photo_id);
      }
    });

    const photosWithUrls = await Promise.all(
      publicPhotos.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(photo.storage_path, 60 * 60);

        const creator = profileById.get(photo.user_id) || null;

        return {
          ...photo,
          url: signedData?.signedUrl || null,
          isMine: photo.user_id === user.id,
          like_count: likeCountByPhoto.get(photo.id) || 0,
          liked_by_me: likedByMeSet.has(photo.id),
          creator: creator ? {
            id: creator.id,
            username: creator.username,
            display_name: creator.display_name,
            avatar_url: creator.avatar_url,
            stats: {
              total_shows_attended: showsAttendedByUser.get(photo.user_id) || 0,
              total_public_photos: publicPhotosByUser.get(photo.user_id) || 0,
            },
          } : null,
        };
      })
    );

    return { photos: photosWithUrls, error: null };
  } catch (error) {
    return { photos: [], error: error.message };
  }
}

/**
 * Toggle a like on a public photo for the authenticated user.
 * Returns the new like count and whether the current user has liked it.
 */
export async function togglePhotoLike(photoId) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data: existing } = await supabase
      .from('photo_likes')
      .select('id')
      .eq('photo_id', photoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error: deleteError } = await supabase
        .from('photo_likes')
        .delete()
        .eq('photo_id', photoId)
        .eq('user_id', user.id);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }
    } else {
      const { error: insertError } = await supabase
        .from('photo_likes')
        .insert({ photo_id: photoId, user_id: user.id });

      if (insertError) {
        return { success: false, error: insertError.message };
      }
    }

    const { count } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', photoId);

    return {
      success: true,
      liked: !existing,
      likeCount: count ?? 0,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
/**
 * Fetch all public photos the current user has liked, with signed URLs and show metadata.
 */
export async function getUserLikedPhotos() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photos: [], error: 'User not authenticated' };
    }

    // Get photo IDs the user has liked
    const { data: likeRows, error: likeError } = await supabase
      .from('photo_likes')
      .select('photo_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (likeError) {
      return { photos: [], error: likeError.message };
    }

    if (!likeRows || likeRows.length === 0) {
      return { photos: [], error: null };
    }

    const photoIds = likeRows.map((r) => r.photo_id);
    const likedAtByPhotoId = new Map(likeRows.map((r) => [r.photo_id, r.created_at]));

    // Fetch the photos (only public ones from other users)
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('*')
      .in('id', photoIds)
      .neq('user_id', user.id);

    if (photosError) {
      return { photos: [], error: photosError.message };
    }

    const normalizedPhotos = (photos || []).map(withNormalizedVisibility)
      .filter((p) => p.is_public === true);

    if (normalizedPhotos.length === 0) {
      return { photos: [], error: null };
    }

    // Fetch like counts for these photos
    const { data: allLikeRows } = await supabase
      .from('photo_likes')
      .select('photo_id')
      .in('photo_id', photoIds);

    const likeCountByPhoto = new Map();
    (allLikeRows || []).forEach((row) => {
      likeCountByPhoto.set(row.photo_id, (likeCountByPhoto.get(row.photo_id) || 0) + 1);
    });

    // Fetch creator profiles
    const creatorIds = [...new Set(normalizedPhotos.map((p) => p.user_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', creatorIds);

    const profileById = new Map((profiles || []).map((p) => [p.id, p]));

    // Generate signed URLs and assemble
    const photosWithUrls = await Promise.all(
      normalizedPhotos.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(photo.storage_path, 60 * 60);

        const creator = profileById.get(photo.user_id) || null;

        return {
          ...photo,
          url: signedData?.signedUrl || null,
          like_count: likeCountByPhoto.get(photo.id) || 0,
          liked_by_me: true,
          liked_at: likedAtByPhotoId.get(photo.id) || null,
          creator: creator ? {
            id: creator.id,
            username: creator.username,
            display_name: creator.display_name,
            avatar_url: creator.avatar_url,
          } : null,
        };
      })
    );

    // Sort by when the user liked them (most recent first)
    photosWithUrls.sort((a, b) => String(b.liked_at || '').localeCompare(String(a.liked_at || '')));

    return { photos: photosWithUrls, error: null };
  } catch (error) {
    return { photos: [], error: error.message };
  }
}