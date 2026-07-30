'use server';

import { createClient } from '../../lib/supabase/server';

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

    if (!file || typeof file === 'string') {
      return { success: false, error: 'No image file provided.' };
    }

    const photoId = crypto.randomUUID();
    const storagePath = `${user.id}/${photoId}.webp`;

    // 1. Upload to Supabase Storage bucket 'user-photos'
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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

    const baseInsertPayload = {
      id: photoId,
      user_id: user.id,
      storage_path: storagePath,
      file_name: fileName,
      file_size: buffer.length,
      mime_type: 'image/webp',
      date_taken: dateTaken && dateTaken !== 'Not available' ? dateTaken : null,
      time_taken: timeTaken && timeTaken !== 'Not available' ? timeTaken : null,
      gps_latitude: gpsLatitudeRaw ? parseFloat(gpsLatitudeRaw) : null,
      gps_longitude: gpsLongitudeRaw ? parseFloat(gpsLongitudeRaw) : null,
      matched_show_date: matchedShowDate,
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

      if (fallbackDbError) {
        console.error('DB Insert Error:', fallbackDbError);
        return { success: false, error: fallbackDbError.message };
      }

      return { success: true, photo: withNormalizedVisibility(fallbackPhotoRecord) };
    }

    if (dbError) {
      console.error('DB Insert Error:', dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true, photo: withNormalizedVisibility(photoRecord) };
  } catch (error) {
    console.error('savePhotoToLibrary Error:', error);
    return { success: false, error: error.message || 'Failed to save photo.' };
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

    // Generate signed URLs for private photos
    const photosWithUrls = await Promise.all(
      normalizedPhotos.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(photo.storage_path, 60 * 60); // 1 hour valid link
        return {
          ...photo,
          url: signedData?.signedUrl || null,
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

    return {
      photo: {
        ...withNormalizedVisibility(photo),
        url: signedData?.signedUrl || null,
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

    const { data: savedShow, error: savedShowError } = await supabase
      .from('saved_shows')
      .select('id')
      .eq('user_id', user.id)
      .eq('show_date', showDate)
      .maybeSingle();

    if (savedShowError) {
      return { photos: [], error: savedShowError.message };
    }

    if (!savedShow) {
      return { photos: [], error: 'Bookmark this show to view the fan gallery.' };
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

    const [{ data: profiles, error: profileError }, { data: showRows, error: showRowsError }, { data: userPhotoRows, error: userPhotoRowsError }] = await Promise.all([
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
    ]);

    const safeProfiles = profileError ? [] : (profiles || []);
    const safeShowRows = showRowsError ? [] : (showRows || []);
    const safeUserPhotoRows = userPhotoRowsError ? [] : (userPhotoRows || []);

    const profileById = new Map(safeProfiles.map((profile) => [profile.id, profile]));
    const showsAttendedByUser = new Map();
    const publicPhotosByUser = new Map();

    safeShowRows.forEach((row) => {
      showsAttendedByUser.set(row.user_id, (showsAttendedByUser.get(row.user_id) || 0) + 1);
    });

    safeUserPhotoRows.forEach((row) => {
      if (normalizePhotoVisibility(row) === true) {
        publicPhotosByUser.set(row.user_id, (publicPhotosByUser.get(row.user_id) || 0) + 1);
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
