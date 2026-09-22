/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Static export buat Cloudflare Pages — Vercel akan override otomatis kalau ada dynamic route
  // Untuk full Next.js 16 terbaru, output export tetap didukung; Turnstile verify via Worker API eksternal
  output: 'export',
  trailingSlash: true,
  // Next.js 16 terbaru — optimasi
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Fitur terbaru Next.js 16
    optimizePackageImports: ['lucide-react'],
  },
  // Env yang dipakai frontend — Turnstile sitekey + hCaptcha
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || 'https://api.xycloud.my.id',
  },
};

module.exports = nextConfig;
