import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'I Saw U',
    short_name: 'I Saw U',
    description: 'Identify show context from original photo EXIF metadata.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/psychedelic_camera_lens_favicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/psychedelic_camera_lens_favicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/psychedelic_camera_lens_favicon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    share_target: {
      action: '/api/share-target',
      method: 'post',
      enctype: 'multipart/form-data',
      params: {
        files: [
          {
            name: 'files',
            accept: ['image/jpeg', 'image/heic', 'image/heif', 'image/png', 'image/*'],
          },
        ],
      },
    },
  } as unknown as MetadataRoute.Manifest;
}
