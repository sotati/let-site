import type { Metadata, Viewport } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://human-oracle.vercel.app');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Human Oracle — Give it to a stranger', template: '%s — Human Oracle' },
  description: 'Hand a small yes-or-no dilemma to one random human somewhere in the world.',
  applicationName: 'Human Oracle',
  keywords: ['decision making', 'yes or no', 'overthinking', 'human judgment'],
  authors: [{ name: 'Human Oracle' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Human Oracle',
    description: 'Give it to a stranger. One question. One human.',
    url: '/',
    siteName: 'Human Oracle',
    images: [{ url: '/og.jpg', width: 1734, height: 907, alt: 'Human Oracle — Give it to a stranger.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Human Oracle',
    description: 'Give it to a stranger. One question. One human.',
    images: ['/og.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c0c0b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
