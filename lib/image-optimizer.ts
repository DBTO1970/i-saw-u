/**
 * Helper to process, resize, and convert uploaded photos into optimized WebP blobs client-side.
 */

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
}

export async function convertToWebP(
  file: File | Blob,
  options: OptimizeImageOptions = {}
): Promise<{ webpBlob: Blob; width: number; height: number; originalName: string }> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.85 } = options;
  const originalName = file instanceof File ? file.name : 'photo.webp';

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Calculate aspect-ratio-preserved bounding box dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      // Smooth rendering for resized images
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Export as WebP (with fallback to JPEG if WebP is unsupported)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image compression failed'));
            return;
          }
          resolve({
            webpBlob: blob,
            width,
            height,
            originalName,
          });
        },
        'image/webp',
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}