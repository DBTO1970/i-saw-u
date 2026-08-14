import './globals.css';
import { Analytics } from "@vercel/analytics/next"

export const metadata = {
  title: 'I Saw U',
  description: 'Upload an image and inspect its EXIF metadata to compare it to the phish.net api.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: [{ url: '/icon.png', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
