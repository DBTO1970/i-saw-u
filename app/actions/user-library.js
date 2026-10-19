'use server';

import { createClient } from '../../lib/supabase/server';
import { createHash } from 'crypto';
import {
  buildPublicStorageUrl,
  buildPublicThumbnailUrl,
  toThumbnailStoragePath,
} from '../../lib/supabase/config';

function toObjectOrEmpty(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function isMeaningfulValue(value) {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function mergeShowData(existingShowData, incomingShowData) {
  const merged = { ...toObjectOrEmpty(existingShowData) };
  const incoming = toObjectOrEmpty(incomingShowData);

  Object.entries(incoming).forEach(([key, value]) => {
    if (isMeaningfulValue(value)) {
      merged[key] = value;
    }
  });

  return merged;
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

function withPhotoUrls(photo) {
  if (!photo?.storage_path) {
    return {
      ...photo,
      photo_url: null,
      thumb_url: null,
      url: null,
    };
  }

  const photoUrl = buildPublicStorageUrl(photo.storage_path);
  const thumbUrl = buildPublicThumbnailUrl(photo.storage_path) || photoUrl;

  return {
    ...photo,
    photo_url: photoUrl,
    thumb_url: thumbUrl,
    url: photoUrl,
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
  const thumbnailStoragePath = toThumbnailStoragePath(storagePath);
  const storagePaths = thumbnailStoragePath && thumbnailStoragePath !== storagePath
    ? [storagePath, thumbnailStoragePath]
    : [storagePath];
  try {
    await supabase.storage.from('user-photos').remove(storagePaths);
  } catch (error) {
    console.error('Storage cleanup failed after photo save error:', {
      storagePath,
      thumbnailStoragePath,
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
    const isPublicRaw = formData.get('isPublic');
    const submittedIsPublic = isPublicRaw === true || (typeof isPublicRaw === 'string' && (isPublicRaw === 'true' || isPublicRaw === '1'));
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
    const showFolder = matchedShowDate || photoId;
    let storagePath = hasDirectUploadMetadata ? directStoragePath : `${user.id}/${showFolder}/${photoId}.webp`;
    let mimeType = hasDirectUploadMetadata && typeof directMimeType === 'string' && directMimeType.trim()
      ? directMimeType.trim()
      : 'image/webp';
    let fileSize = null;
    let photoHash = submittedPhotoHash;

    if (!storagePath.startsWith(`${user.id}/`)) {
      return { success: false, error: 'Invalid storage path for authenticated user.' };
    }

    if (hasServerUploadFile) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      photoHash = createHash('sha256').update(buffer).digest('hex');

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(storagePath, buffer, {
          contentType: 'image/webp',
          cacheControl: '31536000',
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
      raw_exif: buildVisibilityAwareRawExif(parsedRawExif, !!submittedIsPublic),
      is_public: !!submittedIsPublic,
    };

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

export async function saveShowToLibrary(showDate, showData, userNotes = '') {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'User is not authenticated.' };
    }

    const { data: existingShow, error: existingShowError } = await supabase
      .from('saved_shows')
      .select('show_data, venue_name, location')
      .eq('user_id', user.id)
      .eq('show_date', showDate)
      .maybeSingle();

    if (existingShowError) {
      console.error('Load Existing Show DB Error:', existingShowError);
      return { success: false, error: existingShowError.message };
    }

    const mergedShowData = mergeShowData(existingShow?.show_data, showData);
    const normalizedVenueName = showData?.venue || showData?.venue_name || showData?.venueName || existingShow?.venue_name || null;
    const normalizedLocation = showData?.location || existingShow?.location || null;

    const { data, error } = await supabase
      .from('saved_shows')
      .upsert({
        user_id: user.id,
        show_date: showDate,
        venue_name: normalizedVenueName,
        location: normalizedLocation,
        show_data: mergedShowData,
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

export async function getUserLibraryPhotos() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { photos: [], error: 'User not authenticated' };
    }

    const { data: photos, error } = await supabase
      .from('photos')
      .select('id, user_id, storage_path, file_name, file_size, mime_type, date_taken, time_taken, is_public, matched_show_date, show_start_time, photo_hash, raw_exif, created_at')
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

    const photosWithUrls = await Promise.all(
      normalizedPhotos.map(async (photo) => {
        return {
          ...withPhotoUrls(photo),
          like_count: likeCountByPhoto.get(photo.id) || 0,
        };
      })
    );

    return { photos: photosWithUrls, error: null };
  } catch (error) {
    return { photos: [], error: error.message };
  }
}

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

    const { count: likeCount } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', photo.id);

    const normalizedPhoto = withNormalizedVisibility(photo);

    return {
      photo: {
        ...withPhotoUrls(normalizedPhoto),
        like_count: likeCount || 0,
      },
      error: null,
    };
  } catch (error) {
    return { photo: null, error: error.message };
  }
}

export async function getUserLibraryPhotoSiblings(photoId) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { previousPhotoId: null, nextPhotoId: null, error: 'User not authenticated' };
    }

    const { data: current, error: currentError } = await supabase
      .from('photos')
      .select('id, created_at')
      .eq('id', photoId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (currentError) {
      return { previousPhotoId: null, nextPhotoId: null, error: currentError.message };
    }
    if (!current) {
      return { previousPhotoId: null, nextPhotoId: null, error: 'Photo not found' };
    }

    const [{ data: prevRows }, { data: nextRows }] = await Promise.all([
      supabase
        .from('photos')
        .select('id')
        .eq('user_id', user.id)
        .gt('created_at', current.created_at)
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('photos')
        .select('id')
        .eq('user_id', user.id)
        .lt('created_at', current.created_at)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    return {
      previousPhotoId: prevRows?.[0]?.id ?? null,
      nextPhotoId: nextRows?.[0]?.id ?? null,
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

    // Parse visibility from payload (accept either isPublic or is_public)
    const isPublicRaw = typeof payload?.isPublic !== 'undefined' ? payload.isPublic : (typeof payload?.is_public !== 'undefined' ? payload.is_public : undefined);
    const hasSubmittedIsPublic = typeof isPublicRaw === 'boolean' || typeof isPublicRaw === 'string';
    const submittedIsPublic = typeof isPublicRaw === 'boolean' ? isPublicRaw : (typeof isPublicRaw === 'string' ? (isPublicRaw === 'true' || isPublicRaw === '1') : null);

    // Apply show metadata first, then apply visibility into raw_exif if provided
    let nextRawExif = applyShowMetadata(rawExifValue, updates.matched_show_date, updates.show_start_time);
    if (hasSubmittedIsPublic) {
      nextRawExif = buildVisibilityAwareRawExif(nextRawExif, !!submittedIsPublic);
    }

    const updatesWithRawExif = {
      file_name: toNullableText(payload?.fileName) || 'Untitled photo',
      date_taken: toNullableDate(payload?.dateTaken),
      time_taken: toNullableTime(payload?.timeTaken),
      show_start_time: updates.show_start_time,
      matched_show_date: updates.matched_show_date,
      gps_latitude: toNullableFloat(payload?.gpsLatitude),
      gps_longitude: toNullableFloat(payload?.gpsLongitude),
      raw_exif: nextRawExif,
    };

    if (hasSubmittedIsPublic) {
      updatesWithRawExif.is_public = !!submittedIsPublic;
    }

    const { data, error } = await supabase
      .from('photos')
      .update(updatesWithRawExif)
      .eq('id', photoId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    // If DB schema is missing is_public and we tried to write it, fall back to updating raw_exif only
    if (error && isVisibilitySchemaError(error) && hasSubmittedIsPublic) {
      const fallbackPayload = { ...updatesWithRawExif };
      delete fallbackPayload.is_public;
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('photos')
        .update(fallbackPayload)
        .eq('id', photoId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (fallbackError) {
        return { success: false, error: visibilitySchemaMissingMessage(fallbackError) || fallbackError.message };
      }

      return { success: true, photo: fallbackData };
    }

    if (error || !data) {
      return { success: false, error: error?.message || 'Failed to update photo metadata.' };
    }

    return { success: true, photo: data };
  } catch (error) {
    return { success: false, error: error.message || 'Failed to update photo metadata.' };
  }
}

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

    // Fetch only the matched_show_date for other users' public photos — no raw_exif, no full-table scan.
    let publicPhotoCounts = new Map();
    const { data: publicPhotoRows, error: publicPhotoError } = await supabase
      .from('photos')
      .select('matched_show_date')
      .neq('user_id', user.id)
      .eq('is_public', true)
      .not('matched_show_date', 'is', null);

    if (!publicPhotoError) {
      (publicPhotoRows || []).forEach((row) => {
        publicPhotoCounts.set(row.matched_show_date, (publicPhotoCounts.get(row.matched_show_date) || 0) + 1);
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

// rest of file unchanged
