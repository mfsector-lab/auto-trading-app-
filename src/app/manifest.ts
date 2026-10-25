import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dark Venus Auto Bot',
    short_name: 'Venus Bot',
    description: 'Dark Venus Auto Bot dashboard with broker connection profiles, MT4/MT5 execution bridge, and live trading controls.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070b17',
    theme_color: '#8b5cf6',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
