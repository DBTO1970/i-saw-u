'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deletePhotoFromLibrary } from '../app/actions/user-library';

export default function LibraryPhotoDeleteButton({ photoId, storagePath, className, label = 'Delete' }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const shouldDelete = window.confirm('Delete this photo from your library? This cannot be undone.');
    if (!shouldDelete) {
      return;
    }

    setIsDeleting(true);
    const response = await deletePhotoFromLibrary(photoId, storagePath);
    if (!response?.success) {
      window.alert(response?.error || 'Failed to delete photo.');
      setIsDeleting(false);
      return;
    }

    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className={className}
    >
      {isDeleting ? 'Deleting...' : label}
    </button>
  );
}
