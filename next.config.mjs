import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from '@ducanh2912/next-pwa';

const quotaHardenedRuntimeCaching = defaultRuntimeCaching.map((entry) => {
  const cacheName = entry?.options?.cacheName || '';
  const isImageCache = cacheName === 'next-image' || cacheName === 'static-image-assets' || cacheName === 'cross-origin';
  const isDataCache = cacheName === 'apis' || cacheName === 'next-data' || cacheName === 'static-data-assets';

  const existingExpiration = entry?.options?.expiration || {};
  const maxEntries = isImageCache ? 16 : isDataCache ? 16 : existingExpiration.maxEntries;
  const maxAgeSeconds = isImageCache
    ? cacheName === 'cross-origin'
      ? 60 * 30
      : 60 * 60 * 12
    : isDataCache
      ? 60 * 60 * 6
      : existingExpiration.maxAgeSeconds;

  return {
    ...entry,
    options: {
      ...entry.options,
      expiration: {
        ...existingExpiration,
        ...(maxEntries ? { maxEntries } : {}),
        ...(maxAgeSeconds ? { maxAgeSeconds } : {}),
        purgeOnQuotaError: true,
      },
    },
  };
});

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  disable: process.env.NODE_ENV === 'development',
  skipWaiting: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: quotaHardenedRuntimeCaching,
  },
  fallbacks: {
    document: false,
  },
});

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
};

export default withPWA(nextConfig);
