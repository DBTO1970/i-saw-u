/**
 * Helper to process, resize, and convert uploaded photos into optimized WebP blobs client-side.
 */

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.0 to 1.0
}

export interface AdaptiveWebPOptions {
  targetMaxBytes?: number;
  maxWidth?: number;
  maxHeight?: number;
  qualitySteps?: number[];
  dimensionScales?: number[];
}

export interface PhotoUploadOptimizationResult {
  fullBlob: Blob;
  thumbBlob: Blob;
  fullWidth: number;
  fullHeight: number;
  thumbWidth: number;
  thumbHeight: number;
  originalName: string;
  fullQuality: number;
  thumbQuality: number;
}

function getOriginalName(file: File | Blob): string {
  return file instanceof File ? file.name : 'photo.webp';
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };

    img.src = objectUrl;
  });
}

function getScaledDimensions(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number) {
  let width = sourceWidth;
  let height = sourceHeight;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  return { width, height };
}

async function renderWebPBlob(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width, height } = getScaledDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxWidth, maxHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Image compression failed'));
        return;
      }
      resolve(result);
    }, 'image/webp', quality);
  });

  return { blob, width, height };
}

export async function convertToWebP(
  file: File | Blob,
  options: OptimizeImageOptions = {}
): Promise<{ webpBlob: Blob; width: number; height: number; originalName: string }> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.85 } = options;
  const originalName = getOriginalName(file);
  const img = await loadImage(file);
  const { blob, width, height } = await renderWebPBlob(img, maxWidth, maxHeight, quality);

  return {
    webpBlob: blob,
    width,
    height,
    originalName,
  };
}

export async function processPhotoForUpload(
  file: File | Blob
): Promise<PhotoUploadOptimizationResult> {
  const originalName = getOriginalName(file);
  const img = await loadImage(file);

  const fullQuality = 0.85;
  const thumbQuality = 0.7;
  const fullSize = await renderWebPBlob(img, 1920, 1920, fullQuality);
  const thumbSize = await renderWebPBlob(img, 400, 400, thumbQuality);

  return {
    fullBlob: fullSize.blob,
    thumbBlob: thumbSize.blob,
    fullWidth: fullSize.width,
    fullHeight: fullSize.height,
    thumbWidth: thumbSize.width,
    thumbHeight: thumbSize.height,
    originalName,
    fullQuality,
    thumbQuality,
  };
}

export async function convertToAdaptiveWebP(
  file: File | Blob,
  options: AdaptiveWebPOptions = {}
): Promise<{
  webpBlob: Blob;
  width: number;
  height: number;
  originalName: string;
  appliedQuality: number;
  appliedMaxWidth: number;
  appliedMaxHeight: number;
}> {
  const {
    targetMaxBytes = 1_900_000,
    maxWidth = 1920,
    maxHeight = 1920,
    qualitySteps = [0.85, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48, 0.42],
    dimensionScales = [1, 0.9, 0.8, 0.7, 0.6],
  } = options;

  let bestResult: { webpBlob: Blob; width: number; height: number; originalName: string } | null = null;
  let bestQuality = qualitySteps[0] || 0.85;
  let bestWidth = maxWidth;
  let bestHeight = maxHeight;

  for (const scale of dimensionScales) {
    const scaledWidth = Math.max(640, Math.round(maxWidth * scale));
    const scaledHeight = Math.max(640, Math.round(maxHeight * scale));

    for (const quality of qualitySteps) {
      const result = await convertToWebP(file, {
        maxWidth: scaledWidth,
        maxHeight: scaledHeight,
        quality,
      });

      if (!bestResult || result.webpBlob.size < bestResult.webpBlob.size) {
        bestResult = result;
        bestQuality = quality;
        bestWidth = scaledWidth;
        bestHeight = scaledHeight;
      }

      if (result.webpBlob.size <= targetMaxBytes) {
        return {
          ...result,
          appliedQuality: quality,
          appliedMaxWidth: scaledWidth,
          appliedMaxHeight: scaledHeight,
        };
      }
    }
  }

  if (!bestResult) {
    throw new Error('Adaptive WebP conversion failed to produce an output image.');
  }

  return {
    ...bestResult,
    appliedQuality: bestQuality,
    appliedMaxWidth: bestWidth,
    appliedMaxHeight: bestHeight,
  };
}