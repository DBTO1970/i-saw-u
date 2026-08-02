import './globals.css';

export const metadata = {
  title: 'I Saw U',
  description: 'Upload an image and inspect its EXIF metadata to compare it to the phish.net api.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/psychedelic_camera_lens_favicon.png', type: 'image/png' }],
    shortcut: [{ url: '/psychedelic_camera_lens_favicon.png', type: 'image/png' }],
    apple: [{ url: '/psychedelic_camera_lens_favicon.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
