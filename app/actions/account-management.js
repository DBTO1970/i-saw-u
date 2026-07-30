'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient } from '../../lib/supabase/server';

export async function deleteAllUserPhotosAction() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'You must be signed in to delete your photos.' };
    }

    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('id, storage_path')
      .eq('user_id', user.id);

    if (photosError) {
      return { success: false, error: photosError.message };
    }

    const storagePaths = Array.from(new Set((photos || []).map((photo) => photo.storage_path).filter(Boolean)));

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from('user-photos').remove(storagePaths);
      if (storageError && !/not found|does not exist/i.test(storageError.message || '')) {
        return { success: false, error: storageError.message };
      }
    }

    const { error: deleteError } = await supabase
      .from('photos')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/library');

    return {
      success: true,
      deletedPhotoCount: photos?.length || 0,
      message: `Deleted ${photos?.length || 0} photo${(photos?.length || 0) === 1 ? '' : 's'}.`,
    };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to delete your photos right now.' };
  }
}

export async function deleteUserAccountAction() {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'You must be signed in to delete your account.' };
    }

    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (error) {
      return { success: false, error: error.message || 'Account deletion is unavailable because the service-role key is not configured.' };
    }

    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('id, storage_path')
      .eq('user_id', user.id);

    if (photosError) {
      return { success: false, error: photosError.message };
    }

    const storagePaths = Array.from(new Set((photos || []).map((photo) => photo.storage_path).filter(Boolean)));
    if (storagePaths.length > 0) {
      const { error: storageError } = await adminClient.storage.from('user-photos').remove(storagePaths);
      if (storageError && !/not found|does not exist/i.test(storageError.message || '')) {
        return { success: false, error: storageError.message };
      }
    }

    const cleanupOperations = await Promise.all([
      adminClient.from('photos').delete().eq('user_id', user.id),
      adminClient.from('saved_shows').delete().eq('user_id', user.id),
      adminClient.from('profiles').delete().eq('id', user.id),
    ]);

    const cleanupError = cleanupOperations.find((operation) => operation.error);
    if (cleanupError?.error) {
      return { success: false, error: cleanupError.error.message };
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteAuthError) {
      return { success: false, error: deleteAuthError.message };
    }

    await supabase.auth.signOut();
    revalidatePath('/');

    return {
      success: true,
      message: 'Your account and its associated photos were deleted.',
    };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to delete your account right now.' };
  }
}
